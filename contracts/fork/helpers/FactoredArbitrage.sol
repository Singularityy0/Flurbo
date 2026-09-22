// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {FactoredPool} from "../../src/FactoredPool.sol";
import {FactoredBaseToken} from "../../src/FactoredBaseToken.sol";
import {KuruMarket} from "../KuruOrderLifecycle.t.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Local-fork experiment only; not a deployed keeper or a production router.
/// @dev Operator supplies a candidate size and conservative bounds. No midpoint pricing or gas oracle.
contract FactoredArbitrage is ReentrancyGuard {
    using SafeERC20 for IERC20;
    error OnlyOperator();
    error InvalidPair();
    error InvalidPlan();
    error Expired();
    error UnprofitablePlan();
    error UnexpectedQuantity();
    error IncompleteRoundTrip();

    struct Plan {
        uint96 quantity; // Gross pool buy / exact net Kuru buy, in receipt atoms.
        uint96 maxSpend; // Pool cost cap / exact Kuru quote budget, in AUSD atoms.
        uint128 minReceive;
        uint128 gasAllowance; // Explicit synthetic AUSD cost budget, not measured MON gas.
        uint128 minProfit;
        uint64 deadline;
    }

    struct Result {
        uint256 spent;
        uint256 received;
        uint256 grossProfit;
        uint256 netAfterAllowance;
    }

    struct Pair {
        uint32 pricePrecision;
        uint96 sizePrecision;
        address base;
        uint256 baseDecimals;
        address quote;
        uint256 quoteDecimals;
        uint32 tick;
        uint96 minSize;
        uint96 maxSize;
        uint256 takerFee;
        uint256 makerFee;
    }

    address public immutable operator;
    FactoredPool public immutable pool;
    FactoredBaseToken public immutable receipt;
    IERC20 public immutable cash;
    KuruMarket public immutable market;
    uint8 public immutable eventIndex;
    bool public immutable outcome;
    uint32 public immutable scope;
    uint8 public immutable mask;

    event Executed(bool poolFirst, uint96 quantity, uint256 spent, uint256 received, uint256 netAfterAllowance);

    constructor(FactoredPool pool_, KuruMarket market_, uint8 event_, bool outcome_) {
        operator = msg.sender;
        pool = pool_;
        market = market_;
        eventIndex = event_;
        outcome = outcome_;
        (uint32 scope_, uint8 mask_) = pool_.baseClaim(event_, outcome_);
        scope = scope_;
        mask = mask_;
        FactoredBaseToken receipt_ = pool_.baseTokens(scope_, mask_);
        if (address(receipt_) == address(0)) revert InvalidPair();
        receipt = receipt_;
        cash = pool_.collateral();
        (bool ok, bytes memory data) = address(market_).staticcall(abi.encodeWithSignature("getMarketParams()"));
        if (!ok || data.length != 352) revert InvalidPair();
        Pair memory pair = abi.decode(data, (Pair));
        if (
            pair.base != address(receipt_) || pair.quote != address(pool_.collateral()) || pair.baseDecimals != 6
                || pair.quoteDecimals != 6 || pair.sizePrecision != 1e6 || pair.pricePrecision != 1e6
                || pool_.collateralDecimals() != 6 || receipt_.pool() != address(pool_) || receipt_.scope() != scope_
                || receipt_.mask() != mask_
        ) revert InvalidPair();
    }

    function requiredOut(Plan memory p) public pure returns (uint256) {
        if (p.quantity == 0 || p.maxSpend == 0 || p.minProfit == 0 || p.gasAllowance == 0) revert InvalidPlan();
        return uint256(p.maxSpend) + p.gasAllowance + p.minProfit;
    }

    function execute(bool poolFirst, Plan calldata p) external nonReentrant returns (Result memory r) {
        if (msg.sender != operator) revert OnlyOperator();
        if (block.timestamp > p.deadline) revert Expired();
        if (p.minReceive < requiredOut(p)) revert UnprofitablePlan();
        uint256 cashBefore = cash.balanceOf(address(this));
        uint256 receiptsBefore = receipt.balanceOf(address(this));
        uint128 holdingsBefore = pool.holdings(address(this), scope, mask);
        if (poolFirst) {
            cash.forceApprove(address(pool), p.maxSpend);
            r.spent = pool.buy(scope, mask, p.quantity, p.maxSpend, p.deadline);
            cash.forceApprove(address(pool), 0);
            pool.wrapBase(eventIndex, outcome, p.quantity);
            IERC20(address(receipt)).forceApprove(address(market), p.quantity);
            r.received = market.placeAndExecuteMarketSell(p.quantity, p.minReceive, false, true);
            IERC20(address(receipt)).forceApprove(address(market), 0);
        } else {
            cash.forceApprove(address(market), p.maxSpend);
            uint256 units = market.placeAndExecuteMarketBuy(p.maxSpend, p.quantity, false, true);
            cash.forceApprove(address(market), 0);
            if (units != p.quantity) revert UnexpectedQuantity();
            r.spent = p.maxSpend;
            pool.unwrapBase(eventIndex, outcome, p.quantity);
            r.received = pool.sell(scope, mask, p.quantity, p.minReceive, p.deadline);
        }
        uint256 cashAfter = cash.balanceOf(address(this));
        if (
            receipt.balanceOf(address(this)) != receiptsBefore
                || pool.holdings(address(this), scope, mask) != holdingsBefore
                || cashAfter + r.spent != cashBefore + r.received
        ) revert IncompleteRoundTrip();
        if (cashAfter < cashBefore + uint256(p.gasAllowance) + p.minProfit) revert UnprofitablePlan();
        r.grossProfit = cashAfter - cashBefore;
        r.netAfterAllowance = r.grossProfit - p.gasAllowance;
        emit Executed(poolFirst, p.quantity, r.spent, r.received, r.netAfterAllowance);
    }

    function withdrawCash() external nonReentrant {
        if (msg.sender != operator) revert OnlyOperator();
        cash.safeTransfer(operator, cash.balanceOf(address(this)));
    }
}
