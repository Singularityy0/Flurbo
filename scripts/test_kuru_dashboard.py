"""Kuru order views must not treat retained, filled storage as open liquidity."""
import unittest
from unittest.mock import patch

from check_monad_readiness import CheckError
from kuru_dashboard import snapshot, scanner
from scan_arbitrage import abi
from test_dashboard_data import setup


class KuruViews(unittest.TestCase):
    def fixture(self):
        model, rpc, m = setup()
        rpc.values[(m["market"], "2bf1360e")] = [25]
        rpc.values[(m["receipt"], "dd62ed3e")] = [123]
        original = model.rpc
        def read(method, params):
            if method == "eth_getLogs":
                self.assertLessEqual(int(params[0]["toBlock"], 16) - int(params[0]["fromBlock"], 16), 99)
                return []
            if method == "eth_call":
                sig = params[0]["data"][2:10]
                if sig == "1c0d9c22":
                    n = int(params[0]["data"][10:], 16)
                    return abi("", int(m["operator"], 16) if n != 24 else 99, 1000000, 0, 0, 0, 450000, 0, 1)
                if sig == "e6d29b51": return abi("", 23, 25)
            return original(method, params)
        model.rpc = read
        return model, rpc, m

    def test_pagination_filters_other_owners_and_filled_storage(self):
        model, _, m = self.fixture()
        result = snapshot(model, m["operator"])
        self.assertEqual([o["id"] for o in result["orders"]], ["25", "23"])
        self.assertEqual(result["orders_page"]["next_before"], "6")
        self.assertEqual(result["wallet"]["receipt_margin_allowance_atoms"], "123")
        self.assertTrue(result["read_only"])
        older = snapshot(model, m["operator"], 6)
        self.assertEqual(older["orders"], [])
        self.assertIsNone(older["orders_page"]["next_before"])

    def test_wrong_registration_and_bad_cursor_rejected(self):
        model, rpc, m = self.fixture()
        for cursor in [-1, 2**40]:
            with self.assertRaises(ValueError): snapshot(model, m["operator"], cursor)
        rpc.values[(m["margin"], "5f71a07c")] = [0]
        with self.assertRaises(CheckError): snapshot(model, m["operator"])

    def test_scanner_binds_manifest_caps_and_never_returns_signable_payload(self):
        model, _, m = self.fixture()
        with patch("kuru_dashboard.scan", return_value={"candidates": [{"unsigned_transaction": {"data": "0x1234"}, "status": "simulated_candidate"}]}) as mocked:
            result = scanner(model, 1000000, 300000000000)
            self.assertNotIn("unsigned_transaction", result["candidates"][0])
            config = mocked.call_args.args[0]
            self.assertEqual(config["operator"], m["operator"])
            self.assertEqual(config["market"], m["market"])
            self.assertEqual(config["max_head_advance"], 10)
        for conversion, fee in [(0, 1), (10**9 + 1, 1), (1, 500000000001)]:
            with self.assertRaises(ValueError): scanner(model, conversion, fee)


if __name__ == "__main__": unittest.main()
