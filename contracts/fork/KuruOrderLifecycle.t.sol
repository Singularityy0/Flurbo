// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ReferencePool} from "../src/ReferencePool.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface ForkVm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonAddress(string calldata json, string calldata key) external pure returns (address);
    function parseJsonUint(string calldata json, string calldata key) external pure returns (uint256);
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function expectCall(address callee, bytes calldata data) external;
}

interface TestAusdFaucet {
    function requestFunds(address recipient) external;
}

interface KuruRouter {
    function marginAccountAddress() external view returns (address);
    function deployProxy(
        uint8 kind,
        address base,
        address quote,
        uint96 sizePrecision,
        uint32 pricePrecision,
        uint32 tick,
        uint96 minSize,
        uint96 maxSize,
        uint256 takerFee,
        uint256 makerFee,
        uint96 spread
    ) external returns (address);
}

interface KuruMargin {
    function verifiedMarket(address market) external view returns (bool);
    function deposit(address owner, address token, uint256 amount) external payable;
    function getBalance(address owner, address token) external view returns (uint256);
    function withdraw(uint256 amount, address token) external;
}

interface KuruMarket {
    struct Order {
        address owner;
        uint96 size;
        uint40 prev;
        uint40 next;
        uint40 flippedId;
        uint32 price;
        uint32 flippedPrice;
        bool isBuy;
    }
    function addBuyOrder(uint32 price, uint96 size, bool postOnly) external;
    function addSellOrder(uint32 price, uint96 size, bool postOnly) external;
    function batchCancelOrders(uint40[] calldata ids) external;
    function s_orders(uint40 id) external view returns (Order memory);
    function placeAndExecuteMarketBuy(uint96 quoteSize, uint256 minOut, bool isMargin, bool fillOrKill)
        external
        payable
        returns (uint256);
    function placeAndExecuteMarketSell(uint96 size, uint256 minOut, bool isMargin, bool fillOrKill)
        external
        payable
        returns (uint256);
    function collectFees() external;
}

