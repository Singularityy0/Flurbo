// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {FlurboCreAttestation} from "../src/FlurboCreAttestation.sol";
import {FactoredPool} from "../src/FactoredPool.sol";
import {PilotPool} from "../src/PilotPool.sol";
import {PilotResolver as R} from "../src/PilotResolver.sol";
import {ICreReceiver} from "../src/CreSettlementReceiver.sol";
import {MockCollateral} from "./helpers/MockCollateral.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface AttestVm {
    function warp(uint256 timestamp) external;
    function chainId(uint256 id) external;
    function prank(address sender) external;
    function expectEmit(bool, bool, bool, bool) external;
}

/// @dev Deliberately unauthenticated test transport, NOT a signature verifier or deployable forwarder.
contract AttestLocalForwarder {
    function deliver(ICreReceiver receiver, bytes memory metadata, bytes memory report) external {
        receiver.onReport(metadata, report);
    }
}

contract FlurboCreAttestationTest {
    AttestVm private constant vm = AttestVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant WORKFLOW = bytes32(uint256(0x1234));
    bytes10 private constant NAME = "001122aabb";
    address private constant AUTHOR = address(0xA11CE);
    bytes32 private constant RULES = keccak256("CRE attestation test rules only");
    bytes32 private constant OBSERVATIONS = keccak256("observations");
    uint64 private constant CLOSES = 87_400;
    uint64 private constant MAX_AGE = 1 days;

    event Attested(address indexed pool, uint32 yesMask, bytes32 indexed observationsHash, uint64 observedAt);

    AttestLocalForwarder private forwarder;
    FlurboCreAttestation private attestation;
    MockCollateral private token;
    FactoredPool private pool;
    FactoredPool private other;

    function setUp() public {
        vm.warp(1000);
        forwarder = new AttestLocalForwarder();
        attestation = make();
        token = new MockCollateral(6);
        uint8[] memory order = new uint8[](2);
        order[1] = 1;
        pool = new FactoredPool(address(token), 2, 100e6, CLOSES, order, address(this), RULES);
        other = new FactoredPool(address(token), 2, 100e6, CLOSES, order, address(this), RULES);
        vm.warp(90_000);
    }

    function make() private returns (FlurboCreAttestation) {
        return new FlurboCreAttestation(address(forwarder), WORKFLOW, NAME, AUTHOR, MAX_AGE);
    }

    function metadata() private pure returns (bytes memory) {
        return abi.encodePacked(WORKFLOW, NAME, AUTHOR, bytes2(0x0007));
    }

    function validReport() private view returns (FlurboCreAttestation.PriceReport memory) {
        return FlurboCreAttestation.PriceReport({
            version: 2,
            chainId: block.chainid,
            pool: address(pool),
            rulesHash: RULES,
            observedAt: 88_000,
            observationsHash: OBSERVATIONS,
            yesMask: 2
        });
    }

    function reject(address sender, bytes memory meta, bytes memory report, bytes4 selector) private {
        vm.prank(sender);
        (bool ok, bytes memory reason) = address(attestation).call(abi.encodeCall(attestation.onReport, (meta, report)));
        assert(!ok && bytes4(reason) == selector);
    }

    function rejectReport(FlurboCreAttestation.PriceReport memory report, bytes4 selector) private {
        reject(address(forwarder), metadata(), abi.encode(report), selector);
    }

    function deliver(FlurboCreAttestation.PriceReport memory report) private {
        forwarder.deliver(attestation, metadata(), abi.encode(report));
    }

    function testSupportsReceiverAndErc165() public view {
        assert(attestation.supportsInterface(type(ICreReceiver).interfaceId));
        assert(attestation.supportsInterface(bytes4(keccak256("onReport(bytes,bytes)"))));
        assert(attestation.supportsInterface(type(IERC165).interfaceId));
        assert(!attestation.supportsInterface(0xffffffff));
    }

    function testConfigurationCannotDisableAuthenticationOrFreshness() public {
        bad(address(0), WORKFLOW, NAME, AUTHOR, 1);
        bad(AUTHOR, WORKFLOW, NAME, AUTHOR, 1);
        bad(address(forwarder), bytes32(0), NAME, AUTHOR, 1);
        bad(address(forwarder), WORKFLOW, bytes10(0), AUTHOR, 1);
        bad(address(forwarder), WORKFLOW, NAME, address(0), 1);
        bad(address(forwarder), WORKFLOW, NAME, AUTHOR, 0);
    }

    function bad(address f, bytes32 id, bytes10 name, address owner, uint64 maxAge) private {
        try new FlurboCreAttestation(f, id, name, owner, maxAge) returns (FlurboCreAttestation) {
            assert(false);
        } catch (bytes memory reason) {
            assert(bytes4(reason) == FlurboCreAttestation.InvalidConfiguration.selector);
        }
    }

    function testValidReportIsStoredAndAnnounced() public {
        vm.expectEmit(true, true, false, true);
        emit Attested(address(pool), 2, OBSERVATIONS, 88_000);
        deliver(validReport());
        (uint32 yesMask, uint64 observedAt, bytes32 observationsHash, bytes32 reportHash) =
            attestation.attestations(address(pool));
        assert(yesMask == 2 && observedAt == 88_000 && observationsHash == OBSERVATIONS);
        assert(reportHash == keccak256(abi.encode(block.chainid, address(attestation), metadata(), abi.encode(validReport()))));
    }

    function testAttestationNeverResolvesOrSettlesAnything() public {
        deliver(validReport());
        // The pool is untouched: still unresolved, no state change, no funds moved. CRE has no authority here.
        assert(!pool.resolved());
        assert(token.balanceOf(address(attestation)) == 0 && token.balanceOf(address(pool)) == 0);
        vm.prank(AUTHOR);
        (bool ok, bytes memory reason) = address(pool).call(abi.encodeCall(pool.resolve, (2)));
        assert(!ok && bytes4(reason) == FactoredPool.UnauthorizedResolver.selector);
    }

    function testOnlyTheForwarderWithTheRightWorkflowIdentityIsAccepted() public {
        bytes memory report = abi.encode(validReport());
        reject(address(this), metadata(), report, FlurboCreAttestation.UnauthorizedForwarder.selector);
        reject(AUTHOR, metadata(), report, FlurboCreAttestation.UnauthorizedForwarder.selector);
        reject(address(forwarder), new bytes(0), report, FlurboCreAttestation.InvalidMetadata.selector);
        reject(address(forwarder), abi.encodePacked(WORKFLOW, NAME, AUTHOR), report, FlurboCreAttestation.InvalidMetadata.selector);
        reject(address(forwarder), abi.encodePacked(bytes32(uint256(1)), NAME, AUTHOR, bytes2(0x0007)), report, FlurboCreAttestation.UnauthorizedWorkflow.selector);
        reject(address(forwarder), abi.encodePacked(WORKFLOW, bytes10("ffffffffff"), AUTHOR, bytes2(0x0007)), report, FlurboCreAttestation.UnauthorizedWorkflow.selector);
        reject(address(forwarder), abi.encodePacked(WORKFLOW, NAME, address(0xBAD), bytes2(0x0007)), report, FlurboCreAttestation.UnauthorizedWorkflow.selector);
        (uint32 yesMask, uint64 observedAt,,) = attestation.attestations(address(pool));
        assert(yesMask == 0 && observedAt == 0);
    }

    function testMalformedOrMisdirectedReportsAreRejected() public {
        FlurboCreAttestation.PriceReport memory r = validReport();
        reject(address(forwarder), metadata(), abi.encodePacked(abi.encode(r), bytes32(0)), FlurboCreAttestation.InvalidReport.selector);
        reject(address(forwarder), metadata(), new bytes(0), FlurboCreAttestation.InvalidReport.selector);
        r.version = 1;
        rejectReport(r, FlurboCreAttestation.InvalidReport.selector);
        r = validReport();
        r.chainId = block.chainid + 1;
        rejectReport(r, FlurboCreAttestation.WrongReportDomain.selector);
        r = validReport();
        r.pool = address(0xdead); // no code
        rejectReport(r, FlurboCreAttestation.WrongReportDomain.selector);
        r = validReport();
        r.rulesHash = keccak256("other rules");
        rejectReport(r, FlurboCreAttestation.WrongReportDomain.selector);
        r = validReport();
        r.yesMask = 4; // a third question the pool does not have
        rejectReport(r, FlurboCreAttestation.WrongReportDomain.selector);
    }

    function testObservationMustBeAfterCloseNotInTheFutureAndFresh() public {
        FlurboCreAttestation.PriceReport memory r = validReport();
        r.observationsHash = bytes32(0);
        rejectReport(r, FlurboCreAttestation.InvalidObservation.selector);
        r = validReport();
        r.observedAt = CLOSES - 1;
        rejectReport(r, FlurboCreAttestation.InvalidObservation.selector);
        r.observedAt = 0;
        rejectReport(r, FlurboCreAttestation.InvalidObservation.selector);
        r.observedAt = uint64(block.timestamp + 1);
        rejectReport(r, FlurboCreAttestation.InvalidObservation.selector);
        r.observedAt = 88_000;
        vm.warp(88_000 + MAX_AGE + 1);
        rejectReport(r, FlurboCreAttestation.InvalidObservation.selector);
        vm.warp(88_000 + MAX_AGE);
        deliver(r);
        (, uint64 observedAt,,) = attestation.attestations(address(pool));
        assert(observedAt == 88_000);
    }

    function testEachPoolIsAttestedOnceAndReplayIsRefused() public {
        deliver(validReport());
        rejectReport(validReport(), FlurboCreAttestation.AlreadyAttested.selector);
        FlurboCreAttestation.PriceReport memory changed = validReport();
        changed.yesMask = 1;
        changed.observationsHash = keccak256("different");
        rejectReport(changed, FlurboCreAttestation.AlreadyAttested.selector);
        (uint32 yesMask,,,) = attestation.attestations(address(pool));
        assert(yesMask == 2);

        FlurboCreAttestation.PriceReport memory second = validReport();
        second.pool = address(other);
        second.yesMask = 3;
        deliver(second);
        (yesMask,,,) = attestation.attestations(address(other));
        assert(yesMask == 3);
    }

    // The same contract works for the pool type Flurbo lists on Monad testnet.
    function testAttestsARealPilotPool() public {
        vm.chainId(10143);
        vm.warp(1000);
        MockCollateral collateral = new MockCollateral(6);
        R.Config memory c;
        c.collateral = address(collateral);
        c.draftHash = keccak256("attestation fixture");
        c.closesAt = 2000;
        c.eventHashes = new bytes32[](4);
        c.observationEnds = new uint64[](4);
        for (uint8 i; i < 4; ++i) {
            c.eventHashes[i] = bytes32(uint256(i) + 1);
            c.observationEnds[i] = 3000;
        }
        c.reviewers = new address[](3);
        for (uint8 i; i < 3; ++i) c.reviewers[i] = address(uint160(100 + i));
        c.bond = 1e6;
        c.assertionPeriod = 3600;
        c.challengePeriod = 3600;
        c.votingPeriod = 3600;
        R resolver = new R(c);
        uint8[] memory order = new uint8[](4);
        for (uint8 i; i < 4; ++i) order[i] = i;
        PilotPool pilot = new PilotPool(address(collateral), 4, 10e6, 2000, order, address(resolver), resolver.rulesHash());
        resolver.bindPool(address(pilot));
        vm.warp(5000);

        FlurboCreAttestation.PriceReport memory r = FlurboCreAttestation.PriceReport({
            version: 2,
            chainId: 10143,
            pool: address(pilot),
            rulesHash: resolver.rulesHash(),
            observedAt: 4000,
            observationsHash: OBSERVATIONS,
            yesMask: 8
        });
        deliver(r);
        (uint32 yesMask,,,) = attestation.attestations(address(pilot));
        assert(yesMask == 8 && !pilot.resolved());
        r.yesMask = 16; // beyond four questions
        rejectReport(r, FlurboCreAttestation.WrongReportDomain.selector);
    }
}
