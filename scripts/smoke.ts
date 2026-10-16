import { localClient } from './client.js';
console.log('LOCAL ONLY: smoke creates and cancels a funded escrow.');
localClient('smoke').catch(() => {
  console.error('SMOKE FAIL: local write-path assertions did not complete');
  process.exitCode = 1;
});
