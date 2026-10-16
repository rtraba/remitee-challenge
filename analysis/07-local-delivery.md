# Local delivery and repository specification

Status: execution handoff requirements. Commands below are an implementation target, not commands verified against existing code.

## Repository layout

Keep analysis/ planning records. Suggested layout:

- contracts/src/Escrow.sol
- contracts/test/ (standard, optional-return, failing, fee and callback token fixtures)
- contracts/script/ (deployment if using Forge scripts)
- contracts/foundry.toml
- api/src/ (config, chain adapter, ingestion, database, projection, lifecycle, routes)
- api/test/
- scripts/ (local supervisor, deployment, lifecycle demo, rebuild wrapper)
- deployments/local.json (generated deployment manifest, ignored by default)
- data/ (SQLite files/backups, ignored)
- docs/ai-usage.md (planning excerpts and execution prompt/output record)
- .env.example, .gitignore, package.json, lockfile, README.md

An npm workspace or one root package with API scripts is acceptable; choose the least complex structure that preserves module/test clarity. No frontend, subgraph, testnet deployment, or second Solidity toolchain.

## Required root command interface

Implement and verify these concrete public commands, or document a justified equivalent consistently in README and execution notes:

- npm install: install pinned Node dependencies from the committed lockfile.
- npm run build: compile Solidity artifacts and TypeScript.
- npm run test:contract: Forge mandatory tests.
- npm run test:api: backend/database/HTTP tests.
- npm test: mandatory automated contract and backend suites.
- npm run local: start Anvil, deploy local fixtures/escrow, initialize DB, and start API/indexer. Stay in foreground with readable service logs and graceful cleanup.
- npm run demo: against the running local system, demonstrate and assert all mandatory outcomes.
- npm run indexer:rebuild: explicit rebuild using the current deployment manifest, backing up old DB and requiring the API/indexer writer to be stopped.

Forge/Anvil must be installed as documented prerequisites, unless implementation provides a tested Docker alternative. The challenge permits a single command instead of Compose; choose one reliable startup route, not two untested routes. Pin/document tested Node and Foundry versions; verify SQLite driver's install/build prerequisites early. Use local ports 8545 (Anvil) and 3000 (API) by default, configurable. RPC stale timeout default 30 seconds; catch-up fallback 2 seconds; local confirmation depth 0.

## Startup and deployment

Supervisor checks prerequisites and port availability, starts Anvil, waits for RPC readiness, deploys a standard demo ERC-20 and Escrow, writes the manifest, and starts the API/indexer with matching configuration. Manifest records chain ID, genesis hash, addresses, deployment block number/hash, and ABI/artifact references. Ensure API uses the compiled contract ABI, not a manually divergent copy.

Use deterministic, publicly known Anvil development accounts only for deployment/demo. API must not load private keys or sign transactions. Do not require real wallet credentials. Document local-only accounts explicitly. Ignore local .env, databases/WAL files/backups, node dependencies, artifacts as appropriate, logs, and generated manifests. Track safe config examples and lockfiles. Exclude the supplied mail and challenge PDF from Git by default.

Stopping the supervisor stops child processes it owns. A separate API restart against a still-running node resumes the checkpoint without redeployment. Node reset with existing database must be detected; document explicit fresh/reset workflow. Never silently erase user data or kill unrelated processes on occupied ports. Fresh startup should refuse ambiguous old data rather than blindly rebuild.

## Demo acceptance

Use separate funded/approved escrows for each outcome because terminal states are permanent. Assert:

1. Create and inspect a Pending escrow with cancellation/confirmation/rejection availability.
2. Confirm one escrow and verify beneficiary payout and Released projection.
3. Reject another and verify sender refund and Rejected projection.
4. Cancel another before two hours and verify sender refund and CancelledBySender projection.
5. Create another, advance Anvil timestamp to expiry and mine a block, wait for checkpoint, then verify recordedState Pending, status Expired, recoverable true, no resolution hash.
6. Recover that escrow, verify sender refund, recordedState Expired, recoverable false, and resolution hash.
7. Query detail/list/health and assert all relevant event hashes and snapshot references.

Capture block timestamps rather than relying on wall-clock timing. Wait with bounded polling for the required transaction/block to be indexed; fail clearly on timeout. Do not only print success without checking balances/state/API. Run time-dependent cases before advancing the node seven days. No demo assumptions that mining a block alone waits for positive confirmation depth; mine required successor blocks when testing that mode.

## Documentation and evidence

Finalize root README from analysis/10-delivery-readme-draft.md. Include actual install/start/test/demo/restart/rebuild commands, env variable table, component explanation, endpoint schemas/curl examples, decisions/assumptions/rationale, token and reorg limits, AI record, and improvements. Final instructions must be reproducible from a clean checkout.

Maintain real milestone commits and pushes per 02-decisions.md and 08-execution-plan.md. Verify remote accessibility; for a private repo, evaluator identities/access remain a user-provided delivery detail. No automated messages/invitations to evaluators without explicit authorization.

## October 15 additions: explicit runtime/deploy/diagnostics

11-runtime-deployment-health.md extends this delivery specification and supersedes the earlier exclusion of testnet preparation: no public deployment is performed, but Sepolia config, dry-run/broadcast separation, explorer verification commands, and manual-use instructions are required. Anvil remains default/mandatory. contracts/script/DeployEscrow.s.sol and DeployLocal.s.sol are explicit deployment deliverables, not merely an optional folder suggestion.

Additional root commands: coverage:contract, coverage:api, test:integration, healthcheck (read-only terminal plus JSON/optional report), smoke (local-only create/cancel proof), api:start (explicit manifest/profile for already-running RPC), deploy:sepolia:dry-run, deploy:sepolia, verify:sepolia:etherscan, verify:sepolia:blockscout. Public-network commands remain opt-in and are not executed by the implementation agent without a subsequent explicit request.

Local startup reports success only after readiness checks pass. README must document process ownership, actual script/module entry points, listeners/polling, DB initialization, health command output, smoke versus read-only checks, and shutdown/restart. SQLite is embedded; there is no missing database daemon for an evaluator to start.
