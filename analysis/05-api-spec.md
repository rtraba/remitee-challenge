# API specification (in progress)

Status: API behavior/defaults accepted by Rodrigo on October 14, 2026. No implementation yet. Exact compatible dependency versions/SQLite driver remain implementation choices.

## Snapshot consistency

Use recorded state from the database projection and timestamp from the last fully indexed block. Read both in one read transaction. Expose asOfBlock and asOfTimestamp. No server clock or live contract query for lifecycle calculations. No usable snapshot yet means escrow queries return 503 rather than making up timestamps.

Time-derived Pending expiry is effective status Expired with recoverable true; completed recorded Expired is recoverable false. Terminal states disable all lifecycle actions. Flags describe the designated party's state/time eligibility at the snapshot, not guaranteed transaction success.

## List order and cursor

GET /escrows?sender=&beneficiary=&status=&limit=&cursor=

Default: newest created first, numeric ID descending. Resolution does not reorder results. Cursor is exclusive and means ID < cursor. Canonical positive decimal strings only; no floating point, signs, exponent notation, leading zeros, or values above uint256.

IDs are TEXT in SQLite. Numeric ordering for canonical positive decimal IDs is length(id) DESC, id DESC. Exclusive cursor predicate:

```sql
length(id) < length(:cursor)
OR (length(id) = length(:cursor) AND id < :cursor)
```

Combine this parenthesized predicate with any AND filters. Never use plain lexicographic ordering or cast to SQLite INTEGER for uint256 IDs. Add an expression index consistent with ordering if supported by the selected SQLite driver/runtime:

```sql
CREATE INDEX escrows_newest_idx ON escrows(length(id) DESC, id DESC);
```

Fetch limit + 1 rows to determine whether a next page exists. Limits: default 20, maximum 100. nextCursor is the last emitted ID when another matching row exists; otherwise null. A cursor is an ID boundary, not a required extant escrow.

Sender/beneficiary filters combine with AND and match normalized addresses. Status filter is effective status evaluated using the same snapshot timestamp as the returned flags. Apply filters before pagination, not after fetching a page.

Each page is a consistent read, but pages are live: later requests can see newer indexed state/time. New creations with larger IDs do not shift older-page boundaries. Status-filter membership may change due to resolutions or time, causing omissions or changed results across pages. Do not claim frozen-snapshot pagination. This is an accepted simplicity trade-off.

## Proposed response information

ID, sender, beneficiary, token, raw-unit amount (decimal string), cancellation deadline and expiry (Unix seconds), recordedState, effective status, recoverable/canCancel/canConfirm/canReject, creationTransactionHash, nullable resolutionTransactionHash, and snapshot metadata.

List response: items, nextCursor, and one shared asOfBlock/asOfTimestamp. Exact shapes, validation, errors, and health follow below.


## HTTP framework and service scope

Recommended default: Fastify with TypeScript, ethers v6, SQLite, and a lightweight SQLite driver compatible with the pinned Node.js runtime. Validate the driver installation on the delivery platform early; do not introduce an ORM unless needed. One Node.js process may host HTTP and the serialized worker while keeping modules separate for tests. No transaction-signing endpoint, user authentication, wallet custody, or frontend is required.

## GET /escrows/:id

200 returns one object:

```json
{
  "id": "1",
  "sender": "0x1111111111111111111111111111111111111111",
  "beneficiary": "0x2222222222222222222222222222222222222222",
  "token": "0x3333333333333333333333333333333333333333",
  "amount": "1000000",
  "cancelDeadline": 7200,
  "expiresAt": 604800,
  "recordedState": "Pending",
  "status": "Expired",
  "recoverable": true,
  "canCancel": false,
  "canConfirm": false,
  "canReject": false,
  "creationTransactionHash": "0x...",
  "resolutionTransactionHash": null,
  "asOfBlock": 120,
  "asOfTimestamp": 604800
}
```

Illustrative timestamps/hashes above are not real deployment data. Amount is raw token units, no decimal metadata lookup or floating point. Timestamps are Unix seconds. Addresses/hashes are normalized lowercase. terminal recordedState always determines status. For Pending, status is Expired iff asOfTimestamp >= expiresAt, otherwise Pending. All flags are false for terminal states. For Pending, canCancel uses timestamp < cancelDeadline; canConfirm/canReject use timestamp < expiresAt; recoverable uses timestamp >= expiresAt. Expose recoverable rather than duplicate canRecover in HTTP.

404 means no escrow with this ID is present in the indexed snapshot; it does not establish nonexistence at the latest chain head. Explain confirmation/indexing lag in the README.

## GET /escrows

