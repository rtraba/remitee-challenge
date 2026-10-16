import { localClient } from './client.js';
console.log('LOCAL ONLY: demo sends transactions and advances Anvil time by seven days.');
localClient('demo').catch((error) => {
  console.error('DEMO FAIL:', error.message);
  process.exitCode = 1;
});
