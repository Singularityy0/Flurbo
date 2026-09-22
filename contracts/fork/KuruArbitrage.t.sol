// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {KuruLifecycleFixture, IERC20Metadata} from "./KuruOrderLifecycle.t.sol";
import {FactoredPool} from "../src/FactoredPool.sol";
import {FactoredQuote as Q} from "../src/FactoredQuote.sol";
import {FactoredArbitrage as Arb} from "./helpers/FactoredArbitrage.sol";

contract KuruArbitrageTest is KuruLifecycleFixture {
    FactoredPool private factored;
    uint32 private constant SCOPE = 128;
    event log_named_uint(string key, uint256 value);

    function prepareReceipt() internal override {
        uint8[] memory order = new uint8[](8);
        for (uint8 i; i < 8; i++) {
            order[i] = i;
        }
        factored = new FactoredPool(
            address(ausd),
            8,
            10e6,
            uint64(block.timestamp + 1 days),
            order,
            address(this),
            keccak256("synthetic eight-event arbitrage fixture; event i is bit i")
        );
        ausd.approve(address(factored), 1000e6);
        factored.fund();
        factored.buy(SCOPE, 2, 10e6, 10e6, block.timestamp);
        receipt = IERC20Metadata(address(factored.createBaseToken(7, true)));
        factored.wrapBase(7, true, 10e6);
    }

    function runner() private returns (Arb arb) {
        arb = new Arb(factored, market, 7, true);
        ausd.transfer(address(arb), 20e6);
    }

    function bid(uint96 size, uint32 price) private returns (uint40) {
        deposit(address(ausd), uint256(size) * price / 1e6);
        return place(true, price, size);
    }

    function ask(uint96 size, uint32 price) private returns (uint40) {
        deposit(address(receipt), size);
        return place(false, price, size);
    }

    function poolFirstPlan() private view returns (Arb.Plan memory) {
        return Arb.Plan(1e6, uint96(factored.quoteBuy(SCOPE, 2, 1e6)), 897300, 10000, 10000, uint64(block.timestamp));
    }

    function kuruFirstPlan() private view returns (Arb.Plan memory) {
        // Buying 1 gross receipt at 0.5 delivers 0.997 after Kuru's base-asset fee.
        return Arb.Plan(997000, 500000, factored.quoteSell(SCOPE, 2, 997000), 10000, 10000, uint64(block.timestamp));
    }

    function testPoolToKuruProfitsAndMovesPoolPriceTowardBid() public {
        uint40 id = bid(2e6, 900000);
        Arb arb = runner();
        Arb.Plan memory p = poolFirstPlan();
        uint128 quoteBefore = factored.quoteBuy(SCOPE, 2, 1e6);
        uint256 cashBefore = ausd.balanceOf(address(arb));
        uint256 start = gasleft();
        Arb.Result memory r = arb.execute(true, p);
        uint256 used = start - gasleft();
        assert(used < 800000);
        assert(r.spent == p.maxSpend && r.received == 897300);
        assert(r.grossProfit == r.received - r.spent && r.netAfterAllowance == r.grossProfit - 10000);
        assert(ausd.balanceOf(address(arb)) == cashBefore + r.grossProfit);
        assert(market.s_orders(id).size == 1e6);
        assert(factored.quoteBuy(SCOPE, 2, 1e6) > quoteBefore);
        assert(factored.requiredCollateral() == 11e6 && receipt.totalSupply() == 11e6);
        checkClean(arb);
        emit log_named_uint("pool-first execution gas", used);
        emit log_named_uint("pool-first spent AUSD atoms", r.spent);
        emit log_named_uint("pool-first gross profit AUSD atoms", r.grossProfit);
        emit log_named_uint("pool-first profit after synthetic allowance", r.netAfterAllowance);
        uint256 wallet = ausd.balanceOf(address(this));
        arb.withdrawCash();
        assert(
            ausd.balanceOf(address(arb)) == 0 && ausd.balanceOf(address(this)) == wallet + cashBefore + r.grossProfit
        );
    }

    function testKuruToPoolProfitsAndMovesPoolPriceTowardAsk() public {
        uint40 id = ask(2e6, 500000);
        Arb arb = runner();
        Arb.Plan memory p = kuruFirstPlan();
        uint128 quoteBefore = factored.quoteBuy(SCOPE, 2, 1e6);
        uint256 start = gasleft();
        Arb.Result memory r = arb.execute(false, p);
        uint256 used = start - gasleft();
        assert(used < 800000);
        assert(r.spent == 500000 && r.received == p.minReceive);
        assert(r.grossProfit == r.received - r.spent && r.netAfterAllowance >= p.minProfit);
        assert(ausd.balanceOf(address(arb)) == 20e6 + r.grossProfit);
        assert(market.s_orders(id).size == 1e6);
        assert(factored.quoteBuy(SCOPE, 2, 1e6) < quoteBefore);
        assert(factored.requiredCollateral() == 10e6 - 997000 && receipt.totalSupply() == 10e6 - 997000);
        checkClean(arb);
        emit log_named_uint("kuru-first execution gas", used);
        emit log_named_uint("kuru-first received AUSD atoms", r.received);
        emit log_named_uint("kuru-first gross profit AUSD atoms", r.grossProfit);
        emit log_named_uint("kuru-first profit after synthetic allowance", r.netAfterAllowance);
    }

    function testInclusiveProfitFloorAndExistingInventoryPreserved() public {
        bid(2e6, 900000);
        Arb arb = runner();
        // Donated receipts cannot be silently consumed to manufacture cash profit.
        receipt.transfer(address(arb), 123);
        Arb.Plan memory p = poolFirstPlan();
        p.minProfit = uint128(uint256(p.minReceive) - p.maxSpend - p.gasAllowance);
        Arb.Result memory r = arb.execute(true, p);
        assert(r.netAfterAllowance == p.minProfit && receipt.balanceOf(address(arb)) == 123);
        assert(factored.holdings(address(arb), SCOPE, 2) == 0);
    }

    function testGasAllowanceAndFeesCanRejectApparentSpread() public {
        uint40 id = bid(2e6, 900000);
        Arb arb = runner();
        Arb.Plan memory p = poolFirstPlan();
        p.gasAllowance = 1e6;
        reject(arb, id, true, p, Arb.UnprofitablePlan.selector);
        // The 0.003 haircut matters even when the gross bid looks sufficient.
        p = poolFirstPlan();
        p.minProfit = uint128(900000 - uint256(p.maxSpend) - p.gasAllowance);
        reject(arb, id, true, p, Arb.UnprofitablePlan.selector);
    }

    function testStalePoolBuyQuoteRollsBack() public {
        uint40 id = bid(2e6, 900000);
        Arb arb = runner();
        Arb.Plan memory p = poolFirstPlan();
        factored.buy(SCOPE, 2, 1e6, 1e6, block.timestamp);
        reject(arb, id, true, p, Q.MaxCostExceeded.selector);
    }

    function testStalePoolSellQuoteRevertsKuruFillToo() public {
        uint40 id = ask(2e6, 500000);
        Arb arb = runner();
        Arb.Plan memory p = kuruFirstPlan();
        factored.unwrapBase(7, true, 1e6);
        factored.sell(SCOPE, 2, 1e6, 0, block.timestamp);
        reject(arb, id, false, p, Q.MinProceedsNotMet.selector);
        expectNoFees();
    }

    function testInsufficientBidDepthRevertsPoolBuyToo() public {
        uint40 id = bid(500000, 900000);
        Arb arb = runner();
        reject(arb, id, true, poolFirstPlan(), bytes4(keccak256("InsufficientLiquidity()")));
        expectNoFees();
    }

    function testInsufficientAskDepthRollsBack() public {
        uint40 id = ask(500000, 500000);
        Arb arb = runner();
        reject(arb, id, false, kuruFirstPlan(), bytes4(keccak256("InsufficientLiquidity()")));
        expectNoFees();
    }

    function testWorseBidPriceRevertsPoolBuyToo() public {
        uint40 id = bid(2e6, 800000);
        Arb arb = runner();
        reject(arb, id, true, poolFirstPlan(), bytes4(keccak256("SlippageExceeded()")));
        expectNoFees();
    }

    function testChangedNetReceiptQuantityRevertsKuruFill() public {
        uint40 id = ask(2e6, 490000);
        Arb arb = runner();
        reject(arb, id, false, kuruFirstPlan(), Arb.UnexpectedQuantity.selector);
        expectNoFees();
    }

    function testDeadlineAndInvalidPlanRejectBeforeSpending() public {
        uint40 id = bid(2e6, 900000);
        Arb arb = runner();
        Arb.Plan memory p = poolFirstPlan();
        p.deadline--;
        reject(arb, id, true, p, Arb.Expired.selector);
        p = poolFirstPlan();
        p.minProfit = 0;
        reject(arb, id, true, p, Arb.InvalidPlan.selector);
        p = poolFirstPlan();
        p.gasAllowance = 0;
        reject(arb, id, true, p, Arb.InvalidPlan.selector);
    }

    function testOnlyOperatorCanTradeOrWithdraw() public {
        uint40 id = bid(2e6, 900000);
        Arb arb = runner();
        Arb.Plan memory p = poolFirstPlan();
        bytes32 before_ = snapshot(arb, id);
        vm.prank(address(0xBAD));
        (bool ok, bytes memory reason) = address(arb).call(abi.encodeCall(arb.execute, (true, p)));
        assert(!ok && bytes4(reason) == Arb.OnlyOperator.selector);
        vm.prank(address(0xBAD));
        (ok, reason) = address(arb).call(abi.encodeCall(arb.withdrawCash, ()));
        assert(!ok && bytes4(reason) == Arb.OnlyOperator.selector && snapshot(arb, id) == before_);
    }

    function testRejectsPairForDifferentCanonicalClaim() public {
        factored.createBaseToken(6, true);
        try new Arb(factored, market, 6, true) {
            assert(false);
        } catch (bytes memory reason) {
            assert(bytes4(reason) == Arb.InvalidPair.selector);
        }
    }

    function checkClean(Arb arb) private view {
        assert(receipt.balanceOf(address(arb)) == 0 && factored.holdings(address(arb), SCOPE, 2) == 0);
        assert(ausd.allowance(address(arb), address(factored)) == 0);
        assert(ausd.allowance(address(arb), address(market)) == 0);
        assert(receipt.allowance(address(arb), address(market)) == 0);
        assert(
            margin.getBalance(address(arb), address(ausd)) == 0
                && margin.getBalance(address(arb), address(receipt)) == 0
        );
        assert(receipt.totalSupply() == factored.holdings(address(receipt), SCOPE, 2));
        assert(ausd.balanceOf(address(factored)) >= factored.requiredCollateral());
    }

    function expectNoFees() private {
        vm.expectCall(
            address(margin),
            abi.encodeWithSignature("creditFee(address,uint256,address,uint256)", address(receipt), 0, address(ausd), 0)
        );
        market.collectFees();
    }

    function reject(Arb arb, uint40 id, bool poolFirst, Arb.Plan memory p, bytes4 expected) private {
        bytes32 before_ = snapshot(arb, id);
        (bool ok, bytes memory reason) = address(arb).call(abi.encodeCall(arb.execute, (poolFirst, p)));
        assert(!ok && bytes4(reason) == expected && snapshot(arb, id) == before_);
    }

    function snapshot(Arb arb, uint40 id) private view returns (bytes32 hash) {
        hash = keccak256(
            abi.encode(factored.factors(), factored.requiredCollateral(), receipt.totalSupply(), market.s_orders(id))
        );
        address[5] memory owners = [address(this), address(arb), address(factored), address(receipt), address(margin)];
        for (uint256 i; i < owners.length; i++) {
            address owner = owners[i];
            hash = keccak256(
                abi.encode(
                    hash,
                    ausd.balanceOf(owner),
                    receipt.balanceOf(owner),
                    factored.holdings(owner, SCOPE, 2),
                    margin.getBalance(owner, address(ausd)),
                    margin.getBalance(owner, address(receipt)),
                    ausd.allowance(owner, address(factored)),
                    ausd.allowance(owner, address(market)),
                    receipt.allowance(owner, address(market))
                )
            );
        }
    }
}
