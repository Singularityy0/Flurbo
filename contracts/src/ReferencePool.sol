// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LmsrCost} from "./LmsrCost.sol";
import {LmsrQuote} from "./LmsrQuote.sol";
import {QuoteMath} from "./QuoteMath.sol";

/// @notice Local-test reference pool. No settlement or redemption yet; do not fund with real assets.
/// @dev One immutable, enumerated cluster. Claims are internal balances, not transferable tokens.
contract ReferencePool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidConfiguration();
    error NotFunded();
    error AlreadyFunded();
    error Closed();
    error ExpiredDeadline();
    error InsufficientHoldings();
    error UnsupportedTransfer();
    error UncoveredLiability();

    IERC20 public immutable collateral;
    uint8 public immutable collateralDecimals;
    uint128 public immutable liquidity;
    uint128 public immutable requiredFunding;
    uint64 public immutable closesAt;
    bool public funded;
    uint128[] private stateLiabilities;
    mapping(address => mapping(uint256 => uint128)) public holdings;

    event Funded(address indexed sponsor, uint128 amount);
    event Traded(address indexed trader, uint256 indexed mask, bool isBuy, uint128 quantity, uint128 collateralAmount);

    constructor(address token, uint8 events_, uint128 b, uint64 closeTime) {
        if (token.code.length == 0 || events_ == 0 || events_ > 3 || closeTime <= block.timestamp) {
            revert InvalidConfiguration();
        }
        collateral = IERC20(token);
        collateralDecimals = IERC20Metadata(token).decimals();
        liquidity = b;
        closesAt = closeTime;
        uint256 n = uint256(1) << events_;
        stateLiabilities = new uint128[](n);
        QuoteMath.CostBounds memory initial = LmsrCost.bounds(new uint256[](n), QuoteMath.toWad(b, collateralDecimals));
        requiredFunding = QuoteMath.fromWadUp(initial.upperWad, collateralDecimals);
    }

    /// @notice One-time fixed subsidy. No LP receipt or withdrawal entitlement is created.
    function fund() external nonReentrant {
        if (funded) revert AlreadyFunded();
        if (block.timestamp >= closesAt) revert Closed();
        funded = true;
        transferExact(msg.sender, requiredFunding, true);
        requireCovered();
        emit Funded(msg.sender, requiredFunding);
    }

    function liabilities() external view returns (uint128[] memory) {
        return stateLiabilities;
    }

    function requiredCollateral() public view returns (uint128 required) {
        for (uint256 i; i < stateLiabilities.length; i++) {
            if (stateLiabilities[i] > required) required = stateLiabilities[i];
        }
    }

    /// @notice Snapshot quote only; execution recomputes it. Fees and gas are excluded.
    function quoteBuy(uint256 mask, uint128 quantity) external view returns (uint128) {
        requireOpen();
        requireCovered();
        return LmsrQuote.buy(market(), mask, quantity, type(uint128).max).collateral;
    }

    /// @notice Price preview; caller ownership is checked by sell, not by this view.
    function quoteSell(uint256 mask, uint128 quantity) external view returns (uint128) {
        requireOpen();
        requireCovered();
        return LmsrQuote.sell(market(), mask, quantity, 0).collateral;
    }

    function buy(uint256 mask, uint128 quantity, uint128 maxCost, uint256 deadline)
        external
        nonReentrant
        returns (uint128 paid)
    {
        requireTrading(deadline);
        LmsrQuote.Quote memory quote = LmsrQuote.buy(market(), mask, quantity, maxCost);
        holdings[msg.sender][mask] += quantity;
        stateLiabilities = quote.liabilitiesAfter;
        paid = quote.collateral;
        transferExact(msg.sender, paid, true);
        requireCovered();
        emit Traded(msg.sender, mask, true, quantity, paid);
    }

    function sell(uint256 mask, uint128 quantity, uint128 minProceeds, uint256 deadline)
        external
        nonReentrant
        returns (uint128 received)
    {
        requireTrading(deadline);
        if (holdings[msg.sender][mask] < quantity) revert InsufficientHoldings();
        LmsrQuote.Quote memory quote = LmsrQuote.sell(market(), mask, quantity, minProceeds);
        holdings[msg.sender][mask] -= quantity;
        stateLiabilities = quote.liabilitiesAfter;
        received = quote.collateral;
        transferExact(msg.sender, received, false);
        requireCovered();
        emit Traded(msg.sender, mask, false, quantity, received);
    }

    function market() private view returns (LmsrQuote.Market memory) {
        return LmsrQuote.Market(stateLiabilities, liquidity, collateralDecimals);
    }

    function requireOpen() private view {
        if (!funded) revert NotFunded();
        if (block.timestamp >= closesAt) revert Closed();
    }

    function requireTrading(uint256 deadline) private view {
        requireOpen();
        if (block.timestamp > deadline) revert ExpiredDeadline();
        requireCovered();
    }

    function requireCovered() private view {
        if (collateral.balanceOf(address(this)) < requiredCollateral()) revert UncoveredLiability();
    }

    // Check both sides: receiver tax and extra sender fees both violate the signed amount.
    function transferExact(address trader, uint128 amount, bool incoming) private {
        uint256 poolBefore = collateral.balanceOf(address(this));
        uint256 traderBefore = collateral.balanceOf(trader);
        if (incoming) collateral.safeTransferFrom(trader, address(this), amount);
        else collateral.safeTransfer(trader, amount);
        uint256 poolAfter = collateral.balanceOf(address(this));
        uint256 traderAfter = collateral.balanceOf(trader);
        if (incoming) {
            if (
                poolAfter < poolBefore || poolAfter - poolBefore != amount || traderAfter > traderBefore
                    || traderBefore - traderAfter != amount
            ) revert UnsupportedTransfer();
        } else {
            if (
                poolAfter > poolBefore || poolBefore - poolAfter != amount || traderAfter < traderBefore
                    || traderAfter - traderBefore != amount
            ) revert UnsupportedTransfer();
        }
    }
}
