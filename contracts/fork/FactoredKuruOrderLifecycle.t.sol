// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {KuruOrderLifecycleTest, IERC20Metadata} from "./KuruOrderLifecycle.t.sol";
import {FactoredPool} from "../src/FactoredPool.sol";
import {FactoredBaseToken} from "../src/FactoredBaseToken.sol";

/// @dev Inherits the same buy/cancel, sell/cancel/redeem and post-only rejection tests.
///      All mutations run locally at the pinned fork block; there is no broadcast path.
contract FactoredKuruOrderLifecycleTest is KuruOrderLifecycleTest {
    FactoredPool private factored;
    uint32 private constant SCOPE = 0x80000000;

    function prepareReceipt() internal override {
        uint8[] memory order = new uint8[](32);
        for (uint8 i; i < 32; i++) {
            order[i] = i;
        }
        // 32 events exercise the high bit; b=10 keeps the initial subsidy within faucet funds.
        factored = new FactoredPool(
            address(ausd),
            32,
            10e6,
            uint64(block.timestamp + 1 days),
            order,
            address(this),
            keccak256("synthetic factored fork fixture: event i is bit i; trusted local resolver")
        );
        ausd.approve(address(factored), 1000e6);
        factored.fund();
        factored.buy(SCOPE, 2, 10e6, 10e6, block.timestamp);
        FactoredBaseToken canonical = factored.createBaseToken(31, true);
        assert(canonical.pool() == address(factored) && canonical.scope() == SCOPE && canonical.mask() == 2);
        assert(canonical.decimals() == ausd.decimals());
        receipt = IERC20Metadata(address(canonical));
        factored.wrapBase(31, true, 10e6);
        assert(address(factored.baseTokens(SCOPE, 2)) == address(receipt));
        assert(factored.holdings(address(this), SCOPE, 2) == 0);
    }

    function redeemBacking() internal override {
        vm.warp(factored.closesAt());
        factored.resolve(SCOPE);
        factored.unwrapBase(31, true, 10e6);
        assert(factored.redeem(SCOPE, 2, 10e6) == 10e6);
        assert(factored.requiredCollateral() == 0 && factored.holdings(address(receipt), SCOPE, 2) == 0);
    }

    function testWithdrawThenSellAndComposeThroughSamePool() public {
        bytes32 backing = backingSnapshot();
        deposit(address(receipt), 3e6);
        uint40 ask = place(false, pricePrecision / 2, sizePrecision);
        cancel(ask);
        margin.withdraw(3e6, address(receipt));
        assert(backingSnapshot() == backing);
        assert(receipt.balanceOf(address(this)) == 10e6 && receipt.balanceOf(address(margin)) == 0);
        assert(margin.getBalance(address(this), address(receipt)) == 0);

        factored.unwrapBase(31, true, 1e6);
        uint128 proceeds = factored.quoteSell(SCOPE, 2, 1e6);
        uint256 cash = ausd.balanceOf(address(this));
        assert(factored.sell(SCOPE, 2, 1e6, proceeds, block.timestamp) == proceeds);
        assert(ausd.balanceOf(address(this)) == cash + proceeds);
        // Event 0 AND event 31 shares the same collateral and factor ledger as the Kuru asset.
        uint128 cost = factored.quoteBuy(SCOPE | 1, 8, 1e6);
        assert(factored.buy(SCOPE | 1, 8, 1e6, cost, block.timestamp) == cost);
        assert(factored.holdings(address(this), SCOPE | 1, 8) == 1e6);
        assert(receipt.totalSupply() == 9e6 && factored.holdings(address(receipt), SCOPE, 2) == 9e6);
        assert(factored.requiredCollateral() == 10e6);
        assert(ausd.balanceOf(address(factored)) >= factored.requiredCollateral());

        vm.warp(factored.closesAt());
        factored.resolve(SCOPE | 1);
        factored.unwrapBase(31, true, 9e6);
        cash = ausd.balanceOf(address(this));
        assert(factored.redeem(SCOPE, 2, 9e6) == 9e6);
        assert(factored.redeem(SCOPE | 1, 8, 1e6) == 1e6);
        assert(ausd.balanceOf(address(this)) == cash + 10e6);
        assert(receipt.totalSupply() == 0 && factored.requiredCollateral() == 0);
    }

    function backingSnapshot() internal view override returns (bytes32) {
        assert(receipt.totalSupply() == factored.holdings(address(receipt), SCOPE, 2));
        assert(ausd.balanceOf(address(factored)) >= factored.requiredCollateral());
        return keccak256(
            abi.encode(
                receipt.totalSupply(),
                factored.holdings(address(receipt), SCOPE, 2),
                factored.holdings(address(this), SCOPE, 2),
                factored.factors(),
                factored.requiredCollateral(),
                ausd.balanceOf(address(factored)),
                factored.quoteBuy(SCOPE, 2, 1e6),
                factored.quoteBuy(SCOPE | 1, 8, 1e6)
            )
        );
    }
}