/// @dev Fork only: no broadcast/signing cheatcodes, mocked Kuru code or storage balance overrides.
contract KuruOrderLifecycleTest {
    ForkVm internal constant vm = ForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    IERC20Metadata internal ausd;
    ReferencePool private pool;
    IERC20Metadata internal receipt;
    KuruMargin internal margin;
    KuruMarket internal market;
    uint32 internal pricePrecision;
    uint96 internal sizePrecision;

    function setUp() public {
        require(block.chainid == 10143 && block.number == 64729226, "use the pinned Monad testnet fork");
        string memory network = vm.readFile("config/monad-readiness.json");
        ausd = IERC20Metadata(vm.parseJsonAddress(network, ".networks.testnet.contracts.ausd"));
        KuruRouter router = KuruRouter(vm.parseJsonAddress(network, ".networks.testnet.contracts.kuru_router"));
        margin = KuruMargin(vm.parseJsonAddress(network, ".networks.testnet.contracts.kuru_margin"));
        assert(router.marginAccountAddress() == address(margin) && ausd.decimals() == 6);
        TestAusdFaucet(vm.parseJsonAddress(network, ".networks.testnet.contracts.ausd_faucet"))
            .requestFunds(address(this));
        require(ausd.balanceOf(address(this)) >= 1000e6, "fork faucet funding insufficient");
        prepareReceipt();
        market = KuruMarket(deployPair(router));
        assert(address(market).code.length > 0 && margin.verifiedMarket(address(market)));
    }

    // Both pool implementations exercise the identical deployed Kuru interfaces and assertions.
    function prepareReceipt() internal virtual {
        pool = new ReferencePool(
            address(ausd),
            2,
            100e6,
            uint64(block.timestamp + 1 days),
            address(this),
            keccak256("synthetic fork fixture: A bit 0, B bit 1; trusted local resolver")
        );
        ausd.approve(address(pool), 1000e6);
        pool.fund();
        pool.buy(10, 10e6, 10e6, block.timestamp);
        receipt = IERC20Metadata(address(pool.createBaseToken(0, true)));
        pool.wrapBase(0, true, 10e6);
        assert(address(pool.baseTokens(10)) == address(receipt));
    }

    function deployPair(KuruRouter router) private returns (address deployed) {
        string memory config = vm.readFile("config/kuru-testnet-plan.json");
        // Keep the rehearsal aligned with the planner's exact six-decimal grid.
        assert(vm.parseJsonUint(config, ".chain_id") == block.chainid);
        assert(vm.parseJsonUint(config, ".market_type") == 0);
        assert(vm.parseJsonUint(config, ".base_decimals") == 6 && vm.parseJsonUint(config, ".quote_decimals") == 6);
        assert(
            vm.parseJsonUint(config, ".price_precision") == 1e6 && vm.parseJsonUint(config, ".size_precision") == 1e6
        );
        assert(vm.parseJsonUint(config, ".tick_size") == 100 && vm.parseJsonUint(config, ".size_step") == 10000);
        assert(vm.parseJsonUint(config, ".min_size") == 10000 && vm.parseJsonUint(config, ".max_size") == 100e6);
        assert(vm.parseJsonUint(config, ".taker_fee_bps") == 30 && vm.parseJsonUint(config, ".maker_fee_bps") == 10);
        assert(vm.parseJsonUint(config, ".amm_spread_bps") == 100);
        pricePrecision = 1e6;
        sizePrecision = 1e6;
        deployed = router.deployProxy(
            0, address(receipt), address(ausd), sizePrecision, pricePrecision, 100, 10000, 100e6, 30, 10, 100
        );
        // Static ABI returned by the deployed market must match every intended parameter.
        (bool ok, bytes memory data) = deployed.staticcall(abi.encodeWithSignature("getMarketParams()"));
        assert(
            ok
                && keccak256(data)
                    == keccak256(
                        abi.encode(
                            pricePrecision,
                            sizePrecision,
                            address(receipt),
                            uint256(6),
                            address(ausd),
                            uint256(6),
                            uint32(100),
                            uint96(10000),
                            uint96(100e6),
                            uint256(30),
                            uint256(10)
                        )
                    )
        );
    }

    function testPostOnlyBuyCancelWithdraw() public {
        uint256 wallet = ausd.balanceOf(address(this));
        uint256 custody = ausd.balanceOf(address(margin));
        bytes32 backing = backingSnapshot();
        deposit(address(ausd), 2e6);
        assert(ausd.balanceOf(address(this)) == wallet - 2e6);
        assert(ausd.balanceOf(address(margin)) == custody + 2e6);
        uint40 id = place(true, pricePrecision / 2, sizePrecision);
        assert(margin.getBalance(address(this), address(ausd)) == 1500000);
        cancel(id);
        assert(margin.getBalance(address(this), address(ausd)) == 2e6);
        margin.withdraw(2e6, address(ausd));
        assert(margin.getBalance(address(this), address(ausd)) == 0);
        assert(ausd.balanceOf(address(this)) == wallet && ausd.balanceOf(address(margin)) == custody);
        assert(backingSnapshot() == backing);
    }

    function testPostOnlySellCancelWithdrawThenRedeemBacking() public {
        uint256 wallet = receipt.balanceOf(address(this));
        uint256 custody = receipt.balanceOf(address(margin));
        bytes32 backing = backingSnapshot();
        deposit(address(receipt), 3e6);
        assert(receipt.balanceOf(address(this)) == wallet - 3e6);
        uint40 id = place(false, pricePrecision / 2, sizePrecision);
        assert(margin.getBalance(address(this), address(receipt)) == 2e6);
        cancel(id);
        assert(margin.getBalance(address(this), address(receipt)) == 3e6);
        margin.withdraw(3e6, address(receipt));
        assert(margin.getBalance(address(this), address(receipt)) == 0);
        assert(receipt.balanceOf(address(this)) == wallet && receipt.balanceOf(address(margin)) == custody);
        assert(backingSnapshot() == backing);
        uint256 cash = ausd.balanceOf(address(this));
        redeemBacking();
        assert(ausd.balanceOf(address(this)) == cash + 10e6);
        assert(receipt.totalSupply() == 0);
    }

    function redeemBacking() internal virtual {
        vm.warp(pool.closesAt());
        pool.resolve(1);
        pool.unwrapBase(0, true, 10e6);
        assert(pool.redeem(10, 10e6) == 10e6);
        assert(pool.requiredCollateral() == 0 && pool.holdings(address(receipt), 10) == 0);
    }

    function testCrossingPostOnlyOrderRevertsWithoutConsumingMargin() public {
        deposit(address(receipt), 2e6);
        deposit(address(ausd), 2e6);
        uint40 ask = place(false, pricePrecision / 2, sizePrecision);
        bytes32 backing = backingSnapshot();
        (bool ok, bytes memory reason) =
            address(market).call(abi.encodeCall(market.addBuyOrder, (pricePrecision / 2, sizePrecision, true)));
        assert(!ok && bytes4(reason) == bytes4(keccak256("PostOnlyError()")));
        assert(margin.getBalance(address(this), address(ausd)) == 2e6);
        assert(margin.getBalance(address(this), address(receipt)) == 1e6);
        assert(market.s_orders(ask).size == sizePrecision && backingSnapshot() == backing);
        cancel(ask);
        margin.withdraw(2e6, address(receipt));
        margin.withdraw(2e6, address(ausd));
    }

    function deposit(address asset, uint256 amount) internal {
        IERC20Metadata(asset).approve(address(margin), amount);
        margin.deposit(address(this), asset, amount);
        assert(margin.getBalance(address(this), asset) == amount);
    }

    function place(bool isBuy, uint32 price, uint96 size) internal returns (uint40 id) {
        vm.recordLogs();
        if (isBuy) market.addBuyOrder(price, size, true);
        else market.addSellOrder(price, size, true);
        ForkVm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (
                logs[i].emitter == address(market) && logs[i].topics.length == 1
                    && logs[i].topics[0] == keccak256("OrderCreated(uint40,address,uint96,uint32,bool)")
            ) {
                assert(id == 0);
                address owner;
                uint96 actualSize;
                uint32 actualPrice;
                bool actualBuy;
                (id, owner, actualSize, actualPrice, actualBuy) =
                    abi.decode(logs[i].data, (uint40, address, uint96, uint32, bool));
                assert(owner == address(this) && actualSize == size && actualPrice == price && actualBuy == isBuy);
            }
        }
        assert(id != 0);
        KuruMarket.Order memory order = market.s_orders(id);
        assert(order.owner == address(this) && order.size == size && order.price == price && order.isBuy == isBuy);
    }

    function cancel(uint40 id) internal {
        uint40[] memory ids = new uint40[](1);
        ids[0] = id;
        market.batchCancelOrders(ids);
        assert(market.s_orders(id).owner == address(0));
    }

    function backingSnapshot() internal view virtual returns (bytes32) {
        assert(receipt.totalSupply() == pool.holdings(address(receipt), 10));
        return keccak256(
            abi.encode(
                receipt.totalSupply(),
                pool.holdings(address(receipt), 10),
                pool.liabilities(),
                pool.requiredCollateral(),
                ausd.balanceOf(address(pool))
            )
        );
    }
}
