// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import {PilotPool} from "../src/PilotPool.sol";
import {PilotResolver} from "../src/PilotResolver.sol";
import {FactoredBaseToken} from "../src/FactoredBaseToken.sol";
import {IERC20Metadata, KuruRouter, KuruMargin, KuruMarket} from "../fork/KuruOrderLifecycle.t.sol";

interface PilotKuruVm {
    function envAddress(string calldata) external returns(address);
    function envUint(string calldata) external returns(uint256);
    function readFile(string calldata) external view returns(string memory);
    function parseJsonAddress(string calldata,string calldata) external pure returns(address);
    function parseJsonString(string calldata,string calldata) external pure returns(string memory);
    function parseJsonBytes32(string calldata,string calldata) external pure returns(bytes32);
    function startBroadcast(address) external;
    function stopBroadcast() external;
    function serializeAddress(string calldata,string calldata,address) external returns(string memory);
    function serializeUint(string calldata,string calldata,uint256) external returns(string memory);
    function serializeString(string calldata,string calldata,string calldata) external returns(string memory);
    function writeJson(string calldata,string calldata) external;
    function toString(uint256) external pure returns(string memory);
}

/// @notice Opt-in testnet order book for one canonical pilot YES receipt. No synthetic pair reuse.
/// @dev An explicit event selection deploys ONE pair; its separate verification is required before hosting.
contract DeployPilotKuru {
    PilotKuruVm constant vm=PilotKuruVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    function run() external {
        require(block.chainid==10143,"Monad testnet only");
        address operator=vm.envAddress("FLURBO_DEPLOYER");
        uint256 eventIndex=vm.envUint("FLURBO_PILOT_EVENT");
        string memory manifest=vm.readFile("target/deployments/pilot-testnet.json");
        require(keccak256(bytes(vm.parseJsonString(manifest,".status")))==keccak256("verified_pilot_snapshot"),"verify pilot first");
        PilotPool pool=PilotPool(vm.parseJsonAddress(manifest,".pool"));
        require(pool.funded()&&!pool.resolved()&&pool.closesAt()>block.timestamp+1 hours,"pilot is not open");
        require(pool.settlementRulesHash()==vm.parseJsonBytes32(manifest,".rulesHash"),"wrong rules");
        require(PilotResolver(pool.resolver()).creator()==operator&&eventIndex<pool.eventCount(),"invalid operator or event");
        string memory network=vm.readFile("config/monad-readiness.json");
        KuruRouter router=KuruRouter(vm.parseJsonAddress(network,".networks.testnet.contracts.kuru_router"));
        KuruMargin margin=KuruMargin(vm.parseJsonAddress(network,".networks.testnet.contracts.kuru_margin"));
        IERC20Metadata cash=IERC20Metadata(address(pool.collateral()));
        require(address(cash)==vm.parseJsonAddress(network,".networks.testnet.contracts.ausd")&&cash.decimals()==6,"wrong collateral");
        require(router.marginAccountAddress()==address(margin)&&cash.balanceOf(operator)>=11e6,"check Kuru or test funding");
        FactoredBaseToken receipt=pool.baseTokens(uint32(1)<<uint8(eventIndex),2);
        require(address(receipt)!=address(0)&&receipt.pool()==address(pool)&&receipt.scope()==uint32(1)<<uint8(eventIndex)&&receipt.mask()==2,"noncanonical receipt");
        vm.startBroadcast(operator);
        require(cash.approve(address(pool),10e6),"approve pool");
        pool.buy(uint32(1)<<uint8(eventIndex),2,10e6,10e6,block.timestamp+300);
        require(cash.approve(address(pool),0),"reset pool approval");
        pool.wrapBase(uint8(eventIndex),true,10e6);
        KuruMarket market=KuruMarket(router.deployProxy(0,address(receipt),address(cash),1e6,1e6,100,10000,100e6,30,10,100));
        require(margin.verifiedMarket(address(market)),"unregistered pair");
        // Explicit operator test liquidity. These orders are offers, not outcome probabilities.
        require(cash.approve(address(margin),900000),"approve quote deposit");margin.deposit(operator,address(cash),900000);
        require(receipt.approve(address(margin),2e6),"approve receipt deposit");margin.deposit(operator,address(receipt),2e6);
        market.addBuyOrder(450000,2e6,true);market.addSellOrder(500000,2e6,true);
        require(cash.approve(address(margin),0)&&receipt.approve(address(margin),0),"reset deposit approvals");
        vm.stopBroadcast();
        string memory key="pilot-kuru";
        vm.serializeString(key,"status","unverified_pilot_kuru");
        vm.serializeAddress(key,"pool",address(pool));vm.serializeAddress(key,"receipt",address(receipt));
        vm.serializeAddress(key,"cash",address(cash));vm.serializeAddress(key,"margin",address(margin));
        vm.serializeAddress(key,"market",address(market));vm.serializeAddress(key,"operator",operator);
        string memory output=vm.serializeUint(key,"eventIndex",eventIndex);
        vm.writeJson(output,string.concat("target/deployments/pilot-kuru-",vm.toString(eventIndex),"-unverified.json"));
    }
}
