# Remitee ERC-20 escrow challenge

A non-upgradeable ERC-20 escrow, event-derived SQLite indexer, and read-only TypeScript API. Repository: [rtraba/remitee-challenge](https://github.com/rtraba/remitee-challenge). Design and execution records are preserved in [analysis](analysis/README.md), with ongoing evidence in [implementation status](analysis/implementation-status.md).

Local Anvil delivery is implemented and tested. Sepolia deployment and explorer commands are prepared, with local command/preflight tests only: no public deployment, simulation, source-verification submission, evaluator contact, or solution submission has been performed.

## Install and run

Tested on Linux x64 with Node **22.16.0**, npm **10.9.2**, Forge/Anvil **1.1.0-stable** (`d484a00089d789a19e2e43e63bbb3f1500eb2cbf`). Use Node 22 via `.nvmrc`. Install that Foundry release from the [official Foundry releases](https://github.com/foundry-rs/foundry/releases/tag/v1.1.0); `forge` and `anvil` must be on PATH. Solidity **0.8.30**, Cancun EVM and optimizer **200** runs are pinned in `contracts/foundry.toml`. forge-std **v1.9.7** is vendored with its licenses; OpenZeppelin **5.4.0** is pinned through npm. See [toolchain notes](docs/toolchain.md) for official references and the npm peer-resolution workaround.

```bash
git clone https://github.com/rtraba/remitee-challenge.git
cd remitee-challenge
nvm use                         # if using nvm
npm ci                          # npm install also supported
npm run build
npm test
npm run local                   # stays in foreground; Ctrl-C stops owned API + Anvil
```

In another terminal, from the same checkout and with the same configuration:

```bash
npm run healthcheck
npm run healthcheck -- --json
npm run healthcheck -- --report /tmp/remitee-health.json
npm run smoke
npm run demo
```

Wait for `Local system ready` before clients. Defaults are RPC `http://127.0.0.1:8545`, API `http://127.0.0.1:3000`, manifest `deployments/local.json`, DB `data/local.sqlite`. Startup checks ports and refuses existing DB/manifest paths. It never kills unrelated processes or erases old data. For a new chain/session, select **both** fresh paths, and export the same values in client terminals:

```bash
export NETWORK=local
export MANIFEST_PATH=deployments/session-2.json
export DB_PATH=data/session-2.sqlite
npm run local
```

Local fixtures use the publicly known Anvil development mnemonic and accounts 0/1. They have no value outside development. Demo token supply is funded to account 0. Local deployment uses Anvil's unlocked account 0; smoke/demo sign through fixture wallets in a separate client process. API configuration contains no signer or key. Never fund these fixture accounts on a public network.

`smoke` intentionally creates and cancels one escrow. `demo` creates four separate escrows, asserts cancellation/release/rejection/recovery payouts, advances Anvil seven days, and asserts Pending-but-expired API state before recovery. Both compare transaction/block hashes with the journal and projection. Repeated runs create new IDs and check balance deltas; they do not assume ID 1 or zero history. Ordinary healthcheck and `GET /health` are read-only.

## Commands and actual verification

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile pinned Solidity and check strict TypeScript |
| `npm run test:contract` | Foundry Solidity behavioral/security tests |
| `npm run test:api` | SQLite, worker, ABI reader, HTTP, health and command tests |
| `npm test` | Both mandatory automated suites |
| `npm run coverage:contract` | Forge summary + `coverage/contracts.lcov` |
| `npm run coverage:api` | V8 summary + JSON/LCOV in `coverage/api/` |
| `npm run test:integration` | Isolated Anvil deployment, diagnostics, smoke/demo, restart, reorg and rebuild |
| `npm run local` | Fresh full-system supervisor |
| `npm run deploy:local` | Deploy fixtures to an already-running local Anvil |
| `npm run api:start` | Start API/worker against selected running chain/manifest/DB |
| `npm run indexer:rebuild` | Explicit stopped-writer canonical rebuild, preserving DB backup |
| `npm run healthcheck -- --timeout 10000` | Read-only diagnostic, bounded target wait in milliseconds |
| `npm run smoke` / `npm run demo` | Explicit local state-changing verification |
| `npm run format` | Format first-party TypeScript |

Integration uses dedicated ports 18545 and 13000, checks availability before starting, stores temporary manifests/DB/backups/reports under `/tmp/remitee-integration-*`, and cleans up only its own processes. Do not run two integrations concurrently. Its real snapshot/revert case asserts integrity failure and HTTP 503, then rebuilds while preserving the old database. API restart retains exactly 5 escrows/10 events after smoke plus demo. Negative tests intentionally produce failure messages while the overall test still passes.

Measured on October 16, 2026: **10 Forge tests** and **29 backend tests** passed (scenario groups contain explicit boundary/action matrices). Build and live isolated integration passed. First-party coverage:

| Scope | Lines | Statements | Functions | Branches |
| --- | --- | --- | --- | --- |
| `contracts/src/Escrow.sol` | **100% (59/59)** | **100% (66/66)** | **100% (18/18)** | **100% (11/11)** |
| `api/src` excluding thin `main.ts` | **99.71% (355/356)** | **99.74% (388/389)** | **98.41% (62/63)** | **96.54% (307/318)** |

Targets were 100% contract lines/statements/functions and >=95% branches; backend >=90% lines/statements/functions and >=85% branches. Measured targets are met. The uncovered backend line/function is the default wall-clock closure in `app.ts`; injected clocks support deterministic boundary tests. Remaining uncovered branches include defensive/null/order combinations; no percentage is inferred for uninstrumented CLI execution. First-party indexer statements/lines/functions measured 100%.

Forge emitted source-map anchor warnings (including modifier locations); raw coverage reports are retained unmodified, and percentages are not proof of correctness. Its combined report also includes partial OpenZeppelin, fixture and Forge-script coverage: that aggregate is **not** claimed as 100%. Named deploy scripts are exercised by live Anvil integration; production Sepolia execution remains untested. Coverage disables optimization, so restore production artifacts with `npm run build`. Clean-checkout evidence is recorded in [implementation status](analysis/implementation-status.md). Coverage is scoped to first-party `Escrow.sol` and `api/src` logic; the thin API entry point and scripts are covered by separate runtime/integration/preflight tests. Percentage targets are project goals, not requirements imposed by the challenge PDF. Source-map/instrumentation limitations and unsupported public paths are reported explicitly.

## Purpose

The solution combines a Solidity escrow contract with a Node.js/TypeScript event indexer and read-only API. The chain is the source of truth; SQLite is a projection reconstructed from contract events. The goal is a small, secure solution that is easy to run, review, and explain.

## Tooling choices

Foundry provides Forge for compilation/contract tests and Anvil for a local EVM. Anvil permits deterministic development time advancement, allowing the demo to exercise two-hour and seven-day deadlines without waiting in real time. Ethers v6 connects the backend and demo to the node. Ethers was selected because the author is familiar with it; the required indexing guarantees do not depend on choosing ethers over viem. Ethers v6 uses bigint; token amounts and escrow IDs remain decimal strings outside Solidity.

A custom TypeScript indexer was selected over a subgraph. A subgraph is a reasonable alternative, but local Graph Node setup and a separate REST wrapper add components for this small exercise. Custom indexing makes event processing, duplicate handling, atomic checkpoints, and failure behavior directly visible and testable. SQLite avoids a separate database service for local delivery. The API uses Fastify 5.12.7 and better-sqlite3 12.4.1; package-lock.json pins transitive dependencies.

## Contract lifecycle

A single non-upgradeable contract manages multiple escrows with sequential IDs starting at 1. Each records sender, beneficiary, token, amount, cancellation deadline, expiry, and state.

| Action | Actor | Time condition | Recorded result | Funds go to |
| --- | --- | --- | --- | --- |
| Cancel | Sender | Before creation + 2 hours | CancelledBySender | Sender |
| Confirm | Beneficiary | Before creation + 7 days | Released | Beneficiary |
| Reject | Beneficiary | Before creation + 7 days | Rejected | Sender |
| Recover | Sender | At/after creation + 7 days | Expired | Sender |

Both durations are constants. At exactly two hours cancellation is forbidden. At exactly seven days confirmation/rejection are forbidden and recovery is permitted. Beneficiary resolution is allowed during the cancellation window; the first valid transaction executed wins. Every resolution requires Pending, and terminal states are permanent.

## Authorization and safety

Permissions belong to the sender and beneficiary of each individual escrow. Global roles would not establish authority over a particular escrow; an administrative role revocation could also block recovery. Therefore there is no admin, owner, participant allowlist, pause, upgrade, or arbitrary withdrawal mechanism. One address can be a sender in one escrow and beneficiary in another.

onlySender(id) and onlyBeneficiary(id) make authorization explicit. onlyPending(id) and time-window modifiers expose lifecycle restrictions in function declarations. Shared predicates support both transaction validation and getEscrowStatus, while custom errors distinguish missing escrows, unauthorized callers, terminal states, and invalid windows.

OpenZeppelin SafeERC20 handles transfers including optional boolean return values. ReentrancyGuard protects token-interacting entry points. Resolution records effects before transferring; a failed transfer reverts the entire transaction. Creation validates actual receipt before recording the escrow, under the reentrancy guard.

## Token assumptions

Deposits must increase the contract balance by exactly the requested amount. Otherwise creation reverts atomically. Fee-on-transfer support is explicitly optional in the challenge and is excluded to preserve consistent amounts and payout semantics. Missing transfer return values are a separate mandatory compatibility case and are supported through SafeERC20.

The receipt check does not certify every token behavior. Rebasing, outbound-only fees, confiscation, dishonest balances, and malicious token economics are unsupported. Paused or blacklisting tokens may prevent transfers; the contract cannot force arbitrary tokens to pay. Unsolicited transfers can make balances exceed pending obligations, so universal balance-equals-liabilities claims would be incorrect. There is no admin rescue path.

## Stored state versus time-derived status

Time passing cannot write storage or move funds. Pending remains the recorded state until a successful resolution transaction. getEscrowStatus evaluates lifecycle flags at block.timestamp without modifying storage.

The API distinguishes recordedState from effective status. Pending at or after TTL has status Expired and recoverable true, but no resolution hash. After recovery, recordedState is Expired and recoverable is false. Terminal states take precedence over deadlines. Flags express availability for the designated party at the reported snapshot; they are not a guarantee of token transfer success or current-chain eligibility.

## Event indexing and duplicate delivery

Four tables store deployment/checkpoint identity, indexed block headers, a journal of events, and escrow projections. Creation events include every immutable field; resolution events identify the escrow. Transaction and block metadata come from logs. Reconstruction does not require escrow-storage reads.

Within a single-chain database, (blockHash, logIndex) identifies a log. A transaction hash alone is insufficient because a transaction can emit several logs. Retries, reconnects, overlap, and restarts may retrieve the same event again. Insert only new event identities and apply their projection effects once.

One serialized worker catches up in chain order. Journal insertion, projection updates, scanned headers, and checkpoint advancement commit in one transaction. A crash persists either all of these or none. Empty blocks advance the checkpoint too. Live notifications trigger the same historical catch-up path, with retries covering missed notifications. Malformed relevant events and impossible new transitions fail the batch instead of silently skipping data.

## Confirmations and reorganizations

Confirmation depth means successor blocks: eligible height = head minus configured depth. The local demo uses 0; the non-local default is 2 and configurable. This is a confirmation buffer, not Ethereum protocol finality or a universal safety threshold.

A reorg replaces previously observed blocks and can invalidate their events. The indexer verifies checkpoint block hashes and header continuity, validates log identities, and rechecks uncommitted range boundaries. An uncommitted changed range is retried. Changed committed history stops indexing, marks health unhealthy, and makes escrow endpoints return 503. An explicit rebuild reconstructs canonical data from deployment while preserving the previous database as a backup. Automatic rollback is deferred to keep recovery behavior simple and auditable.

Hash checks have a detection interval and rely on the RPC node's canonical view. Waiting for confirmations does not eliminate every reorg. A mismatched local deployment or reset must not silently reuse stale data.

## API time and pagination

State and time-derived fields use the same last-indexed block snapshot. Responses expose asOfBlock and asOfTimestamp. Latest-block time could be mixed with older state; server time can disagree with chain time, especially in Anvil tests. The chosen approach is consistent but deliberately lags during confirmation waiting or indexing delays. The demo advances time, mines a block, then waits for indexing.

Escrows are listed newest-created first using descending numeric IDs. A resolution does not change position. Exclusive ID cursors request IDs below the last returned ID. Since IDs are decimal TEXT, numeric-equivalent ordering uses length then lexicographic order, never a uint256-to-number conversion.

Each page has a consistent snapshot; multiple pages are live, not frozen together. New creations do not shift older ID boundaries, but status-filter membership can change across requests as escrows resolve or time advances. This is an intentional simplicity trade-off.

## Actual runtime flow

`scripts/local.ts` is the foreground supervisor. It starts the Anvil OS process, runs `contracts/script/DeployLocal.s.sol` through `scripts/deploy.ts`, validates successful deployment receipts and code, writes the manifest atomically, and starts `api/src/main.ts`. The Forge script exits after deployment. The API and indexer share one long-running Node process. SQLite is an embedded library/file, with no separate daemon. Startup applies the versioned schema before ingestion and serves an observable 503 until a usable snapshot exists.

```mermaid
flowchart LR
    Client[Local client / wallet] -->|transaction| Anvil
    Anvil -->|receipt logs + headers via HTTP RPC| Reader[chain/reader.ts]
    Reader --> Worker[indexer/worker.ts]
    Worker -->|one SQL transaction| DB[(SQLite)]
    Worker --> Projector[indexer/projector.ts]
    Projector --> DB
    DB --> API[Fastify app.ts]
    API -->|indexed snapshot| HTTP[GET escrows / health]
```

Ethers `JsonRpcProvider` explicitly polls HTTP at **1 second**; `provider.on('block', ...)` schedules catch-up. An initial catch-up and **2-second** fallback timer schedule the same serialized worker. No WebSocket service or inbound chain connection is involved. Triggers coalesce behind one active worker. `chain/reader.ts` fetches relevant logs/contiguous headers through the generated ABI in `contracts/out/Escrow.sol/Escrow.json`. No copied hand-maintained ABI or contract-storage projection is used.

`indexer/worker.ts` validates deployment/checkpoint identity, successor-block confirmation cutoff, header continuity/log hashes, and uncommitted range boundaries. `db/repository.ts` atomically writes headers, newly inserted journal events, projector updates, and checkpoint. RPC calls occur before write transactions. Empty blocks advance checkpoint timestamps, so expiry becomes visible without a resolution event. Failed transactions produce no committed escrow event. HTTP responses read a consistent DB transaction.

The four tables are `indexer_state`, `indexed_blocks`, `escrow_events`, `escrows`. `PRAGMA user_version=1` controls the migration; foreign keys are enabled. Deployment identity occupies validated JSON in the singleton state row, with explicit checkpoint columns, rather than separate identity columns from the planning schema. Unsupported schema versions fail startup. An exclusive `<DB_PATH>.lock` prevents two application writers. No ORM, job queue, database server or redundant aggregate liabilities are needed.

Graceful shutdown closes HTTP, removes listener/timer, waits for active ingestion to finish/roll back, closes SQLite/provider, and removes the writer lock. The supervisor stops API before Anvil and has a bounded forced-cleanup fallback. An ungraceful kill can leave a lock: verify no process owns that database before manually removing that exact stale lock. Automatic stale-lock takeover is deliberately absent.

## Configuration

Environment variables are read from the process. `.env.example` is documentation; `.env` is not auto-loaded. To use a local file, copy/edit it and explicitly export its values (`set -a; . ./.env; set +a`) in your shell. Keep secrets out of tracked files. Use the same selected profile/manifest/DB/RPC for API and diagnostics.

| Variable | Default / meaning |
| --- | --- |
| `NETWORK` | `local`; only `local` and `sepolia` supported |
| `RPC_URL` | Local HTTP RPC, `http://127.0.0.1:8545` |
| `SEPOLIA_RPC_URL` | Required only for explicit Sepolia profile; empty example |
| `MANIFEST_PATH` | `deployments/<network>.json` |
| `DB_PATH` | `data/<network>.sqlite`; one deployment/one writer |
| `PORT` | API port `3000`, loopback bind |
| `API_URL` | Diagnostic/client endpoint, default `http://127.0.0.1:<PORT>` |
| `CONFIRMATION_DEPTH` | Local `0`, Sepolia `2`; number of successors, not finality |
| `RPC_STALE_AFTER_SECONDS` | `30`; successful RPC observation age |
| `WORKER_STALE_AFTER_SECONDS` | `30`; completed cycle or meaningful active progress |
| `FOUNDRY_ACCOUNT` | Explicit user-managed encrypted account for later public deployment |
| `DEPLOYER_ADDRESS` | Explicit corresponding address for simulation/broadcast |
| `TARGET_ADDRESS` | Explicit existing deployment target for verify-only commands |
| `ETHERSCAN_API_KEY` | Empty; future Etherscan V2 authentication |
| `BLOCKSCOUT_VERIFIER_URL` | Empty; explicit supported HTTPS verification API endpoint |
| `BLOCKSCOUT_API_KEY` | Optional authentication for the chosen Blockscout endpoint |

The deployment manifest records schema/network/chain/genesis, deployment transaction/block/hash, contract address, ABI/artifact hashes and runtime code hash; local manifests also record demo token address/receipt/code hash. Preflight verifies actual successful receipts, nonempty exact runtime code, constants and build identity. Escrow has no constructor parameters, linking or immutables, so compiled/deployed runtime equality is meaningful here. The demo ERC-20 runtime hash is recorded from its successful deployment and checked on each preflight. Manifest generation never treats predicted addresses as successful receipts.

Coverage builds disable optimizer settings; run `npm run build` again before deployment or diagnostics to restore the pinned production artifact. Changing compiler/source/build settings after deployment intentionally makes artifact checks fail until you select the correct original build or a new deployment. Generated manifests, broadcast artifacts, databases/backups, `.env`, logs, dependencies and coverage are ignored. The supplied challenge PDF and private mail are excluded from Git.

## Health and diagnostics

`GET /health` reports deployment identity, confirmation cutoff/lag, indexed block/hash/timestamp, RPC observation age, schema/readiness, worker state/listener/timer, completed-cycle/active-batch/progress timestamps, event/escrow counts, and the last journal event with projection transaction hashes read in one snapshot. It does not sign or write escrows.

A fresh RPC cannot mask a stopped/stale worker. Idle Anvil remains healthy when fallback cycles succeed even if no new block is mined. New fetched heights or committed batches count as active progress; repeatedly retrying one broken range does not continually reset progress. Server time measures operational freshness only. Indexed chain time determines escrow eligibility.

Health returns 200 for `healthy` or `syncing` with a usable recent snapshot; 503 for `initializing`, `degraded`, or `reorg_detected`. Escrow endpoints return 503 for unusable/degraded/integrity-invalid snapshots. A transient RPC failure can serve the prior snapshot until its freshness threshold. Integrity failures remain latched until explicit recovery. A successful RPC reconnect cannot clear them.

`healthcheck` verifies config, chain/genesis, receipts/code/build/constants/local token, API deployment identity and confirmation depth, schema, worker and RPC freshness, canonical checkpoint, bounded synchronization target, and latest journal/projection coherence. It captures eligible height once, then waits up to 30 seconds (configurable with `--timeout`), so a moving head does not make it chase forever. A not-yet-eligible deployment may produce WARN but cannot pass without a usable snapshot. It reads DB diagnostics from the owning API and never opens an alternate empty SQLite file. Exit 0 means required checks passed; failure, timeout, bad arguments/report path exit nonzero. Endpoints shown in diagnostic reports omit userinfo, paths and query secrets.

Illustrative terminal output, **not a recorded run**:

```text
PASS configuration: local; http://127.0.0.1:8545
PASS deployment: chain, genesis, receipt, runtime, ABI, constants and local fixture match
PASS database: schema 1; 0 events; 0 escrows
PASS worker: worker, listener, timer and progress
PASS captured target: target 2; indexed 2; lag 0
PASS checkpoint canonical: block 2
PASS journal spot check: empty deployment is valid without EscrowCreated events
PASS API readiness: usable API snapshot
Overall PASS
```

Deploying a contract emits no `EscrowCreated`: zero escrow rows are expected until an actual create transaction. The spot check is not proof of every record; smoke/demo exercise the live write path and assert independent outcomes.

## HTTP examples and semantics

With local startup running (run smoke/demo before requesting an existing ID):

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS 'http://127.0.0.1:3000/escrows?limit=2'
curl -fsS http://127.0.0.1:3000/escrows/1
curl -fsS 'http://127.0.0.1:3000/escrows?status=Released&limit=20'
curl -fsS 'http://127.0.0.1:3000/escrows?sender=0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266&limit=20'
curl -fsS 'http://127.0.0.1:3000/escrows?beneficiary=0x70997970c51812dc3a010c7d01b50e0d17dc79c8&status=Expired'
curl -fsS 'http://127.0.0.1:3000/escrows?cursor=4&limit=2'
```

Detail fields: `id`, parties/token, raw decimal-string `amount`, `cancelDeadline`, `expiresAt`, `recordedState`, effective `status`, `recoverable`, `canCancel`, `canConfirm`, `canReject`, creation transaction hash, nullable resolution hash, `asOfBlock`, `asOfTimestamp`. Timestamps/block heights are validated safe integers; uint256 IDs/amounts never become JS numbers. Amounts have no token-decimal conversion or metadata dependency. Addresses/hashes are lowercase.

List shape is `{items, nextCursor, asOfBlock, asOfTimestamp}`; items omit repeated snapshot fields. Filters `sender`, `beneficiary`, `status` combine with AND before pagination. Effective `Expired` includes unresolved Pending expiry and recovered Expired; effective `Pending` excludes timed-out Pending. Allowed exact statuses: `Pending`, `CancelledBySender`, `Released`, `Rejected`, `Expired`. Default limit 20/max 100; fetch limit+1; exclusive canonical positive uint256 ID cursor; numeric newest-created order. ID boundary need not exist. Each page is live, not a frozen cross-page snapshot.

IDs/cursors reject signs, whitespace, leading zeroes, exponent/fraction syntax, zero and uint256 overflow. Address filters use ethers syntax/checksum validation without ENS lookup. Unknown/repeated/empty scalar parameters fail with 400. No implicit array/coercion behavior. Terminal states override all time flags.

Errors have `{ "error": { "code": "INVALID_ARGUMENT", "message": "..." } }`: 400 `INVALID_ARGUMENT`, 404 `ESCROW_NOT_FOUND`/`ROUTE_NOT_FOUND`, 503 `INDEXER_UNAVAILABLE`, 500 `INTERNAL_ERROR`. Unexpected details/stacks/SQL/credentials are not returned. A detail 404 means absent at the indexed snapshot and may reflect confirmation/indexing lag; it does not prove latest-chain nonexistence.

## Restart, rebuild and local resets

For independent API restarts, keep Anvil in a separate terminal instead of the supervisor. Start from fresh manifest/DB paths and export the same values in each terminal:

```bash
export NETWORK=local
export MANIFEST_PATH=deployments/manual.json
export DB_PATH=data/manual.sqlite
# terminal A
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --silent
# terminal B, from repository root, same exports
npm run build
npm run deploy:local
npm run api:start
# Ctrl-C in B stops API only; terminal A remains running
npm run api:start
```

Restart validates manifest/build/chain/deployment and resumes at checkpoint+1. It does not redeploy. The standalone deploy command refuses an existing manifest. Resetting Anvil can invalidate receipt/deployment/checkpoint history even when chain ID and genesis match. Use new paths for a new deployment; do not silently retarget an old DB.

After a detected reorg with the same valid deployment, stop API (keep node running), then:

```bash
npm run indexer:rebuild
npm run api:start
npm run healthcheck
```

Rebuild verifies current manifest/chain and old DB identity/schema, takes the exclusive writer lock, consolidates WAL, preserves `<DB_PATH>.backup-<timestamp>`, and reconstructs from deployment through eligible height. It refuses a running writer, changed deployment identity or unsupported schema. Automatic rollback/common-ancestor repair is deferred. Backups are local evidence, not ignored corruption recovery guarantees.

## Prepared Sepolia and explorer workflow

**Prepared and locally tested only. No public step below was executed.** Use your own user-managed encrypted Foundry account and fund its address with Sepolia ETH through your chosen legitimate source. No real keys are needed for local build/test/start/health. The repository provides no mainnet profile, faucet automation or local-to-public fallback. Do not reuse Anvil keys or local fixture addresses on Sepolia.

Set the following explicitly in an operator-controlled shell; keep actual secrets in your environment:

```bash
export NETWORK=sepolia
export SEPOLIA_RPC_URL='https://YOUR_SEPOLIA_RPC_ENDPOINT'
export MANIFEST_PATH=deployments/sepolia.json
export DB_PATH=data/sepolia.sqlite
export CONFIRMATION_DEPTH=2
export FOUNDRY_ACCOUNT='your-encrypted-foundry-account-name'
export DEPLOYER_ADDRESS='0xYOUR_ACCOUNT_ADDRESS'
npm run deploy:sepolia:dry-run
# Later, only when you intentionally authorize and invoke broadcast:
npm run deploy:sepolia
```

Both commands first require RPC chain ID **11155111**. Dry-run uses the explicitly selected address for RPC simulation and has no `--broadcast` or keystore signing flag. Broadcast adds the named encrypted account and explicit broadcast flag; it never adds verification. Store/import that account with Foundry's encrypted account tooling separately; account provisioning, password management, funding and public simulation are not live-validated here. No private-key CLI argument is generated. Broadcast requires a fresh manifest path and writes a manifest only from validated successful receipts/code. Contract timings remain constants with no constructor arguments.

After a later successful deployment, select its actual address from the manifest:

```bash
export TARGET_ADDRESS='0xACTUAL_ESCROW_ADDRESS_FROM_SELECTED_MANIFEST'
export ETHERSCAN_API_KEY='YOUR_API_KEY'
npm run verify:sepolia:etherscan
# Alternative explicit supported Blockscout instance/API:
export BLOCKSCOUT_VERIFIER_URL='https://YOUR_SUPPORTED_BLOCKSCOUT_API_ENDPOINT/api/'
# export BLOCKSCOUT_API_KEY='YOUR_KEY_IF_REQUIRED'
npm run verify:sepolia:blockscout
```

Verify-only commands require the explicit target to match the selected manifest and preflight the chain/receipt/runtime/build. They never deploy. Etherscan explicitly uses its V2 endpoint with `chainid=11155111`; Blockscout requires an operator-selected supported HTTPS endpoint and optional key. Existing-address flags were checked against the pinned Forge CLI and compiled standard input locally; authentication, endpoint compatibility and verification results are **not live-tested**. A later actual invocation records success/failure in an ignored manifest-adjacent verification JSON. Verification is source/bytecode correspondence, not a security audit.

Keep exact Solidity 0.8.30, optimizer 200, Cancun EVM, source/dependency versions and empty constructor args. Do not change build settings between deployment and verification. References: [Etherscan Foundry guide](https://docs.etherscan.io/contract-verification/verify-with-foundry), [Blockscout Foundry guide](https://docs.blockscout.com/devs/verification/foundry-verification), [Foundry verifier flags](https://www.getfoundry.sh/reference/common/verifier-options).

Start the API separately against that profile (never `npm run local` for Sepolia):

```bash
npm run api:start
# another terminal, same profile exports
npm run healthcheck
```

Choose/deploy your own supported Sepolia ERC-20 explicitly; production Escrow deployment does not deploy a demo token. Through a compatible explorer and a testnet wallet: connect the intended account, approve the token for the actual Escrow address, call `createEscrow(token, beneficiary, rawAmount)`, then resolve from the required sender/beneficiary. Read `getEscrow` and `getEscrowStatus` through the explorer after source verification. No assumption is made that a token allows minting or permit. Sepolia uses real block time: cancellation remains two hours, expiry seven days; Anvil time travel and local smoke/demo are unavailable there. Two successor blocks are a buffer, not protocol finality.

## Assumptions, limits and future work

The contract intentionally has no owner/admin/allowlist/pause/upgrade/rescue/permit. Fee-on-transfer support is excluded; optional-return ERC-20 support is included. Arbitrary token economics and availability cannot be guaranteed. Unsolicited tokens remain stuck without a valid escrow claim. There is no fee or administrative withdrawal.

The indexer trusts one RPC's canonical history. Reorg detection is periodic and cannot be instantaneous; a hash check has a race window. Committed divergence fails closed and requires explicit rebuild, rather than automatic rollback. SQLite and a single process are appropriate for this exercise, not a distributed high-availability service. Pagination is live across requests. API binds loopback without authentication, rate limiting, custody or signing; production exposure would require deliberate deployment/security work. RPC retrieval is bounded in 100-block batches, but all indexed headers/journal rows are retained.

Coverage goals are met in measured first-party scopes; they do not establish an audit or proof of correctness. No broad fuzz campaign, formal verification, static-analysis certification or CI service result is claimed. Future work could add focused invariants under a defined token threat model, chain-specific finalized tags, automatic common-ancestor rollback, archival/metrics, frozen pagination and CI after deployment requirements are agreed. No optional feature changes the accepted lifecycle.

## AI usage and review walkthrough

[docs/ai-usage.md](docs/ai-usage.md) preserves actual prompts/meaningful outputs and links the planning record. It is curated, not a fabricated full transcript. Human review should focus on authorization, exact time comparisons and token calls; then follow a receipt log through ABI decoding, atomic journal/projector/checkpoint commit, and snapshot-derived API status. Explain why a pending expiry differs from recovery, why retries cannot double-apply a terminal event, why empty blocks matter, and why two successors do not eliminate reorg risk.

Milestones are separate real commits, pushed in order. Public repository visibility was explicitly selected by Rodrigo. Evaluator contact/invitations and solution submission remain user-controlled; none was sent.
