# Indexer and persistence specification

Status: custom indexing, SQLite schema, idempotency, confirmation buffer, and fail-closed rebuild policy accepted by Rodrigo on October 14, 2026. No implementation yet.

## Architecture

Custom TypeScript indexer using ethers v6. One SQLite database per chain/contract deployment. One serialized ingestion worker. Block notifications trigger catch-up; periodically retry catch-up as a fallback so lost notifications or disconnections cannot prevent progress. Historical getLogs is the authoritative retrieval path; never rely exclusively on live event callbacks.

SQLite foreign keys must be enabled. Use database transactions for all journal/projection/checkpoint changes. Do RPC work before opening a database write transaction; do not hold a transaction across network waits.

## Schema

```sql
CREATE TABLE indexer_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    chain_id TEXT NOT NULL,
    genesis_hash TEXT NOT NULL,
    contract_address TEXT NOT NULL,
    deployment_block INTEGER NOT NULL,
    deployment_block_hash TEXT NOT NULL,
    confirmation_depth INTEGER NOT NULL,
    last_processed_block INTEGER,
    last_processed_block_hash TEXT
);

CREATE TABLE indexed_blocks (
    block_number INTEGER PRIMARY KEY,
    block_hash TEXT NOT NULL UNIQUE,
    parent_hash TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);

CREATE TABLE escrow_events (
    block_hash TEXT NOT NULL,
    log_index INTEGER NOT NULL,
    block_number INTEGER NOT NULL,
    transaction_hash TEXT NOT NULL,
    transaction_index INTEGER NOT NULL,
    escrow_id TEXT NOT NULL,
    event_name TEXT NOT NULL CHECK (
        event_name IN ('EscrowCreated', 'EscrowCancelled',
                      'EscrowReleased', 'EscrowRejected', 'EscrowExpired')
    ),
    payload_json TEXT NOT NULL,
    PRIMARY KEY (block_hash, log_index),
    FOREIGN KEY (block_number) REFERENCES indexed_blocks(block_number)
);

CREATE TABLE escrows (
    id TEXT PRIMARY KEY,
    sender TEXT NOT NULL,
    beneficiary TEXT NOT NULL,
    token TEXT NOT NULL,
    amount TEXT NOT NULL,
    cancel_deadline INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    recorded_state TEXT NOT NULL CHECK (
        recorded_state IN ('Pending', 'CancelledBySender',
                           'Released', 'Rejected', 'Expired')
    ),
    creation_transaction_hash TEXT NOT NULL,
    creation_block_number INTEGER NOT NULL,
    resolution_transaction_hash TEXT,
    resolution_block_number INTEGER
);

CREATE INDEX escrows_sender_idx ON escrows(sender);
CREATE INDEX escrows_beneficiary_idx ON escrows(beneficiary);
CREATE INDEX escrows_state_expiry_idx
    ON escrows(recorded_state, expires_at);
```

Store uint256 IDs and amounts as canonical decimal strings; bigint event payloads must be serialized explicitly. Normalize addresses and hashes to lowercase for storage/filter matching. Validate addresses at API boundaries. Block numbers/timestamps may use SQLite integers and JS numbers only with explicit safe-integer validation; never silently truncate.

Do not persist time-derived flags/status. Reconstruct all escrow fields from events without reading escrow storage. Event hashes and ordering come from log metadata. No token metadata dependency is required for raw-unit amounts.

## Deployment identity

Verify configured chain ID, genesis hash, contract address, deployment block number/hash against persisted identity before resuming. Null checkpoint means nothing scanned yet: start at deployment block. Otherwise start at last_processed_block + 1.

Verify deployed code exists at the configured address. Anvil resets/redeployments require a matching deployment manifest and fresh/rebuilt database, never silently reuse prior projection. Identical deterministic local history is harmless; changed indexed history is detected through hashes. Do not promise chain ID/genesis alone uniquely identify every local reset.

## Ingestion and atomicity

1. Obtain latest block, calculate eligible height, and verify persisted checkpoint hash against canonical RPC history. A head below the checkpoint is also a history/reset failure.
2. Fetch bounded contiguous ranges, including headers for every scanned block and contract logs for all five events.
3. Validate header continuity, log block hash/number and configured contract address, decode successfully, and sort by block number, transaction index, log index. Unknown/unrelated logs must be handled intentionally; malformed relevant logs must not be silently skipped.
4. Recheck range boundary hashes before persistence. If the uncommitted range changed, discard and retry without advancing checkpoint. Persistent divergence of committed history invokes the reorg policy below.
5. In one transaction, insert headers, insert new journal entries, apply only newly inserted events to escrows, and advance checkpoint through the last fully scanned block, including empty blocks.
6. Commit only if every step succeeds. On failure roll back all writes and retry/report as appropriate.

