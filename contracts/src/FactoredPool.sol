// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import {FactoredTrading} from "./FactoredTrading.sol";
import {FactoredPositions as P} from "./FactoredPositions.sol";

/// @notice Local-test factored pool with immutable trusted resolution. Not approved for real assets.
/// @dev One shared, uniform-prior cluster. Conditional securities and partner adapters remain separate.
contract FactoredPool is FactoredTrading {
    using P for P.Book;
    error UnauthorizedResolver();
    error NotClosed();
    error AlreadyResolved();
    error NotResolved();
    error InvalidOutcome();
    error MissingFactor();

    address public immutable resolver;
    bytes32 public immutable settlementRulesHash;
    bool public resolved;
    uint32 public resolvedState;
    uint128 private remainingPayout;
    event Resolved(uint32 indexed terminalState, bytes32 indexed rulesHash);
    event Redeemed(
        address indexed owner, uint32 indexed scope, uint256 indexed mask, uint128 quantity, uint128 collateralAmount
    );

    constructor(
        address token,
        uint8 events_,
        uint128 b,
        uint64 closeTime,
        uint8[] memory order_,
        address resolver_,
        bytes32 rulesHash
    ) FactoredTrading(token, events_, b, closeTime, order_) {
        if (resolver_ == address(0) || rulesHash == bytes32(0)) revert InvalidConfiguration();
        resolver = resolver_;
        settlementRulesHash = rulesHash;
    }

    function requiredCollateral() public view override returns (uint128) {
        return resolved ? remainingPayout : maximumLiability;
    }

    function resolve(uint32 terminalState) external nonReentrant {
        if (msg.sender != resolver) revert UnauthorizedResolver();
        if (!funded) revert NotFunded();
        if (resolved) revert AlreadyResolved();
        if (block.timestamp < closesAt) revert NotClosed();
        if (uint256(terminalState) >> eventCount != 0) revert InvalidOutcome();
        uint128 payout;
        for (uint256 i; i < storedFactors.length; i++) {
            payout += storedFactors[i].values[project(storedFactors[i].scope, terminalState)];
        }
        remainingPayout = payout;
        resolvedState = terminalState;
        resolved = true;
        emit Resolved(terminalState, settlementRulesHash);
    }

    function redeem(uint32 scope, uint256 mask, uint128 quantity) external nonReentrant returns (uint128 paid) {
        if (!resolved) revert NotResolved();
        requireCovered();
        positions.debit(msg.sender, scope, mask, quantity);
        burnLiability(scope, mask, quantity);
        if (mask & (uint256(1) << project(scope, resolvedState)) != 0) {
            paid = quantity;
            remainingPayout -= quantity;
            transferExact(msg.sender, paid, false);
        }
        requireCovered();
        emit Redeemed(msg.sender, scope, mask, quantity, paid);
    }

    function burnLiability(uint32 scope, uint256 mask, uint128 quantity) private {
        for (uint256 i; i < storedFactors.length; i++) {
            if (storedFactors[i].scope != scope) continue;
            for (uint256 j; j < storedFactors[i].values.length; j++) {
                if (mask & (uint256(1) << j) != 0) storedFactors[i].values[j] -= quantity;
            }
            return;
        }
        revert MissingFactor();
    }

    function project(uint32 scope, uint32 state) private pure returns (uint256 local) {
        uint256 index;
        while (scope != 0) {
            uint32 bit = scope & (~scope + 1);
            if (state & bit != 0) local |= uint256(1) << index;
            index++;
            scope &= scope - 1;
        }
    }
}
