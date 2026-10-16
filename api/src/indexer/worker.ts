import { Repository } from '../db/repository.js';
import { IntegrityError, RangeChangedError, type Chain, type Identity } from '../types.js';
export class Worker {
  state: 'starting' | 'idle' | 'running' | 'stopped' | 'failed' = 'starting';
  listenerRegistered = false;
  fallbackTimerActive = false;
  lastCycleCompletedAt: number | null = null;
  activeBatchStartedAt: number | null = null;
  lastProgressAt: number | null = null;
  lastSuccessfulRpcAt: number | null = null;
  latestObservedBlock: number | null = null;
  integrityError: string | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private active: Promise<void> | undefined;
  private pending = false;
  private stopping = false;
  private highestFetched = -1;
  private readonly trigger = () => {
    void this.request();
  };
  constructor(
    readonly repo: Repository,
    readonly chain: Chain,
    readonly clock = () => Date.now() / 1000,
    readonly batchSize = 100,
  ) {}
  async start() {
    await this.chain.listen(this.trigger);
    this.listenerRegistered = true;
    this.timer = setInterval(this.trigger, 2000);
    this.fallbackTimerActive = true;
    await this.request();
  }
  request(): Promise<void> {
    if (this.stopping || this.integrityError) return Promise.resolve();
    this.pending = true;
    if (this.active) return this.active;
    this.active = this.drain().finally(() => {
      this.active = undefined;
    });
    return this.active;
  }
  private async drain() {
    while (this.pending && !this.stopping && !this.integrityError) {
      this.pending = false;
      this.state = 'running';
      this.activeBatchStartedAt = this.clock();
      try {
        await this.catchUp();
        this.lastCycleCompletedAt = this.clock();
        this.state = 'idle';
      } catch (error) {
        if (error instanceof IntegrityError) {
          this.integrityError = 'CHAIN_OR_PROJECTION_INTEGRITY';
          this.state = 'failed';
        } else this.state = 'idle'; // A transient provider/range error is retried by the next trigger.
      } finally {
        this.activeBatchStartedAt = null;
      }
    }
  }
  async catchUp() {
    const expected = this.repo.identity;
    const actual = await this.chain.identity();
    for (const key of [
      'chainId',
      'genesisHash',
      'contractAddress',
      'deploymentBlock',
      'deploymentBlockHash',
    ] as const)
      if (actual[key] !== expected[key]) throw new IntegrityError('Deployment identity mismatch');
    const head = await this.chain.head();
    this.latestObservedBlock = head;
    this.lastSuccessfulRpcAt = this.clock();
    let checkpoint = this.repo.checkpoint();
    if (
      checkpoint &&
      (head < checkpoint.number ||
        (await this.chain.header(checkpoint.number)).hash !== checkpoint.hash)
    )
      throw new IntegrityError('Committed history changed');
    const eligible = head - expected.confirmationDepth;
    for (
      let from = checkpoint ? checkpoint.number + 1 : expected.deploymentBlock;
      from <= eligible;

    ) {
      const to = Math.min(from + this.batchSize - 1, eligible),
        headers = [];
      for (let n = from; n <= to; n++) {
        const h = await this.chain.header(n);
        if (h.number !== n) throw new RangeChangedError('Wrong header height');
        headers.push(h);
        if (n > this.highestFetched) {
          this.highestFetched = n;
          this.lastProgressAt = this.clock();
        }
      }
      for (let i = 0; i < headers.length; i++) {
        const previous = i ? headers[i - 1] : checkpoint;
        if (previous && headers[i].parentHash !== previous.hash)
          throw new RangeChangedError('Range parent changed');
      }
      const events = (await this.chain.logs(from, to)).sort(
        (a, b) =>
          a.blockNumber - b.blockNumber ||
          a.transactionIndex - b.transactionIndex ||
          a.logIndex - b.logIndex,
      );
      for (const log of events) {
        const h = headers[log.blockNumber - from];
        if (!h || h.hash !== log.blockHash) throw new RangeChangedError('Log range changed');
      }
      if (
        (await this.chain.header(from)).hash !== headers[0].hash ||
        (await this.chain.header(to)).hash !== headers.at(-1)!.hash
      )
        throw new RangeChangedError('Uncommitted range changed');
      // Recheck the committed boundary immediately before writing.
      if (checkpoint && (await this.chain.header(checkpoint.number)).hash !== checkpoint.hash)
        throw new IntegrityError('Committed boundary changed');
      try {
        this.repo.commit(headers, events);
      } catch (error) {
        throw error instanceof IntegrityError
          ? error
          : new IntegrityError('Projection transaction rejected');
      }
      checkpoint = headers.at(-1)!;
      from = to + 1;
      this.lastProgressAt = this.clock();
    }
  }
  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.fallbackTimerActive = false;
    if (this.listenerRegistered) await this.chain.unlisten(this.trigger);
    this.listenerRegistered = false;
    await this.active;
    this.state = 'stopped';
  }
}
