# Local operation and validation

[Quick start](../README.md) · [Design](design.md) · [Toolchain](toolchain.md) · [Sepolia preparation](sepolia.md)

Run commands from the repository root. These instructions preserve the tested local workflows and reference details from the original README; no runtime behavior changed during the documentation split.

## Local sessions and fixture accounts

Install using the [root quick start](../README.md#install-and-run); exact tested versions and prerequisites are in [toolchain notes](toolchain.md). The commands below assume the local system is running.

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

| Command                                  | Purpose                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `npm run build`                          | Compile pinned Solidity and check strict TypeScript                            |
| `npm run test:contract`                  | Foundry Solidity behavioral/security tests                                     |
| `npm run test:api`                       | SQLite, worker, ABI reader, HTTP, health and command tests                     |
| `npm test`                               | Both mandatory automated suites                                                |
| `npm run coverage:contract`              | Forge summary + `coverage/contracts.lcov`                                      |
| `npm run coverage:api`                   | V8 summary + JSON/LCOV in `coverage/api/`                                      |
| `npm run test:integration`               | Isolated Anvil deployment, diagnostics, smoke/demo, restart, reorg and rebuild |
| `npm run local`                          | Fresh full-system supervisor                                                   |
| `npm run deploy:local`                   | Deploy fixtures to an already-running local Anvil                              |
| `npm run api:start`                      | Start API/worker against selected running chain/manifest/DB                    |
| `npm run indexer:rebuild`                | Explicit stopped-writer canonical rebuild, preserving DB backup                |
| `npm run healthcheck -- --timeout 10000` | Read-only diagnostic, bounded target wait in milliseconds                      |
| `npm run smoke` / `npm run demo`         | Explicit local state-changing verification                                     |
| `npm run format`                         | Format first-party TypeScript                                                  |

Integration uses dedicated ports 18545 and 13000, checks availability before starting, stores temporary manifests/DB/backups/reports under `/tmp/remitee-integration-*`, and cleans up only its own processes. Do not run two integrations concurrently. Its real snapshot/revert case asserts integrity failure and HTTP 503, then rebuilds while preserving the old database. API restart retains exactly 5 escrows/10 events after smoke plus demo. Negative tests intentionally produce failure messages while the overall test still passes.

A fresh remote clone at `c071278` passed `npm ci` (zero reported advisories), build, both suites, full `npm run local` readiness, healthcheck terminal/JSON/report, smoke, lifecycle demo and all seven curl examples with asserted responses. Subsequent changes only strengthen test assertions and document this evidence; application behavior is unchanged.

Measured on October 16, 2026: **10 Forge tests** and **29 backend tests** passed (scenario groups contain explicit boundary/action matrices). Build and live isolated integration passed. First-party coverage:

| Scope                              | Lines                | Statements           | Functions          | Branches             |
| ---------------------------------- | -------------------- | -------------------- | ------------------ | -------------------- |
| `contracts/src/Escrow.sol`         | **100% (59/59)**     | **100% (66/66)**     | **100% (18/18)**   | **100% (11/11)**     |
| `api/src` excluding thin `main.ts` | **99.71% (355/356)** | **99.74% (388/389)** | **98.41% (62/63)** | **96.54% (307/318)** |

Targets were 100% contract lines/statements/functions and >=95% branches; backend >=90% lines/statements/functions and >=85% branches. Measured targets are met. The uncovered backend line/function is the default wall-clock closure in `app.ts`; injected clocks support deterministic boundary tests. Remaining uncovered branches include defensive/null/order combinations; no percentage is inferred for uninstrumented CLI execution. First-party indexer statements/lines/functions measured 100%.

Forge emitted source-map anchor warnings (including modifier locations); raw coverage reports are retained unmodified, and percentages are not proof of correctness. Its combined report also includes partial OpenZeppelin, fixture and Forge-script coverage: that aggregate is **not** claimed as 100%. Named deploy scripts are exercised by live Anvil integration; production Sepolia execution remains untested. Coverage disables optimization, so restore production artifacts with `npm run build`. Clean-checkout evidence is recorded in [implementation status](../analysis/implementation-status.md). Coverage is scoped to first-party `Escrow.sol` and `api/src` logic; the thin API entry point and scripts are covered by separate runtime/integration/preflight tests. Percentage targets are project goals, not requirements imposed by the challenge PDF. Source-map/instrumentation limitations and unsupported public paths are reported explicitly.

## Configuration

Environment variables are read from the process. `.env.example` is documentation; `.env` is not auto-loaded. To use a local file, copy/edit it and explicitly export its values (`set -a; . ./.env; set +a`) in your shell. Keep secrets out of tracked files. Use the same selected profile/manifest/DB/RPC for API and diagnostics.

| Variable                     | Default / meaning                                                   |
| ---------------------------- | ------------------------------------------------------------------- |
| `NETWORK`                    | `local`; only `local` and `sepolia` supported                       |
| `RPC_URL`                    | Local HTTP RPC, `http://127.0.0.1:8545`                             |
| `SEPOLIA_RPC_URL`            | Required only for explicit Sepolia profile; empty example           |
| `MANIFEST_PATH`              | `deployments/<network>.json`                                        |
| `DB_PATH`                    | `data/<network>.sqlite`; one deployment/one writer                  |
| `PORT`                       | API port `3000`, loopback bind                                      |
| `API_URL`                    | Diagnostic/client endpoint, default `http://127.0.0.1:<PORT>`       |
| `CONFIRMATION_DEPTH`         | Local `0`, Sepolia `2`; number of successors, not finality          |
| `RPC_STALE_AFTER_SECONDS`    | `30`; successful RPC observation age                                |
| `WORKER_STALE_AFTER_SECONDS` | `30`; completed cycle or meaningful active progress                 |
| `FOUNDRY_ACCOUNT`            | Explicit user-managed encrypted account for later public deployment |
| `DEPLOYER_ADDRESS`           | Explicit corresponding address for simulation/broadcast             |
| `TARGET_ADDRESS`             | Explicit existing deployment target for verify-only commands        |
| `ETHERSCAN_API_KEY`          | Empty; future Etherscan V2 authentication                           |
| `BLOCKSCOUT_VERIFIER_URL`    | Empty; explicit supported HTTPS verification API endpoint           |
| `BLOCKSCOUT_API_KEY`         | Optional authentication for the chosen Blockscout endpoint          |

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
