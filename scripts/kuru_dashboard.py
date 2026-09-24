"""Bounded, read-only Kuru views for the verified original receipt pair."""
import time

from check_monad_readiness import CheckError
from dashboard_data import DashboardRpc
from scan_arbitrage import address, scan


class KuruScanRpc(DashboardRpc):
    allowed_methods = DashboardRpc.allowed_methods | {"eth_estimateGas", "eth_gasPrice"}


def snapshot(model, wallet, before=0):
    wallet = address(wallet)
    if type(before) is not int or not 0 <= before < 2**40:
        raise ValueError("Invalid order cursor")
    result = model.snapshot(wallet, [(128, 2)])
    if model.call("margin", "5f71a07c", int(model.m["market"], 16))[0] != 1:
        raise CheckError("Kuru market is not verified by the margin account")
    count = model.call("market", "2bf1360e")[0]
    if count >= 2**40:
        raise CheckError("Invalid order counter")
    last = min(count, before - 1) if before else count
    ids = list(range(last, max(0, last - 20), -1))
    model.prefetch([model.read_call("market", "1c0d9c22", n) for n in ids]) if ids else None
    orders = []
    for n in ids:
        owner, size, _, _, flipped, price, flipped_price, buy = model.call("market", "1c0d9c22", n, count=8)
        if owner == int(wallet, 16) and size and not flipped and not flipped_price:
            if buy not in (0, 1) or not 0 < price <= 1000000 or size >= 2**96:
                raise CheckError("Unsupported order state")
            # Filled storage can retain its old size. Match Kuru's own status
            # rule using the current price-point head, not size alone.
            head, _ = model.call("market", "e6d29b51" if buy else "0e2e2ffe", price, count=2)
            if not head or head > n:
                continue
            orders.append({"id": str(n), "side": "buy" if buy else "sell", "remaining_atoms": str(size), "price_units": str(price)})
    for asset in ("cash", "receipt"):
        result["wallet"][asset + "_margin_allowance_atoms"] = str(model.call("cash" if asset == "cash" else "receipt", "dd62ed3e", int(wallet, 16), int(model.m["margin"], 16))[0])
    start = max(model.m["verified_block"], model.number - 99)
    logs = model.rpc("eth_getLogs", [{"address": model.m["market"], "fromBlock": hex(start), "toBlock": model.tag}])
    if not isinstance(logs, list) or len(logs) > 2000:
        raise CheckError("Activity exceeds the bounded reader")
    result["orders"] = orders
    result["orders_page"] = {"through_id": str(last), "next_before": str(ids[-1]) if ids and ids[-1] > 1 else None,
                             "scope": "Regular open orders in this 20-ID page; flip orders excluded"}
    result["activity"] = {"from_block": start, "to_block": model.number, "logs": logs}
    return model.finish(result)


def scanner(model, conversion, fee):
    if not 1 <= conversion <= 10**9 or not 1 <= fee <= 500_000_000_000:
        raise ValueError("Conversion or gas cap exceeds testnet scan policy")
    model.begin()
    state = model.state()
    if state["phase"] != "open" or not state["covered"] or not state["receipt_backed"]:
        raise CheckError("Pool unavailable for scanning")
    config = {key: model.m[key] for key in ("executor", "pool", "market", "receipt", "cash", "operator", "scope", "mask")}
    config.update(chain_id=10143, mon_ausd_price_e6=conversion, price_observed_at=int(time.time()),
                  max_price_age_seconds=120, max_block_age_seconds=30, max_head_advance=10,
                  max_fee_per_gas_wei=fee, max_gas=1500000, min_profit_atoms=10000,
                  deadline_seconds=120, gas_headroom_bps=12500,
                  pool_buy_sizes=[1000000], kuru_buy_budgets=[500000])
    rpc = KuruScanRpc(model.rpc.url) if isinstance(model.rpc, DashboardRpc) else model.rpc
    result = scan(config, rpc, comparison_only=True)
    # The hosted scanner is comparison-only. There is deliberately no submit route.
    for candidate in result["candidates"]:
        candidate.pop("unsigned_transaction", None)
    result["environment"] = model.m["environment"]
    return result
