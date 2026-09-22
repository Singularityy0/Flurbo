"""Dashboard snapshot/quote/receipt validation without network or signing."""

import copy
import unittest

from check_monad_readiness import CheckError
from dashboard_data import Dashboard, DashboardRpc
from scan_arbitrage import abi
from serve_dashboard import route
from test_demo_manifest import FakeRpc as ManifestRpc, fixture, NETWORK
from verify_demo import verify

TX = "0x" + "12" * 32


class FakeRpc(ManifestRpc):
    def __init__(self, m):
        super().__init__(m)
        self.m = m
        self.quote_rejected = False
        self.tx, self.receipt = None, None
        self.changed_tip = False
        self.pool_reads = 0
        self.values[(m["pool"], "1bb51c6a")] = [128]
        self.values[(m["pool"], "a6a83dde")] = [740737]
        self.values[(m["pool"], "f29d0ba9")] = [718945]
        self.values[(m["market"], "b4de8b70")] = [450000000000000000, 500000000000000000]
        self.values[(m["cash"], "dd62ed3e")] = [2**256 - 1]
        self.values[(m["margin"], "d4fac45d")] = [0]

    def __call__(self, method, params):
        if method == "eth_getBalance":
            self.calls.append((method, params))
            return hex(10**22)
        if method == "eth_getTransactionByHash": return self.tx
        if method == "eth_getTransactionReceipt": return self.receipt
        if method == "eth_call":
            sig = params[0]["data"][2:10]
            self.pool_reads += 1
            if sig in ("a6a83dde", "f29d0ba9") and self.quote_rejected:
                raise CheckError("RPC rejected read")
        result = super().__call__(method, params)
        if method == "eth_getBlockByNumber" and params[0] != "latest" and self.changed_tip and self.pool_reads:
            result["hash"] = "0x" + "cc" * 32
        return result


def setup(clock=lambda: 1000):
    m = fixture()
    m = verify(m, NETWORK, ManifestRpc(m))
    m["environment"] = "local_fork"
    rpc = FakeRpc(m)
    return Dashboard(m, NETWORK, rpc, "local_fork", clock), rpc, m


