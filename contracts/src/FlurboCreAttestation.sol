// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ICreReceiver} from "./CreSettlementReceiver.sol";

interface IFlurboCreObservedPool {
    function settlementRulesHash() external view returns (bytes32);
    function closesAt() external view returns (uint64);
    function eventCount() external view returns (uint8);
}

/// @notice Records what a Chainlink CRE workflow observed for a pool. It has no settlement power.
/// @dev Accepts the same seven-word version-2 report as FactoredCreSettlementReceiver, authenticated the same way (the
/// Chainlink forwarder plus the workflow id, name and owner), but only stores it. It never calls resolve on any pool,
/// never moves funds and holds no authority over a result: the pool's bonded resolver still settles. Anyone can compare
/// an attestation's yes mask with the pool's own resolved state.
contract FlurboCreAttestation is ICreReceiver {
    error InvalidConfiguration();
    error UnauthorizedForwarder();
    error InvalidMetadata();
    error UnauthorizedWorkflow();
    error InvalidReport();
    error WrongReportDomain();
    error InvalidObservation();
    error AlreadyAttested();

    // Exactly seven ABI words, the layout of FactoredCreSettlementReceiver.SettlementReport. yesMask is its terminalState.
    struct PriceReport {
        uint8 version;
        uint256 chainId;
        address pool;
        bytes32 rulesHash;
        uint64 observedAt;
        bytes32 observationsHash;
        uint32 yesMask;
    }

    struct Attestation {
        uint32 yesMask;
        uint64 observedAt;
        bytes32 observationsHash;
        bytes32 reportHash;
    }

    address public immutable forwarder;
    bytes32 public immutable workflowId;
    bytes10 public immutable workflowName;
    address public immutable workflowOwner;
    uint64 public immutable maxReportAge;
    mapping(address pool => Attestation) public attestations;

    event Attested(address indexed pool, uint32 yesMask, bytes32 indexed observationsHash, uint64 observedAt);

    constructor(address forwarder_, bytes32 id, bytes10 name, address owner, uint64 maxAge) {
        if (forwarder_.code.length == 0 || id == bytes32(0) || name == bytes10(0) || owner == address(0) || maxAge == 0)
        {
            revert InvalidConfiguration();
        }
        forwarder = forwarder_;
        workflowId = id;
        workflowName = name;
        workflowOwner = owner;
        maxReportAge = maxAge;
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == type(ICreReceiver).interfaceId || id == type(IERC165).interfaceId;
    }

    function onReport(bytes calldata metadata, bytes calldata report) external {
        if (msg.sender != forwarder) revert UnauthorizedForwarder();
        // Production KeystoneForwarder sends 62 identity bytes plus the two-byte report ID.
        if (metadata.length != 64) revert InvalidMetadata();
        if (
            bytes32(metadata[0:32]) != workflowId || bytes10(metadata[32:42]) != workflowName
                || address(bytes20(metadata[42:62])) != workflowOwner
        ) revert UnauthorizedWorkflow();
        if (report.length != 7 * 32) revert InvalidReport();
        PriceReport memory result = abi.decode(report, (PriceReport));
        if (result.version != 2) revert InvalidReport();
        if (result.chainId != block.chainid || result.pool.code.length == 0) revert WrongReportDomain();
        IFlurboCreObservedPool pool = IFlurboCreObservedPool(result.pool);
        if (result.rulesHash != pool.settlementRulesHash() || uint256(result.yesMask) >> pool.eventCount() != 0) {
            revert WrongReportDomain();
        }
        if (
            result.observationsHash == bytes32(0) || result.observedAt == 0 || result.observedAt < pool.closesAt()
                || result.observedAt > block.timestamp || block.timestamp - result.observedAt > maxReportAge
        ) revert InvalidObservation();
        if (attestations[result.pool].observedAt != 0) revert AlreadyAttested();

        attestations[result.pool] = Attestation({
            yesMask: result.yesMask,
            observedAt: result.observedAt,
            observationsHash: result.observationsHash,
            reportHash: keccak256(abi.encode(block.chainid, address(this), metadata, report))
        });
        emit Attested(result.pool, result.yesMask, result.observationsHash, result.observedAt);
    }
}
