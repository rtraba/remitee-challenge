import { Repository } from './db/repository.js';
import { Worker } from './indexer/worker.js';
export function health(
  repo: Repository,
  worker: Worker,
  options: { rpcStale: number; workerStale: number },
  now = Date.now() / 1000,
) {
  return repo.snapshot((snapshot) => {
    const observed = worker.latestObservedBlock,
      eligible =
        observed === null ||
        observed - repo.identity.confirmationDepth < repo.identity.deploymentBlock
          ? null
          : observed - repo.identity.confirmationDepth;
    const age =
      worker.lastSuccessfulRpcAt === null ? null : Math.max(0, now - worker.lastSuccessfulRpcAt);
    const progress = Math.max(worker.lastCycleCompletedAt ?? 0, worker.lastProgressAt ?? 0);
    const diagnostics = repo.diagnostics();
    let status = 'healthy',
      reason: string | null = null;
    if (worker.integrityError) {
      status = 'reorg_detected';
      reason = worker.integrityError;
    } else if (diagnostics.schemaVersion !== 1) {
      status = 'degraded';
      reason = 'DATABASE_SCHEMA';
    } else if (
      worker.state === 'stopped' ||
      worker.state === 'failed' ||
      !worker.listenerRegistered ||
      !worker.fallbackTimerActive
    ) {
      status = 'degraded';
      reason = 'WORKER_STOPPED';
    } else if (age === null || age >= options.rpcStale) {
      status = 'degraded';
      reason = 'RPC_STALE';
    } else if (now - progress >= options.workerStale) {
      status = 'degraded';
      reason = 'WORKER_STALE';
    } else if (!snapshot) {
      status = 'initializing';
      reason = 'NO_INDEXED_SNAPSHOT';
    } else if (eligible !== null && snapshot.number < eligible) status = 'syncing';
    return {
      status,
      reason,
      ...repo.identity,
      confirmationDepth: repo.identity.confirmationDepth,
      databaseReady: diagnostics.schemaVersion === 1,
      ...diagnostics,
      latestObservedBlock: observed,
      eligibleBlock: eligible,
      lastIndexedBlock: snapshot?.number ?? null,
      lastIndexedBlockHash: snapshot?.hash ?? null,
      lastIndexedTimestamp: snapshot?.timestamp ?? null,
      indexingLag: snapshot && eligible !== null ? Math.max(0, eligible - snapshot.number) : null,
      lastSuccessfulRpcAt: worker.lastSuccessfulRpcAt,
      rpcObservationAgeSeconds: age,
      workerState: worker.state,
      listenerRegistered: worker.listenerRegistered,
      fallbackTimerActive: worker.fallbackTimerActive,
      lastCycleCompletedAt: worker.lastCycleCompletedAt,
      activeBatchStartedAt: worker.activeBatchStartedAt,
      lastProgressAt: worker.lastProgressAt,
    };
  });
}
