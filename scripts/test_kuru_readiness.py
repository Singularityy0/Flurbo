"""Offline unit/ABI/read-only boundary tests for the Kuru draft."""

import json
import unittest

from check_monad_readiness import CONFIG, CheckError, Rpc
from check_kuru_readiness import inspect, words
from kuru_order_plan import CONFIG as PLAN

NETWORK = json.loads(CONFIG.read_text())["networks"]["testnet"]
DRAFT = json.loads(PLAN.read_text())


def abi(*values):
    return "0x" + "".join(f"{value:064x}" for value in values)


class FakeRpc:
    def __init__(self):
        self.calls = []
        self.chain = "0x279f"
        self.changed_block = False
        self.empty_code = False
        self.returns = {
            "0xa0416499": abi(1), "0x483100bd": abi(int(NETWORK["contracts"]["kuru_margin"], 16)),
            "0xa574b091": abi(2), "0x313ce567": abi(6),
            "0x90c9427c": abi(1000000, 1000000, 0, 18, 3, 6, 100, 10000, 100000000, 30, 10),
        }

    def __call__(self, method, params):
        self.calls.append((method, params))
        if method == "eth_chainId":
            return self.chain
        if method == "eth_getBlockByNumber":
            changed = self.changed_block and params[0] != "latest"
            return {"number": "0x123", "hash": "0x" + ("bb" if changed else "aa") * 32}
        if method == "eth_getCode":
            return "0x" if self.empty_code else "0x6000"
        if method == "eth_call":
            return self.returns[params[0]["data"]]
        raise AssertionError("Unexpected RPC method")


class ProbeTests(unittest.TestCase):
    def test_probe_reads_one_snapshot_and_returns_limited_evidence(self):
        rpc = FakeRpc()
        result = inspect(NETWORK, DRAFT, rpc)
        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["block_number"], 0x123)
        self.assertEqual(result["contracts"]["router"]["code_bytes"], 2)
        for method, params in rpc.calls:
            if method in ("eth_call", "eth_getCode"):
                self.assertEqual(params[-1], "0x123")
        self.assertIn("no source equivalence", result["scope"])

    def test_wrong_chain_stops_before_contract_reads(self):
        rpc = FakeRpc()
        rpc.chain = "0x8f"
        with self.assertRaises(CheckError):
            inspect(NETWORK, DRAFT, rpc)
        self.assertEqual(rpc.calls, [("eth_chainId", [])])

    def test_mismatched_margin_decimals_and_abi_fail(self):
        for selector, result in (("0x483100bd", abi(99)), ("0x313ce567", abi(18)),
                                 ("0xa0416499", abi(2**160)), ("0x90c9427c", abi(1, 2)),
                                 ("0x90c9427c", abi(1000000, 1000000, 0, 18, 3, 6, 100, 1, 2**96, 30, 10))):
            with self.subTest(selector=selector), self.assertRaises(CheckError):
                rpc = FakeRpc()
                rpc.returns[selector] = result
                inspect(NETWORK, DRAFT, rpc)

    def test_missing_code_and_reorg_fail(self):
        for field in ("empty_code", "changed_block"):
            with self.subTest(field=field), self.assertRaises(CheckError):
                rpc = FakeRpc()
                setattr(rpc, field, True)
                inspect(NETWORK, DRAFT, rpc)

    def test_strict_abi_shape(self):
        for result in ("0x", "0x01", abi(1) + "00", None):
            with self.subTest(result=result), self.assertRaises(CheckError):
                words(result, 1)

    def test_transport_rejects_signing_and_broadcast_methods_before_network(self):
        for method in ("eth_sendTransaction", "eth_sendRawTransaction", "eth_sign", "personal_sign"):
            with self.subTest(method=method), self.assertRaises(CheckError):
                Rpc("https://unused.invalid")(method, [])


if __name__ == "__main__":
    unittest.main()
