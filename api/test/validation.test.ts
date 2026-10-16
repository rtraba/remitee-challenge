import { test, expect } from 'vitest';
import { safeInteger, uint256, address, hash } from '../src/validation.js';
test('rejects unsafe numeric conversions and noncanonical identities', () => {
  expect(safeInteger(1, 'height')).toBe(1);
  for (const n of [-1, 1.2, Number.MAX_SAFE_INTEGER + 1, '1'])
    expect(() => safeInteger(n, 'height')).toThrow();
  expect(uint256(((1n << 256n) - 1n).toString())).toHaveLength(78);
  for (const v of ['0', '01', '1e2', '-1', '', (1n << 256n).toString(), null])
    expect(() => uint256(v)).toThrow();
  expect(address('0x1111111111111111111111111111111111111111')).toBe(
    '0x1111111111111111111111111111111111111111',
  );
  expect(() => address('bad')).toThrow();
  expect(hash('0x' + 'AB'.repeat(32))).toBe('0x' + 'ab'.repeat(32));
  expect(() => hash('0x00')).toThrow();
});
