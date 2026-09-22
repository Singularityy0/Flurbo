// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {KuruOrderLifecycleTest, IERC20Metadata, ForkVm} from "./KuruOrderLifecycle.t.sol";
import {FactoredPool} from "../src/FactoredPool.sol";
import {FactoredBaseToken} from "../src/FactoredBaseToken.sol";

/// @dev Inherits the same buy/cancel, sell/cancel/redeem and post-only rejection tests.
///      All mutations run locally at the pinned fork block; there is no broadcast path.
contract FactoredKuruOrderLifecycleTest is KuruOrderLifecycleTest {
    FactoredPool private factored;
    uint32 private constant SCOPE = 0x80000000;
    address private constant TAKER = address(0xB0B);

    struct Fill {
        uint32 price;
        uint96 resting;
        uint96 size;
        uint96 quote;
        uint256 fee;
        uint256 rebate;
        uint256 protocol;
    }

    function testMarketBuyPartialFillFeesAndRedemption() public {
        buyFill(Fill(500000, 3e6, 1e6, 500000, 3000, 1000, 2000));
    }

    function testMarketBuyFullFillFeesAndRedemption() public {
        buyFill(Fill(500000, 1e6, 1e6, 500000, 3000, 1000, 2000));
    }

    function testMarketBuyFractionalFillRetainsRoundingDust() public {
        // 3334 quote atoms buy floor(3334 / 0.3332) = 10006 base atoms.
        // Maker receives floor(10006 * 0.3332) = 3333 quote atoms.
        buyFill(Fill(333200, 30000, 10006, 3334, 31, 10, 20));
    }

    function testMarketSellPartialFillFeesAndRedemption() public {
        sellFill(Fill(500000, 3e6, 1e6, 500000, 1500, 500, 1000));
    }

    function testMarketSellFractionalFillRetainsRoundingDust() public {
        sellFill(Fill(333200, 30000, 10001, 3332, 10, 3, 6));
    }

    function testMarketBuySlippageAndFillOrKillRollBack() public {
        deposit(address(receipt), 1e6);
        uint40 ask = place(false, 500000, 1e6);
        depositFor(TAKER, address(ausd), 1e6);
        rejectFill(
            ask, abi.encodeCall(market.placeAndExecuteMarketBuy, (500000, 997001, true, true)), "SlippageExceeded()"
        );
        rejectFill(
            ask, abi.encodeCall(market.placeAndExecuteMarketBuy, (1000000, 0, true, true)), "InsufficientLiquidity()"
        );
        collect(0, 0);
    }

    function testMarketSellSlippageAndFillOrKillRollBack() public {
        deposit(address(ausd), 500000);
        uint40 bid = place(true, 500000, 1e6);
        depositFor(TAKER, address(receipt), 2e6);
        rejectFill(
            bid, abi.encodeCall(market.placeAndExecuteMarketSell, (1e6, 498501, true, true)), "SlippageExceeded()"
        );
        rejectFill(
            bid, abi.encodeCall(market.placeAndExecuteMarketSell, (2e6, 0, true, true)), "InsufficientLiquidity()"
        );
        collect(0, 0);
    }

    function buyFill(Fill memory f) private {
        bytes32 backing = backingSnapshot();
        uint256 custody = ausd.balanceOf(address(margin));
        deposit(address(receipt), f.resting);
        uint40 ask = place(false, f.price, f.resting);
        depositFor(TAKER, address(ausd), f.quote);
        vm.recordLogs();
        vm.prank(TAKER);
        assert(market.placeAndExecuteMarketBuy(f.quote, f.size - f.fee, true, true) == f.size - f.fee);
        checkTrade(ask, true, f);
        uint256 makerQuote = uint256(f.size) * f.price / 1e6;
        assert(margin.getBalance(TAKER, address(receipt)) == f.size - f.fee);
        assert(margin.getBalance(TAKER, address(ausd)) == 0);
        assert(margin.getBalance(address(this), address(receipt)) == f.rebate);
        assert(margin.getBalance(address(this), address(ausd)) == makerQuote);
        if (f.resting > f.size) cancel(ask);
        assert(margin.getBalance(address(this), address(receipt)) == f.resting - f.size + f.rebate);
        withdrawAll(address(this), address(receipt));
        withdrawAll(address(this), address(ausd));
        withdrawAll(TAKER, address(receipt));
        assert(receipt.balanceOf(TAKER) == f.size - f.fee);
        assert(receipt.balanceOf(address(this)) == 10e6 - f.size + f.rebate);
        assert(receipt.balanceOf(address(margin)) == f.fee - f.rebate);
        assert(ausd.balanceOf(address(margin)) == custody + f.quote - makerQuote);
        collect(f.protocol, 0);
        assert(backingSnapshot() == backing);
        // Protocol receipt fees and dust stay in Kuru custody and retain their pool backing.
        settleUsers(f.fee - f.rebate);
    }

    function sellFill(Fill memory f) private {
        bytes32 backing = backingSnapshot();
        uint256 custody = ausd.balanceOf(address(margin));
        uint256 reserve = uint256(f.resting) * f.price / 1e6;
        deposit(address(ausd), reserve);
        uint40 bid = place(true, f.price, f.resting);
        depositFor(TAKER, address(receipt), f.size);
        vm.recordLogs();
        vm.prank(TAKER);
        assert(market.placeAndExecuteMarketSell(f.size, f.quote - f.fee, true, true) == f.quote - f.fee);
        checkTrade(bid, false, f);
        assert(margin.getBalance(TAKER, address(ausd)) == f.quote - f.fee);
        assert(margin.getBalance(TAKER, address(receipt)) == 0);
        assert(margin.getBalance(address(this), address(receipt)) == f.size);
        assert(margin.getBalance(address(this), address(ausd)) == f.rebate);
        cancel(bid);
        uint256 refund = uint256(f.resting - f.size) * f.price / 1e6;
        assert(margin.getBalance(address(this), address(ausd)) == refund + f.rebate);
        withdrawAll(address(this), address(receipt));
        withdrawAll(address(this), address(ausd));
        withdrawAll(TAKER, address(ausd));
        assert(ausd.balanceOf(TAKER) == f.quote - f.fee);
        assert(receipt.balanceOf(address(this)) == 10e6 && receipt.balanceOf(address(margin)) == 0);
        assert(ausd.balanceOf(address(margin)) == custody + reserve - refund - f.rebate - (f.quote - f.fee));
        collect(0, f.protocol);
        assert(backingSnapshot() == backing);
        settleUsers(0);
    }

    function depositFor(address owner, address asset, uint256 amount) private {
        IERC20Metadata(asset).approve(address(margin), amount);
        margin.deposit(owner, asset, amount);
        assert(margin.getBalance(owner, asset) == amount);
    }

    function withdrawAll(address owner, address asset) private {
        uint256 amount = margin.getBalance(owner, asset);
        uint256 before_ = IERC20Metadata(asset).balanceOf(owner);
        vm.prank(owner);
        margin.withdraw(amount, asset);
        assert(margin.getBalance(owner, asset) == 0 && IERC20Metadata(asset).balanceOf(owner) == before_ + amount);
    }

    function collect(uint256 baseFee, uint256 quoteFee) private {
        vm.expectCall(
            address(margin),
            abi.encodeWithSignature(
                "creditFee(address,uint256,address,uint256)", address(receipt), baseFee, address(ausd), quoteFee
            )
        );
        market.collectFees();
        // Collection can be triggered publicly but must not credit the same accrual twice.
        vm.expectCall(
            address(margin),
            abi.encodeWithSignature("creditFee(address,uint256,address,uint256)", address(receipt), 0, address(ausd), 0)
        );
        market.collectFees();
    }

    function settleUsers(uint256 residual) private {
        vm.warp(factored.closesAt());
        factored.resolve(SCOPE);
        address[2] memory owners = [address(this), TAKER];
        for (uint256 i; i < owners.length; i++) {
            uint128 units = uint128(receipt.balanceOf(owners[i]));
            if (units == 0) continue;
            uint256 cash = ausd.balanceOf(owners[i]);
            vm.prank(owners[i]);
            factored.unwrapBase(31, true, units);
            vm.prank(owners[i]);
            assert(factored.redeem(SCOPE, 2, units) == units);
            assert(ausd.balanceOf(owners[i]) == cash + units);
        }
        assert(receipt.totalSupply() == residual && factored.requiredCollateral() == residual);
        assert(factored.holdings(address(receipt), SCOPE, 2) == residual);
        assert(receipt.balanceOf(address(margin)) == residual);
    }

    function checkTrade(uint40 id, bool isBuy, Fill memory f) private {
        ForkVm.Log[] memory logs = vm.getRecordedLogs();
        uint256 count;
        for (uint256 i; i < logs.length; i++) {
            if (
                logs[i].emitter != address(market) || logs[i].topics.length != 1
                    || logs[i].topics[0]
                        != keccak256("Trade(uint40,address,bool,uint256,uint96,address,address,uint96)")
            ) continue;
            (
                uint40 actualId,
                address maker,
                bool buy_,
                uint256 price,
                uint96 remaining,
                address taker,
                address origin,
                uint96 filled
            ) = abi.decode(logs[i].data, (uint40, address, bool, uint256, uint96, address, address, uint96));
            assert(actualId == id && maker == address(this) && taker == TAKER && origin == tx.origin);
            assert(buy_ == isBuy && price == uint256(f.price) * 1e18 / 1e6);
            assert(remaining == f.resting - f.size && filled == f.size);
            count++;
        }
        assert(count == 1 && market.s_orders(id).size == f.resting - f.size);
    }

    function rejectFill(uint40 id, bytes memory call_, string memory error_) private {
        bytes32 before_ = fillSnapshot(id);
        vm.prank(TAKER);
        (bool ok, bytes memory reason) = address(market).call(call_);
        assert(!ok && bytes4(reason) == bytes4(keccak256(bytes(error_))));
        assert(fillSnapshot(id) == before_);
    }

    function fillSnapshot(uint40 id) private view returns (bytes32 hash) {
        hash = keccak256(abi.encode(backingSnapshot(), market.s_orders(id)));
        address[3] memory owners = [address(this), TAKER, address(margin)];
        for (uint256 i; i < owners.length; i++) {
            hash = keccak256(
                abi.encode(
                    hash,
                    receipt.balanceOf(owners[i]),
                    ausd.balanceOf(owners[i]),
                    margin.getBalance(owners[i], address(receipt)),
                    margin.getBalance(owners[i], address(ausd))
                )
            );
        }
    }

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
