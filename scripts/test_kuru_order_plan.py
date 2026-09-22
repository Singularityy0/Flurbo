"""Offline order units and ABI encoding tests."""

import json
import unittest
from kuru_order_plan import CONFIG, cancel_calldata, plan_order, validate

DRAFT = json.loads(CONFIG.read_text())


class OrderPlanTests(unittest.TestCase):
    def test_default_buy_exact_units_and_cast_calldata(self):
        result = plan_order(DRAFT, "buy", "0.50", "1")
        self.assertEqual((result["price_units"], result["size_units"], result["required_margin_atoms"]), (500000, 1000000, 500000))
        self.assertEqual(result["order_calldata"],
            "0xa09e9040000000000000000000000000000000000000000000000000000000000007a120"
            "00000000000000000000000000000000000000000000000000000000000f4240"
            "0000000000000000000000000000000000000000000000000000000000000001")

    def test_sell_uses_base_margin_and_post_only(self):
        result = plan_order(DRAFT, "sell", "0.75", "2.50")
        self.assertEqual(result["required_margin_atoms"], 2500000)
        self.assertEqual(result["quote_atoms"], 1875000)
        self.assertTrue(result["post_only"])
        self.assertTrue(result["order_calldata"].startswith("0x40e79b1b"))

    def test_grid_boundary_and_full_cancel_reserve_are_exact(self):
        for tick in (1, 2, 4999, 5000, 9999, 10000):
            for step in (1, 2, 101, 10000):
                price = f"{tick // 10000}.{tick % 10000:04}"
                size = f"{step // 100}.{step % 100:02}"
                result = plan_order(DRAFT, "buy", price, size)
                # At this grid, pinned OrderBook's ceil reserve and floor cancellation are equal.
                product = result["price_units"] * result["size_units"]
                self.assertEqual(product % DRAFT["size_precision"], 0)
                self.assertEqual(result["quote_atoms"], product // DRAFT["size_precision"])
        self.assertEqual(plan_order(DRAFT, "buy", "0.0001", "0.01")["quote_atoms"], 1)

    def test_bad_order_inputs_are_rejected_without_rounding(self):
        for side, price, size in (("buy", "0", "1"), ("buy", "1.0001", "1"),
            ("buy", "0.50001", "1"), ("buy", "0.5", "0.001"), ("buy", "0.5", "100.01"),
            ("buy", "0.5", "1.001"), ("buy", "5e-1", "1"), ("buy", "NaN", "1"),
            ("buy", 0.5, "1"), ("buy", "-0.5", "1"), ("invalid", "0.5", "1")):
            with self.subTest(side=side, price=price, size=size), self.assertRaises(ValueError):
                plan_order(DRAFT, side, price, size)

    def test_invalid_configuration_bounds_and_dust_grid(self):
        for patch in ({"chain_id": 143}, {"market_type": 1}, {"base_decimals": 18},
            {"price_precision": 0}, {"price_precision": 10000000000}, {"size_precision": 13},
            {"tick_size": 0}, {"size_step": 1}, {"min_size": 0}, {"max_size": 2**96},
            {"maker_fee_bps": 31}, {"taker_fee_bps": 10000}, {"amm_spread_bps": 500},
            {"amm_spread_bps": 15}, {"tick_size": True}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                validate({**DRAFT, **patch})

    def test_cancel_payload_matches_cast_and_requires_real_uint40_id(self):
        self.assertEqual(cancel_calldata(7),
            "0x23afbff30000000000000000000000000000000000000000000000000000000000000020"
            "0000000000000000000000000000000000000000000000000000000000000001"
            "0000000000000000000000000000000000000000000000000000000000000007")
        for value in (0, -1, 2**40, True, "7"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                cancel_calldata(value)


if __name__ == "__main__":
    unittest.main()
