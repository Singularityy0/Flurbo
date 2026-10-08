// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;
import {PilotPool} from "../src/PilotPool.sol";
import {PilotResolver} from "../src/PilotResolver.sol";
import {FactoredBaseToken} from "../src/FactoredBaseToken.sol";
import {IERC20Metadata, KuruRouter, KuruMargin, KuruMarket} from "../fork/KuruOrderLifecycle.t.sol";

interface PilotKuruVm {
    function envAddress(string calldata) external returns(address);
    function envUint(string calldata) external returns(uint256);
    function envOr(string calldata,uint256) external returns(uint256);
    function envString(string calldata) external returns(string memory);
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
    function toString(address) external pure returns(string memory);
}

/// @notice Opt-in testnet order book for one canonical pilot YES receipt. No synthetic pair reuse.
/// @dev An explicit event selection deploys ONE pair; its separate verification is required before hosting.
/// Optional inventory settings: FLURBO_KURU_SEED_SHARES (YES bought and wrapped, default 10e6), FLURBO_KURU_MAX_COST
/// (per-leg cost cap, default 10e6), FLURBO_KURU_BALANCE_NO (1 also buys the same quantity of NO and keeps it unwrapped, so the
/// pool price returns to about where it started; default 0) and FLURBO_KURU_LEVEL_SIZE (size of each resting order, default 2e6).
contract DeployPilotKuru {
    PilotKuruVm constant vm=PilotKuruVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint32 constant BID_LOW=460000;
    uint32 constant BID_HIGH=480000;
    uint32 constant ASK_LOW=520000;
    uint32 constant ASK_HIGH=540000;

    struct Plan {
        address operator;
        uint256 eventIndex;
        uint256 seed;
        uint256 maxCost;
        bool balanceNo;
        uint256 level;
        uint256 bidCash;
    }

    function run() external {
        require(block.chainid==10143,"Monad testnet only");
        Plan memory p=readPlan();
        PilotPool pool=checkedPool(p);
        string memory network=vm.readFile("config/monad-readiness.json");
        KuruRouter router=KuruRouter(vm.parseJsonAddress(network,".networks.testnet.contracts.kuru_router"));
        KuruMargin margin=KuruMargin(vm.parseJsonAddress(network,".networks.testnet.contracts.kuru_margin"));
        IERC20Metadata cash=IERC20Metadata(address(pool.collateral()));
        require(address(cash)==vm.parseJsonAddress(network,".networks.testnet.contracts.ausd")&&cash.decimals()==6,"wrong collateral");
        require(router.marginAccountAddress()==address(margin)&&cash.balanceOf(p.operator)>=2*p.maxCost+p.bidCash+1e6,"check Kuru or test funding");
        uint32 scope=uint32(1)<<uint8(p.eventIndex);
        FactoredBaseToken receipt=pool.baseTokens(scope,2);
        require(address(receipt)!=address(0)&&receipt.pool()==address(pool)&&receipt.scope()==scope&&receipt.mask()==2,"noncanonical receipt");
        vm.startBroadcast(p.operator);
        seedInventory(pool,cash,p,scope);
        KuruMarket market=KuruMarket(router.deployProxy(0,address(receipt),address(cash),1e6,1e6,100,10000,100e6,30,10,100));
        require(margin.verifiedMarket(address(market)),"unregistered pair");
        // Explicit operator test liquidity: two resting levels each side. These orders are offers, not outcome probabilities.
        quoteLevels(margin,market,cash,receipt,p);
        vm.stopBroadcast();
        writeOutput(pool,receipt,cash,margin,market,p.operator,p.eventIndex);
    }

    function readPlan() private returns (Plan memory p) {
        p.operator=vm.envAddress("FLURBO_DEPLOYER");
        p.eventIndex=vm.envUint("FLURBO_KURU_EVENT_INDEX");
        p.seed=vm.envOr("FLURBO_KURU_SEED_SHARES",uint256(10e6));
        p.maxCost=vm.envOr("FLURBO_KURU_MAX_COST",uint256(10e6));
        p.balanceNo=vm.envOr("FLURBO_KURU_BALANCE_NO",uint256(0))==1;
        p.level=vm.envOr("FLURBO_KURU_LEVEL_SIZE",uint256(2e6));
        require(p.level>0&&p.level<=100e6&&p.seed>=2*p.level&&p.seed<=type(uint96).max&&p.maxCost>0&&p.maxCost<=type(uint96).max,"invalid seed settings");
        p.bidCash=((uint256(BID_LOW)+BID_HIGH)*p.level+1e6-1)/1e6;
    }

    function checkedPool(Plan memory p) private returns (PilotPool pool) {
        string memory manifest=vm.readFile(vm.envString("FLURBO_KURU_MANIFEST"));
        require(keccak256(bytes(vm.parseJsonString(manifest,".status")))==keccak256("verified_pilot_snapshot"),"verify pilot first");
        pool=PilotPool(vm.parseJsonAddress(manifest,".pool"));
        require(address(pool)==vm.envAddress("FLURBO_KURU_POOL"),"wrong pool selection");
        require(p.eventIndex<32,"invalid event bit");
        require(pool.funded()&&!pool.resolved()&&pool.closesAt()>block.timestamp+1 hours,"pilot is not open");
        require(pool.settlementRulesHash()==vm.parseJsonBytes32(manifest,".rulesHash"),"wrong rules");
        require(PilotResolver(pool.resolver()).creator()==p.operator&&p.eventIndex<pool.eventCount(),"invalid operator or event");
    }

    /// @dev Buying the same quantity of YES and NO is a complete set, so the pool price returns to about where it started
    /// and the cheap Kuru quotes are not an arbitrage against the pool. The YES is wrapped into the receipt; the NO stays unwrapped.
    function seedInventory(PilotPool pool,IERC20Metadata cash,Plan memory p,uint32 scope) private {
        require(cash.approve(address(pool),p.maxCost),"approve pool");
        pool.buy(scope,2,uint128(p.seed),uint128(p.maxCost),block.timestamp+300);
        if(p.balanceNo){
            require(cash.approve(address(pool),p.maxCost),"approve pool for balancing");
            pool.buy(scope,1,uint128(p.seed),uint128(p.maxCost),block.timestamp+300);
        }
        require(cash.approve(address(pool),0),"reset pool approval");
        pool.wrapBase(uint8(p.eventIndex),true,uint128(p.seed));
    }

    function quoteLevels(KuruMargin margin,KuruMarket market,IERC20Metadata cash,FactoredBaseToken receipt,Plan memory p) private {
        require(cash.approve(address(margin),p.bidCash),"approve quote deposit");margin.deposit(p.operator,address(cash),p.bidCash);
        require(receipt.approve(address(margin),2*p.level),"approve receipt deposit");margin.deposit(p.operator,address(receipt),2*p.level);
        market.addBuyOrder(BID_LOW,uint96(p.level),true);market.addBuyOrder(BID_HIGH,uint96(p.level),true);
        market.addSellOrder(ASK_LOW,uint96(p.level),true);market.addSellOrder(ASK_HIGH,uint96(p.level),true);
        require(cash.approve(address(margin),0)&&receipt.approve(address(margin),0),"reset deposit approvals");
    }

    function writeOutput(
        PilotPool pool,FactoredBaseToken receipt,IERC20Metadata cash,KuruMargin margin,
        KuruMarket market,address operator,uint256 eventIndex
    ) private {
        string memory key="pilot-kuru";
        vm.serializeString(key,"status","unverified_pilot_kuru");
        vm.serializeAddress(key,"pool",address(pool));vm.serializeAddress(key,"receipt",address(receipt));
        vm.serializeAddress(key,"cash",address(cash));vm.serializeAddress(key,"margin",address(margin));
        vm.serializeAddress(key,"market",address(market));vm.serializeAddress(key,"operator",operator);
        string memory output=vm.serializeUint(key,"eventIndex",eventIndex);
        vm.writeJson(output,string.concat("target/deployments/kuru-",vm.toString(address(pool)),"-event-",vm.toString(eventIndex),"-unverified.json"));
    }
}
