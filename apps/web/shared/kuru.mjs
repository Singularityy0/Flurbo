import { parseAbi, decodeFunctionData, encodeFunctionData } from 'viem';

export const kuruAbi = parseAbi([
  'function addBuyOrder(uint32 price,uint96 size,bool postOnly)',
  'function addSellOrder(uint32 price,uint96 size,bool postOnly)',
  'function batchCancelOrders(uint40[] ids)',
  'function placeAndExecuteMarketBuy(uint96 amount,uint256 minOut,bool isMargin,bool fillOrKill) payable returns (uint256)',
  'function placeAndExecuteMarketSell(uint96 amount,uint256 minOut,bool isMargin,bool fillOrKill) payable returns (uint256)',
  'function s_orders(uint40 id) view returns (address owner,uint96 size,uint40 prev,uint40 next,uint40 flippedId,uint32 price,uint32 flippedPrice,bool isBuy)',
  'event OrderCreated(uint40 orderId,address owner,uint96 size,uint32 price,bool isBuy)',
  'event OrderCanceled(uint40 orderId,address owner,uint32 price,uint96 size,bool isBuy)',
  'event Trade(uint40 orderId,address makerAddress,bool isBuy,uint256 price,uint96 updatedSize,address takerAddress,address txOrigin,uint96 filledSize)',
]);
export const marginAbi = parseAbi([
  'function deposit(address owner,address token,uint256 amount) payable',
  'function withdraw(uint256 amount,address token)',
  'function getBalance(address owner,address token) view returns (uint256)',
]);
export const tokenAbi = parseAbi([
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'event Approval(address indexed owner,address indexed spender,uint256 value)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
const addr = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) && BigInt(value) > 0n;
const same = (a, b) => addr(a) && addr(b) && a.toLowerCase() === b.toLowerCase();
const amount = n => typeof n === 'bigint' && n > 0n && n <= 100_000_000n;

// Shared by the signing adapter and server. Canonical decoding rejects trailing
// bytes, alternate booleans and calldata outside this one original receipt pair.
export function kuruCall({ to, data, account, contracts }) {
  try {
    if (!addr(account) || !contracts || !['pool', 'cash', 'receipt', 'margin', 'market'].every(k => addr(contracts[k]))) return null;
    const asset = same(to, contracts.cash) ? 'cash' : same(to, contracts.receipt) ? 'receipt' : null;
    const abi = asset ? tokenAbi : same(to, contracts.margin) ? marginAbi : same(to, contracts.market) ? kuruAbi : null;
    if (!abi) return null;
    const { functionName: name, args } = decodeFunctionData({ abi, data });
    if (encodeFunctionData({ abi, functionName: name, args }).toLowerCase() !== data.toLowerCase()) return null;
    let valid = false;
    if (asset) valid = name === 'approve' && same(args[0], contracts.margin) && (amount(args[1]) || args[1] === 0n);
    else if (same(to, contracts.margin)) valid = name === 'deposit'
      ? same(args[0], account) && [contracts.cash, contracts.receipt].some(a => same(a, args[1])) && amount(args[2])
      : name === 'withdraw' && amount(args[0]) && [contracts.cash, contracts.receipt].some(a => same(a, args[1]));
    else if (['addBuyOrder', 'addSellOrder'].includes(name)) valid = Number(args[0]) > 0 && Number(args[0]) <= 1_000_000 && Number(args[0]) % 100 === 0 && amount(args[1]) && args[1] % 10000n === 0n && args[2] === true;
    else if (name === 'batchCancelOrders') valid = args[0].length === 1 && args[0][0] > 0 && args[0][0] < 2 ** 40;
    else if (['placeAndExecuteMarketBuy', 'placeAndExecuteMarketSell'].includes(name)) valid = amount(args[0]) && amount(args[1]) && args[2] === true && args[3] === true;
    return valid ? { abi, name, args, asset } : null;
  } catch { return null; }
}