200 shape: { items: EscrowWithoutSnapshot[], nextCursor: string | null, asOfBlock: number, asOfTimestamp: number }. Omit duplicated snapshot fields from list items; all items share the top-level snapshot. No total count required.

Effective-status filters: Pending excludes timed-out Pending records; Expired includes unresolved expired Pending and completed Expired; other status values match recorded state directly. Apply time-aware filtering in SQL using the snapshot timestamp before LIMIT. Combine optional sender, beneficiary, status, and exclusive cursor predicates with AND. Fetch limit + 1 and return at most limit items.

## Input validation

- IDs and cursor: canonical positive decimal uint256 strings, no leading zeros, signs, spaces, fractions, exponent notation, or overflow. Perform bounds checks using bigint.
- Sender/beneficiary: valid Ethereum addresses using ethers validation; normalize after validation. No ENS resolution. Zero-address filter is syntactically valid even if it matches no escrows.
- Status: exact enum names Pending, CancelledBySender, Released, Rejected, Expired.
- Limit: canonical positive integer from 1 through 100, default 20.
- Reject unknown query parameters, repeated scalar parameters, and empty supplied parameters with 400. Avoid implicit array/coercion behavior.
- Read the projection/checkpoint in one DB read transaction; no RPC access inside that transaction.

## Error shape and status codes

```json
{ "error": { "code": "INVALID_ARGUMENT", "message": "cursor must be a positive uint256 decimal string" } }
```

400 INVALID_ARGUMENT: invalid path/query inputs. 404 ESCROW_NOT_FOUND: absent at indexed snapshot. 503 INDEXER_UNAVAILABLE: no initial indexed snapshot, integrity failure, deployment mismatch, or degraded service as defined below. 500 INTERNAL_ERROR: unexpected failure; do not expose stack traces, SQL, secrets, or raw RPC credentials. Log operational details locally. Unknown routes return a consistent 404 ROUTE_NOT_FOUND shape.

## GET /health

Return observable service/indexer state, not an assertion of chain finality:

- status: healthy | syncing | degraded | reorg_detected | initializing.
- chainId and contractAddress.
- confirmationDepth.
- latestObservedBlock: nullable latest successful RPC observation.
- eligibleBlock: nullable head minus depth (or null when below deployment).
- lastIndexedBlock, lastIndexedBlockHash, lastIndexedTimestamp: nullable before first commit.
- indexingLag: max(0, eligibleBlock - lastIndexedBlock), or null before usable snapshot/observation. Measure lag relative to eligible height, not the latest unconfirmed head.
- lastSuccessfulRpcAt: nullable server-clock Unix seconds, used for operational freshness only.
- rpcObservationAgeSeconds: nullable age of last successful RPC observation.
- reason: nullable stable explanation/code without sensitive internals.

Health returns 200 for healthy or syncing with a valid snapshot and recent successful RPC observation; 503 for initializing, degraded, or reorg_detected. Syncing is visible and may serve consistent older snapshots. No arbitrary lag cutoff is required for this exercise.

Recommended defaults: catch-up fallback interval 2 seconds; RPC_STALE_AFTER_SECONDS = 30, configurable. Once no successful chain observation has occurred for the freshness interval, health is degraded and escrow endpoints return 503 until recovery. A transient RPC failure before that interval does not invalidate the prior snapshot. Detect reorg/deployment mismatch immediately and persist/block reads until explicit recovery; RPC reconnection alone must not clear integrity failures.

Idle chains are not unhealthy merely because the latest block timestamp is old. Freshness measures successful RPC contact using server time; lifecycle flags always use indexed chain time. Anvil automining may pause between transactions.

GET /health remains available while escrow reads return 503 and reports the last committed checkpoint. Catch RPC errors and worker failures rather than killing HTTP without an observable reason. Before graceful shutdown, stop notifications and wait for the active atomic batch to finish or roll back.

## API acceptance tests

Detail/list schemas; raw large amounts/IDs; unknown and malformed IDs; address normalization/checksum validation; every query validation case; filter combinations; all status/time boundaries; terminal-state flag precedence; numeric descending ordering across IDs 9/10 and above 64-bit limits; exclusive cursor and limit+1 behavior; empty lists; stable per-request snapshot; live pagination limitation; no-snapshot 503; integrity-failure 503; healthy/syncing/degraded transitions; RPC freshness recovery; idle chain remains healthy after fresh observations. Use deterministic injected clocks and chain/database dependencies rather than timing-sensitive sleeps.

## Additional readiness fields and worker health

11-runtime-deployment-health.md extends /health with DB schema readiness, worker/listener/timer state, cycle/progress timestamps and event/escrow counts. A stalled/stopped worker degrades health independently of RPC freshness; recent progress during a long catch-up avoids false failure. Read-only full-stack healthcheck and separate local smoke are required.
