// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import {KuruOrderLifecycleTest, IERC20Metadata} from "./KuruOrderLifecycle.t.sol";
import {PilotPool} from "../src/PilotPool.sol";
import {PilotResolver as R} from "../src/PilotResolver.sol";
import {DeployPilotKuru} from "../script/DeployPilotKuru.s.sol";

/// @dev Real Kuru contracts on a pinned local fork. Never broadcasts.
contract PilotKuruOrderLifecycleTest is KuruOrderLifecycleTest {
    PilotPool private pilot;
    R private resolver;

    function prepareReceipt() internal override {
        R.Config memory c;
        c.collateral=address(ausd); c.draftHash=keccak256("labelled fork fixture");
        c.closesAt=uint64(block.timestamp+1 days);
        c.eventHashes=new bytes32[](2); c.eventHashes[0]=bytes32(uint256(1)); c.eventHashes[1]=bytes32(uint256(2));
        c.observationEnds=new uint64[](2); c.observationEnds[0]=c.closesAt+1; c.observationEnds[1]=c.closesAt+1;
        c.reviewers=new address[](3); c.reviewers[0]=address(101); c.reviewers[1]=address(102); c.reviewers[2]=address(103);
        c.bond=1e6; c.assertionPeriod=3600; c.challengePeriod=3600; c.votingPeriod=3600;
        resolver=new R(c);
        uint8[] memory order=new uint8[](2); order[1]=1;
        pilot=new PilotPool(address(ausd),2,10e6,c.closesAt,order,address(resolver),resolver.rulesHash());
        resolver.bindPool(address(pilot));
        ausd.approve(address(pilot),100e6); pilot.fund(); pilot.buy(1,2,10e6,10e6,block.timestamp);
        receipt=IERC20Metadata(address(pilot.createBaseToken(0,true))); pilot.wrapBase(0,true,10e6);
    }
    function backingSnapshot() internal view override returns(bytes32) {
        assert(receipt.totalSupply()==pilot.holdings(address(receipt),1,2));
        return keccak256(abi.encode(receipt.totalSupply(),pilot.holdings(address(receipt),1,2),pilot.requiredCollateral(),ausd.balanceOf(address(pilot))));
    }
    function redeemBacking() internal override {
        vm.warp(resolver.observationEnds(0)); ausd.approve(address(resolver),1e6);
        resolver.assertOutcome(0,R.Outcome.Yes,keccak256("fixture"),"https://example.org/fixture");
        vm.warp(resolver.assertionDeadline(1)); resolver.finalize(0); resolver.finalize(1); resolver.deliver();
        resolver.withdrawBond();
        pilot.unwrapBase(0,true,10e6); assert(pilot.redeem(1,2,10e6)==10e6);
    }
    function testFilledReceiptHasUniformVoidPayout() public {
        address taker=address(0xB0B);
        bytes32 backing=backingSnapshot(); deposit(address(receipt),2e6);
        uint40 ask=place(false,500000,2e6);
        ausd.transfer(taker,500000);
        vm.prank(taker); ausd.approve(address(margin),500000);
        vm.prank(taker); margin.deposit(taker,address(ausd),500000);
        vm.prank(taker); uint256 received=market.placeAndExecuteMarketBuy(500000,997000,true,true);
        assert(received==997000 && backingSnapshot()==backing);
        cancel(ask); margin.withdraw(1e6,address(receipt));
        vm.prank(taker); margin.withdraw(received,address(receipt));
        vm.warp(resolver.assertionDeadline(0)); resolver.finalize(0); resolver.finalize(1); resolver.deliver();
        uint256 beforeCash=ausd.balanceOf(taker);
        vm.prank(taker); pilot.unwrapBase(0,true,uint128(received));
        vm.prank(taker); assert(pilot.redeem(1,2,uint128(received))==received/2);
        assert(ausd.balanceOf(taker)==beforeCash+received/2);
        assert(receipt.totalSupply()==pilot.holdings(address(receipt),1,2));
    }
}
