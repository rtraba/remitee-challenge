import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config, loadManifest, provider, validateDeployment } from './config.js';
import { Repository } from './db/repository.js';
import { Reader } from './chain/reader.js';
import { Worker } from './indexer/worker.js';
import { createApp } from './app.js';
import { writerLock } from '../../scripts/common.js';
async function main() {
  const c = config(),
    m = loadManifest(c.manifestPath, c.network),
    p = provider(c.rpcUrl);
  let release: (() => void) | undefined,
    repo: Repository | undefined,
    worker: Worker | undefined,
    app: ReturnType<typeof createApp> | undefined;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await app?.close();
    await worker?.stop();
    repo?.close();
    p.destroy();
    release?.();
  };
  try {
    await validateDeployment(p, m);
    mkdirSync(dirname(c.dbPath), { recursive: true });
    release = writerLock(c.dbPath);
    repo = new Repository(c.dbPath, {
      chainId: m.chainId,
      genesisHash: m.genesisHash,
      contractAddress: m.contractAddress,
      deploymentBlock: m.deploymentBlock,
      deploymentBlockHash: m.deploymentBlockHash,
      confirmationDepth: c.confirmationDepth,
    });
    worker = new Worker(repo, new Reader(p, m));
    app = createApp(repo, worker, c);
    process.once('SIGINT', () => void stop());
    process.once('SIGTERM', () => void stop());
    await app.listen({ host: '127.0.0.1', port: c.port });
    await worker.start();
    console.log(`API listening on http://127.0.0.1:${c.port}; inspect /health for readiness`);
  } catch {
    await stop();
    console.error(
      'API startup failed: verify configuration, deployment identity, schema and exclusive database ownership.',
    );
    process.exitCode = 1;
  }
}
void main();
