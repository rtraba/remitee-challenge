import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { provider } from '../api/src/config.js';
import { deployLocal } from './deploy.js';
import { until, delay } from './common.js';
async function main() {
  for (const port of [18545, 13000])
    await new Promise<void>((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => server.close(() => resolve()));
    });
  const dir = mkdtempSync(join(tmpdir(), 'remitee-integration-'));
  Object.assign(process.env, {
    NETWORK: 'local',
    RPC_URL: 'http://127.0.0.1:18545',
    PORT: '13000',
    API_URL: 'http://127.0.0.1:13000',
    MANIFEST_PATH: join(dir, 'local.json'),
    DB_PATH: join(dir, 'local.sqlite'),
    CONFIRMATION_DEPTH: '0',
  });
  const children: ChildProcess[] = [];
  const p = provider(process.env.RPC_URL!);
  const stop = async (child: ChildProcess) => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise((r) => child.once('exit', r)), delay(5000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  };
  const command = (file: string, args: string[] = [], env = process.env) =>
    execFileSync(process.execPath, ['--import', 'tsx', file, ...args], {
      env,
      encoding: 'utf8',
      timeout: 90000,
    });
  const health = async () => {
    try {
      return (await (await fetch(process.env.API_URL! + '/health')).json()) as any;
    } catch {
      return null;
    }
  };
  const start = async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'api/src/main.ts'], {
      stdio: 'inherit',
      env: process.env,
    });
    children.push(child);
    await until(health, (h: any) => h?.status === 'healthy');
    return child;
  };
  try {
    const anvil = spawn('anvil', ['--port', '18545', '--chain-id', '31337', '--silent'], {
      stdio: 'inherit',
    });
    children.push(anvil);
    await until(
      async () => {
        try {
          return await p.send('eth_chainId', []);
        } catch {
          return null;
        }
      },
      (x) => x === '0x7a69',
    );
    const manifest = await deployLocal();
    let api = await start();
    let initial = await health();
    assert.equal(initial.escrowCount, 0);
    assert.equal(initial.journalEventCount, 0);
    const report = join(dir, 'health.json');
    const output = command('scripts/healthcheck-cli.ts', ['--json', '--report', report]);
    assert.equal(JSON.parse(output).ok, true);
    assert.deepEqual(JSON.parse(readFileSync(report, 'utf8')), JSON.parse(output));
    assert(command('scripts/smoke.ts').includes('SMOKE PASS'));
    assert(command('scripts/demo.ts').includes('DEMO PASS'));
    let data = await health();
    assert.equal(data.escrowCount, 5);
    assert.equal(data.journalEventCount, 10);
    assert(command('scripts/healthcheck-cli.ts').includes('Overall PASS'));
    await stop(api);
    api = await start();
    data = await health();
    assert.equal(data.journalEventCount, 10);
    assert.equal(data.escrowCount, 5);
    const checkpoint = data.lastIndexedBlock;
    const snapshot = await p.send('evm_snapshot', []);
    await p.send('evm_mine', []);
    await until(health, (h: any) => h?.lastIndexedBlock > checkpoint);
    await p.send('evm_revert', [snapshot]);
    await until(health, (h: any) => h?.status === 'reorg_detected');
    assert.equal((await fetch(process.env.API_URL! + '/escrows')).status, 503);
    let failed = false;
    try {
      command('scripts/healthcheck-cli.ts', ['--json', '--timeout', '100']);
    } catch (error) {
      failed = true;
      const result = JSON.parse((error as { stdout: string }).stdout);
      assert.equal(result.ok, false);
    }
    assert(failed);
    await stop(api);
    console.log(command('scripts/rebuild.ts').trim());
    assert(readdirSync(dir).some((name) => name.includes('.backup-')));
    api = await start();
    assert.equal((await health()).journalEventCount, 10);
    await stop(api);
    const wrong = join(dir, 'wrong.json');
    writeFileSync(
      wrong,
      JSON.stringify({ ...manifest, contractAddress: manifest.demoTokenAddress }),
    );
    let mismatch = false;
    try {
      command('api/src/main.ts', [], { ...process.env, MANIFEST_PATH: wrong });
    } catch {
      mismatch = true;
    }
    assert(mismatch);
    let publicGuard = false;
    try {
      command('scripts/smoke.ts', [], {
        ...process.env,
        NETWORK: 'sepolia',
        SEPOLIA_RPC_URL: process.env.RPC_URL,
      });
    } catch {
      publicGuard = true;
    }
    assert(publicGuard);
    console.log(
      `INTEGRATION PASS: deployment, empty readiness, health JSON/report/exit, smoke/demo, restart, real Anvil reset/reorg, backed-up rebuild and identity/local-only guards. Evidence directory: ${dir}`,
    );
  } finally {
    for (const child of [...children].reverse()) await stop(child);
    p.destroy();
  }
}
main().catch((error) => {
  console.error('INTEGRATION FAIL', error.message);
  process.exitCode = 1;
});
