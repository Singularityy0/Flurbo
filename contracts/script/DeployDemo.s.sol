// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {FactoredPool} from "../src/FactoredPool.sol";
import {FactoredBaseToken} from "../src/FactoredBaseToken.sol";
import {FactoredArbitrage} from "../fork/helpers/FactoredArbitrage.sol";
import {IERC20Metadata, KuruRouter, KuruMargin, KuruMarket} from "../fork/KuruOrderLifecycle.t.sol";

interface DeployVm {
    function envAddress(string calldata) external returns (address);
    function envUint(string calldata) external returns (uint256);
    function readFile(string calldata) external view returns (string memory);
    function parseJsonAddress(string calldata, string calldata) external pure returns (address);
    function parseJsonUint(string calldata, string calldata) external pure returns (uint256);
    function startBroadcast(address) external;
    function stopBroadcast() external;
    function serializeAddress(string calldata, string calldata, address) external returns (string memory);
    function serializeUint(string calldata, string calldata, uint256) external returns (string memory);
    function serializeString(string calldata, string calldata, string calldata) external returns (string memory);
    function serializeBytes32(string calldata, string calldata, bytes32) external returns (string memory);
    function writeJson(string calldata, string calldata) external;
}

/// @notice Explicitly invoked, synthetic testnet demo. Default forge script execution is a dry run.
/// @dev No private-key environment variable, faucet call or mainnet path. Requires pre-funded sender.
contract DeployDemo {
    DeployVm private constant vm = DeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    string public constant RULES =
        "Flurbo synthetic demo v1: eight independent binary test fixtures; event i is bit i; immutable deployer resolves once after close; no cancellation; no real-world outcome source.";

    function run() external {
        require(block.chainid == 10143, "Monad testnet only");
        address operator = vm.envAddress("FLURBO_DEPLOYER");
        uint256 close = vm.envUint("FLURBO_DEMO_CLOSES_AT");
        require(
            operator != address(0) && close > block.timestamp + 1 hours && close < block.timestamp + 30 days,
            "invalid operator or close"
        );
        string memory network = vm.readFile("config/monad-readiness.json");
        IERC20Metadata cash = IERC20Metadata(vm.parseJsonAddress(network, ".networks.testnet.contracts.ausd"));
        KuruRouter router = KuruRouter(vm.parseJsonAddress(network, ".networks.testnet.contracts.kuru_router"));
        KuruMargin margin = KuruMargin(vm.parseJsonAddress(network, ".networks.testnet.contracts.kuru_margin"));
        require(
            cash.decimals() == 6 && router.marginAccountAddress() == address(margin), "network configuration mismatch"
        );
        validatePairDraft();
        // Conservative 100 AUSD prerequisite covers subsidy, initial buy cap, executor and bid inventory.
        require(cash.balanceOf(operator) >= 100e6, "deployer needs 100 test AUSD");
        uint8[] memory order = new uint8[](8);
        for (uint8 i; i < 8; i++) {
            order[i] = i;
        }
        vm.startBroadcast(operator);
        FactoredPool pool =
            new FactoredPool(address(cash), 8, 10e6, uint64(close), order, operator, keccak256(bytes(RULES)));
        require(cash.approve(address(pool), pool.requiredFunding() + 10e6));
        pool.fund();
        pool.buy(128, 2, 10e6, 10e6, block.timestamp + 1 hours);
        require(cash.approve(address(pool), 0));
        FactoredBaseToken receipt = pool.createBaseToken(7, true);
        pool.wrapBase(7, true, 10e6);
        KuruMarket market = KuruMarket(
            router.deployProxy(0, address(receipt), address(cash), 1e6, 1e6, 100, 10000, 100e6, 30, 10, 100)
        );
        require(margin.verifiedMarket(address(market)), "Kuru market not registered");
        FactoredArbitrage executor = new FactoredArbitrage(pool, market, 7, true);
        require(cash.transfer(address(executor), 20e6));
        require(cash.approve(address(margin), 900000));
        margin.deposit(operator, address(cash), 900000);
        require(receipt.approve(address(margin), 2e6));
        margin.deposit(operator, address(receipt), 2e6);
        market.addBuyOrder(450000, 2e6, true);
        market.addSellOrder(500000, 2e6, true);
        vm.stopBroadcast();
        writeManifest(operator, pool, receipt, market, executor, margin);
    }

    function validatePairDraft() private view {
        string memory draft = vm.readFile("config/kuru-testnet-plan.json");
        require(vm.parseJsonUint(draft, ".chain_id") == 10143 && vm.parseJsonUint(draft, ".market_type") == 0);
        require(vm.parseJsonUint(draft, ".base_decimals") == 6 && vm.parseJsonUint(draft, ".quote_decimals") == 6);
        require(vm.parseJsonUint(draft, ".size_precision") == 1e6 && vm.parseJsonUint(draft, ".price_precision") == 1e6);
        require(vm.parseJsonUint(draft, ".tick_size") == 100 && vm.parseJsonUint(draft, ".size_step") == 10000);
        require(vm.parseJsonUint(draft, ".min_size") == 10000 && vm.parseJsonUint(draft, ".max_size") == 100e6);
        require(vm.parseJsonUint(draft, ".taker_fee_bps") == 30 && vm.parseJsonUint(draft, ".maker_fee_bps") == 10);
        require(vm.parseJsonUint(draft, ".amm_spread_bps") == 100);
    }

    function writeManifest(
        address operator,
        FactoredPool pool,
        FactoredBaseToken receipt,
        KuruMarket market,
        FactoredArbitrage executor,
        KuruMargin margin
    ) private {
        string memory key = "demo";
        vm.serializeString(key, "status", "unverified");
        vm.serializeString(key, "rules", RULES);
        vm.serializeUint(key, "chain_id", 10143);
        vm.serializeUint(key, "scope", 128);
        vm.serializeUint(key, "mask", 2);
        vm.serializeUint(key, "event_count", 8);
        vm.serializeUint(key, "liquidity_atoms", 10e6);
        vm.serializeUint(key, "closes_at", pool.closesAt());
        vm.serializeUint(key, "initial_funding_atoms", pool.requiredFunding());
        vm.serializeBytes32(key, "rules_hash", pool.settlementRulesHash());
        vm.serializeAddress(key, "operator", operator);
        vm.serializeAddress(key, "resolver", operator);
        vm.serializeAddress(key, "pool", address(pool));
        vm.serializeAddress(key, "receipt", address(receipt));
        vm.serializeAddress(key, "cash", address(pool.collateral()));
        vm.serializeAddress(key, "market", address(market));
        vm.serializeAddress(key, "margin", address(margin));
        string memory output = vm.serializeAddress(key, "executor", address(executor));
        // A dry run also writes this file. Only the separate RPC verifier may label it verified.
        vm.writeJson(output, "target/deployments/demo-unverified.json");
    }
}
