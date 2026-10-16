import { existsSync, renameSync } from 'node:fs';
import { config, loadManifest, provider, validateDeployment } from '../api/src/config.js';
import { writerLock } from './common.js';
import { Repository } from '../api/src/db/repository.js';
import { Reader } from '../api/src/chain/reader.js';
import { Worker } from '../api/src/indexer/worker.js';
async function main() {
  const c = config(),
    m = loadManifest(c.manifestPath, c.network),
    p = provider(c.rpcUrl);
  let release: (() => void) | undefined;
  try {
    await validateDeployment(p, m);
    release = writerLock(c.dbPath);
    const identity = {
      chainId: m.chainId,
      genesisHash: m.genesisHash,
      contractAddress: m.contractAddress,
      deploymentBlock: m.deploymentBlock,
      deploymentBlockHash: m.deploymentBlockHash,
      confirmationDepth: c.confirmationDepth,
    };
    if (existsSync(c.dbPath)) {
      // Validate identity/schema before touching data; close SQLite to consolidate WAL.
      const old = new Repository(c.dbPath, identity);
      old.db.pragma('wal_checkpoint(TRUNCATE)');
      old.close();
      const backup = c.dbPath + '.backup-' + Date.now();
      renameSync(c.dbPath, backup);
      for (const suffix of ['-wal', '-shm'])
        if (existsSync(c.dbPath + suffix)) renameSync(c.dbPath + suffix, backup + suffix);
      console.log(`Preserved database backup: ${backup}`);
    }
    const repo = new Repository(c.dbPath, identity),
      worker = new Worker(repo, new Reader(p, m));
    try {
      await worker.catchUp();
      console.log(`Rebuilt through block ${repo.checkpoint()?.number ?? 'not yet eligible'}`);
    } finally {
      await worker.stop();
      repo.close();
    }
  } finally {
    release?.();
    p.destroy();
  }
}
main().catch(() => {
  console.error(
    'Rebuild failed: stop the writer and verify deployment/schema/identity. No automatic retargeting is permitted.',
  );
  process.exitCode = 1;
});