class DashboardTests(unittest.TestCase):
    def test_no_wallet_is_not_a_fabricated_account(self):
        model, rpc, _ = setup()
        result = model.snapshot()
        self.assertIsNone(result["wallet"])
        self.assertTrue(result["trading_available"])
        self.assertEqual(result["cluster"]["events"][7]["label"], "Synthetic event H")
        self.assertEqual(result["pool"]["required_collateral_atoms"], "10000000")
        self.assertEqual(result["kuru"]["best_bid_wad"], "450000000000000000")
        for method, params in rpc.calls:
            if method in ("eth_call", "eth_getCode"): self.assertEqual(params[-1], "0x64")

    def test_wallet_amounts_are_exact_strings_and_positions_are_scoped(self):
        model, _, m = setup()
        result = model.snapshot(m["operator"], [(128, 2), (3, 8)])
        w = result["wallet"]
        self.assertEqual(w["native_balance_wei"], str(10**22))
        self.assertEqual(w["pool_allowance_atoms"], str(2**256 - 1))
        self.assertEqual(w["positions_scope"], "requested_claims_only")
        self.assertEqual(len(w["positions"]), 2)
        self.assertEqual(w["margin_available_receipt_atoms"], "0")

    def test_quotes_are_pool_amounts_not_midpoints_or_ownership_approvals(self):
        model, _, _ = setup()
        for side, expected in (("buy", "740737"), ("sell", "718945")):
            result = model.quote(side, 128, 2, 1000000)
            self.assertEqual(result["quote"]["collateral_atoms"], expected)
            self.assertFalse(result["quote"]["ownership_checked"])
            self.assertTrue(result["quote"]["requires_execution_recheck"])

    def test_stale_data_is_flagged_and_quote_removed(self):
        model, rpc, _ = setup(clock=lambda: 1031)
        self.assertFalse(model.snapshot()["trading_available"])
        self.assertIsNone(model.quote("buy", 128, 2, 1000000)["quote"])
        self.assertFalse(any(p[0].get("data", "")[2:10] == "a6a83dde" for method, p in rpc.calls if method == "eth_call"))

    def test_closed_and_resolved_pools_remain_readable(self):
        model, rpc, m = setup()
        model.m["closes_at"] = 999
        rpc.values[(m["pool"], "39a3a99a")] = [999]
        self.assertEqual(model.snapshot()["pool"]["phase"], "closed")
        self.assertIsNone(model.quote("buy", 128, 2, 1000)["quote"])
        rpc.values[(m["pool"], "3f6fa655")] = [1]
        result = model.snapshot()
        self.assertEqual(result["pool"]["phase"], "resolved")
        self.assertEqual(result["pool"]["resolved_state"], 128)

    def test_shortfall_and_escrow_mismatch_disable_trading(self):
        for selector, value in (("b53105a3", 999999999), ("90fc2c7b", 1)):
            model, rpc, m = setup()
            rpc.values[(m["pool"], selector)] = [value]
            self.assertFalse(model.snapshot()["trading_available"])
            self.assertIsNone(model.quote("buy", 128, 2, 1000)["quote"])

    def test_manifest_environment_code_and_reorg_fail_closed(self):
        model, rpc, m = setup()
        for field, value in (("status", "unverified"), ("environment", "public_testnet"), ("rules", "real event")):
            bad = copy.deepcopy(m); bad[field] = value
            with self.assertRaises(CheckError): Dashboard(bad, NETWORK, rpc, "local_fork")
        rpc.empty_code = True
        with self.assertRaises(CheckError): model.snapshot()
        model, rpc, m = setup(); rpc.changed_tip = True
        with self.assertRaises(CheckError): model.snapshot()

    def test_quote_rejection_does_not_fall_back_to_cached_price(self):
        model, rpc, _ = setup(); rpc.quote_rejected = True
        result = model.quote("buy", 3, 8, 1000000)
        self.assertEqual(result["quote_status"], "unavailable")
        self.assertIsNone(result["quote"])

    def test_transaction_unknown_pending_success_revert_and_reorg(self):
        model, rpc, m = setup()
        self.assertEqual(model.transaction(TX)["transaction"]["status"], "unknown")
        rpc.tx = {"hash": TX, "from": m["operator"], "to": m["pool"], "blockNumber": None}
        self.assertEqual(model.transaction(TX)["transaction"]["status"], "pending")
        rpc.receipt = {"transactionHash": TX, "blockNumber": "0x64", "blockHash": "0x" + "aa" * 32,
                       "status": "0x1", "gasUsed": "0x5208"}
        item = model.transaction(TX)["transaction"]
        self.assertEqual((item["status"], item["confirmations"], item["gas_used"]), ("succeeded", 1, "21000"))
        rpc.receipt["status"] = "0x0"
        self.assertEqual(model.transaction(TX)["transaction"]["status"], "reverted")
        rpc.receipt["blockHash"] = "0x" + "bb" * 32
        with self.assertRaises(CheckError): model.transaction(TX)

    def test_requests_cannot_add_arbitrary_rpcs_or_invalid_claims(self):
        model, _, _ = setup()
        for path in ("/api/send", "/api/state?wallet=x&wallet=y", "/api/state?rpc=https://example.org",
                     "/api/quote?side=buy&scope=15&mask=2&quantity=1", "/api/state?claims=1:3",
                     "/api/quote?side=buy&scope=1&mask=2&quantity=0"):
            with self.subTest(path=path), self.assertRaises(ValueError): route(model, path)
        rpc = DashboardRpc("https://example.invalid")
        for method in ("eth_sendTransaction", "eth_sendRawTransaction", "eth_sign", "eth_estimateGas", "anvil_setBalance"):
            with self.assertRaises(CheckError): rpc(method, [])
        self.assertEqual(rpc.counter, 0)


if __name__ == "__main__": unittest.main()
