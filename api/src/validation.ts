import { isAddress } from 'ethers';
export function safeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`Invalid ${label}`);
  return value;
}
export function uint256(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]*$/.test(value) ||
    value.length > 78 ||
    BigInt(value) > (1n << 256n) - 1n
  )
    throw new Error('Expected positive uint256 decimal string');
  return value;
}
export function address(value: unknown): string {
  if (typeof value !== 'string' || !isAddress(value)) throw new Error('Invalid Ethereum address');
  return value.toLowerCase();
}
export function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value))
    throw new Error('Invalid hash');
  return value.toLowerCase();
}