Unique event identity is (block_hash, log_index), within this single-chain database. Ethers v6 exposes block-wide log index as log.index. Transaction hash alone is not sufficient. For a future multi-chain database, include stream/chain identity in keys.

Use a conflict target limited to the journal primary key rather than indiscriminately ignoring all SQL errors. An existing identity with conflicting event contents signals corruption and must fail, not be silently accepted. Duplicate event insertion must never reapply a projection update. Duplicate block headers must agree with stored hashes.

EscrowCreated inserts one new Pending escrow. Resolution requires an existing Pending escrow and updates recorded state plus resolution transaction hash/block. Any new event implying an invalid projection transition causes rollback and prevents checkpoint advancement. First successful scan order is deterministic; no duplicate notification may run overlapping workers.

## Why duplicates occur

RPC retry, overlapping catch-up ranges, restart/rescan, and repeated notifications can deliver the same log more than once. Retrieval is at least once; transactional effects are idempotent. A crash before commit persists nothing; a crash after commit resumes beyond the committed checkpoint. Journal uniqueness remains a defense for intentional rescans and retries.

## Confirmations versus finality

CONFIRMATION_DEPTH = number of successor blocks to wait.

eligibleBlock = latestBlock - CONFIRMATION_DEPTH.

If eligibleBlock is below deployment block, index nothing yet. Local Anvil demo uses 0; default non-local configuration uses 2, configurable. At head 102 with depth 2, block 100 is eligible. No claim that two successors yield protocol finality. Ethereum protocol finality and chain-specific safe/finalized tags are future network-specific considerations.

Depth affects event eligibility, not escrow expiry. Expiry is timestamp based.

## Reorganization policy

A reorg replaces previously observed blocks with different blocks at the same heights. Orphaned events cannot remain trusted in the projection.

- Confirmation buffer reduces exposure to recent reorganizations.
- Check checkpoint hash before each catch-up and parent/log/header continuity within ranges; recheck uncommitted boundaries.
- If committed history changed or configured deployment no longer matches, stop indexing and mark unhealthy.
- Escrow endpoints return 503 while projection integrity is invalid. Health reports failure and last committed checkpoint.
- Do not auto-reset, advance checkpoint over the failure, or keep serving known-invalid escrow data.
- Supply an explicit rebuild command that reconstructs journal/projection/checkpoints from canonical events beginning at deployment. Preserve the old database as a backup; validate deployment identity/configuration before rebuilding. Do not silently retarget another contract.
- Automatic common-ancestor rollback is deferred. Waiting for confirmations alone does not eliminate all reorgs.
- Document the detection interval and RPC trust assumption; canonical history can change between checks. No promise of immediate detection or absolute finality.

## Mandatory tests

Event decoding/projection for all five events; duplicate logs leave rows/state unchanged; multiple logs in one transaction; same-height logs distinguished by block hash; ordered creation/resolution; invalid transitions roll back; journal, projection, headers, checkpoint commit atomically; injected failure then retry; restart catch-up; empty blocks advance checkpoint; lost notifications caught by retry; serialized worker; confirmation cutoff; checkpoint hash mismatch; transient uncommitted range change; local reset/deployment mismatch; unhealthy/503 behavior; explicit rebuild yields canonical projection. Reorg scenarios may use deterministic fake RPC data and an Anvil snapshot/revert integration scenario.

## Sources consulted during planning

- https://docs.ethers.org/v6/single-page/#Log
- https://ethereum.org/developers/docs/consensus-mechanisms/pos/faqs/
- https://thegraph.com/docs/en/subgraphs/overview/
- https://thegraph.com/docs/en/indexing/tooling/graph-node/

## Related finalized specifications

API schema, filters, pagination, timestamp/freshness, errors, and framework are defined in 05-api-spec.md. Startup/rebuild command targets are in 07-local-delivery.md. Exact compatible dependency versions and SQLite driver are implementation preparation choices in 08-execution-plan.md.

## Runtime/liveness extension

11-runtime-deployment-health.md fixes runtime topology: one Node.js process with Fastify and worker, ethers HTTP block polling plus initial/2-second fallback catch-up, embedded SQLite, explicit worker/listener/timer lifecycle and progress diagnostics. Include deployment/health/smoke integration tests.
