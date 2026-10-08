import type { Abi } from 'viem';
export const kuruAbi: Abi;
export const marginAbi: Abi;
export const tokenAbi: Abi;
export const conversionAbi: Abi;
export type Contracts = Record<'pool' | 'cash' | 'receipt' | 'margin' | 'market', string> & {eventIndex?: number};
export function kuruCall(input: { to: string; data: string; account: string; contracts: Contracts }): { abi: Abi; name: string; args: readonly any[]; asset: string | null } | null;
