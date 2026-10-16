import { writeFileSync } from 'node:fs';
import {
  config,
  loadManifest,
  provider,
  sanitizedEndpoint,
  validateDeployment,
} from '../api/src/config.js';
import { delay } from './common.js';
export interface Check {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}
export async function diagnose(timeout = 30000) {
  const checks: Check[] = [];
  let endpoint = 'unconfigured';
  const add = (name: string, ok: boolean, detail: string) =>
    checks.push({ name, status: ok ? 'PASS' : 'FAIL', detail });
  let p: ReturnType<typeof provider> | undefined;
  try {
    const c = config(),
      m = loadManifest(c.manifestPath, c.network);
    endpoint = sanitizedEndpoint(c.rpcUrl);
    add('configuration', true, `${c.network}; ${endpoint}`);
    p = provider(c.rpcUrl);
    await validateDeployment(p, m);
    add(
      'deployment',
      true,
      'chain, genesis, receipt, runtime, ABI, constants and local fixture match',
    );
    const head = Number(await p.send('eth_blockNumber', [])),
      target = head - c.confirmationDepth;
    const deadline = Date.now() + timeout;
    let data: any;
    do {
      const response = await fetch(c.apiUrl + '/health', { signal: AbortSignal.timeout(3000) });
      data = await response.json();
      if (
        [
          'chainId',
          'genesisHash',
          'contractAddress',
          'deploymentBlock',
          'deploymentBlockHash',
        ].some((key) => data[key] !== m[key as keyof typeof m]) ||
        data.confirmationDepth !== c.confirmationDepth
      )
        throw Error('API_IDENTITY');
      if (['degraded', 'reorg_detected'].includes(data.status)) break;
      if (data.lastIndexedBlock !== null && data.lastIndexedBlock >= target && response.ok) break;
      await delay(100);
    } while (Date.now() < deadline);
    add(
      'database',
      data.databaseReady && data.schemaVersion === 1,
      `schema ${data.schemaVersion}; ${data.journalEventCount} events; ${data.escrowCount} escrows`,
    );
    const now = Date.now() / 1000,
      progress = Math.max(data.lastCycleCompletedAt ?? 0, data.lastProgressAt ?? 0);
    add(
      'worker',
      ['idle', 'running'].includes(data.workerState) &&
        data.listenerRegistered &&
        data.fallbackTimerActive &&
        now - progress < c.workerStale,
      'worker, listener, timer and progress',
    );
    add(
      'rpc freshness',
      data.rpcObservationAgeSeconds !== null && data.rpcObservationAgeSeconds < c.rpcStale,
      'independent successful RPC observation',
    );
    add('integrity', data.status !== 'reorg_detected', 'no latched integrity failure');
    const reached = data.lastIndexedBlock !== null && data.lastIndexedBlock >= target;
    add(
      'captured target',
      reached,
      `target ${target}; indexed ${data.lastIndexedBlock}; lag ${data.indexingLag}`,
    );
    if (target < m.deploymentBlock)
      checks.push({
        name: 'eligibility',
        status: 'WARN',
        detail: 'Deployment not yet eligible; usable indexed snapshot still required',
      });
    if (data.lastIndexedBlock !== null) {
      const block = await p.getBlock(data.lastIndexedBlock);
      add(
        'checkpoint canonical',
        block?.hash?.toLowerCase() === data.lastIndexedBlockHash,
        `block ${data.lastIndexedBlock}`,
      );
    }
    if (data.lastJournalEvent) {
      const event = data.lastJournalEvent;
      add(
        'journal spot check',
        event.name === 'EscrowCreated'
          ? event.creationTransactionHash === event.transactionHash
          : event.resolutionTransactionHash === event.transactionHash,
        'latest journal/projection relationship from one API database snapshot',
      );
    } else
      add(
        'journal spot check',
        data.escrowCount === 0,
        'empty deployment is valid without EscrowCreated events',
      );
    add('API readiness', ['healthy', 'syncing'].includes(data.status), 'usable API snapshot');
  } catch {
    add(
      'diagnostic',
      false,
      'Configuration, deployment, RPC or API check failed; inspect local configuration and service logs',
    );
  } finally {
    p?.destroy();
  }
  return { ok: checks.every((c) => c.status !== 'FAIL'), endpoint, checks };
}
export async function healthcheckMain(args: string[]) {
  let timeout = 30000,
    report: string | undefined,
    json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') json = true;
    else if (args[i] === '--report' && args[i + 1]) report = args[++i];
    else if (args[i] === '--timeout' && /^\d+$/.test(args[i + 1] ?? ''))
      timeout = Number(args[++i]);
    else throw Error('Invalid healthcheck arguments');
  }
  const result = await diagnose(timeout);
  if (report) writeFileSync(report, JSON.stringify(result, null, 2) + '\n');
  if (json) console.log(JSON.stringify(result));
  else {
    for (const c of result.checks) console.log(`${c.status.padEnd(4)} ${c.name}: ${c.detail}`);
    console.log(result.ok ? 'Overall PASS' : 'Overall FAIL');
  }
  return result.ok ? 0 : 1;
}
