# ERC-20 Escrow: Remitee engineering challenge

Planning draft. This document explains agreed design choices before implementation. Operational sections must be completed with real, verified commands and examples before becoming the repository's root README. Do not claim the implementation or tests already exist.

## Purpose

The solution will combine a Solidity escrow contract with a Node.js/TypeScript event indexer and read-only API. The chain is the source of truth; SQLite is a projection reconstructed from contract events. The goal is a small, secure solution that is easy to run, review, and explain.

## Tooling choices

Foundry provides Forge for compilation/contract tests and Anvil for a local EVM. Anvil permits deterministic development time advancement, allowing the demo to exercise two-hour and seven-day deadlines without waiting in real time. Ethers v6 connects the backend and demo to the node. Ethers was selected because the author is familiar with it; the required indexing guarantees do not depend on choosing ethers over viem. Ethers v6 uses bigint; token amounts and escrow IDs remain decimal strings outside Solidity.

A custom TypeScript indexer was selected over a subgraph. A subgraph is a reasonable alternative, but local Graph Node setup and a separate REST wrapper add components for this small exercise. Custom indexing makes event processing, duplicate handling, atomic checkpoints, and failure behavior directly visible and testable. SQLite avoids a separate database service for local delivery. Specific dependency versions, HTTP framework, and driver will be supplied after selection and verification.

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

## Required operational sections to complete

- Prerequisites and pinned supported versions.
- Installation, configuration variables, deployment manifest, and local account/key treatment.
- One-command startup of node, deployment, database, and API.
- Contract/backend/integration test commands and actual validation results.
- Full lifecycle demo with separate escrows for each terminal outcome.
- Endpoint schemas, validation, HTTP errors, health/lag semantics, and curl examples.
- Restart and explicit rebuild procedures; backup behavior.
- Repository/CI details, meaningful commit-and-push history, and evaluator access.
- AI prompt/output record with actual prompts and meaningful outputs.

These sections must reference implemented commands tested from a clean checkout. Planned instructions must not be presented as working before verification.

## Scope and improvements

Mandatory delivery comes first. Fee-on-transfer support, permit, notifications, testnet deployment, and speculative storage optimization are excluded from the core plan. Fuzz/invariant tests and CI can be added after the mandatory suite and reproducible demo pass. Other possible improvements include automatic common-ancestor rollback, chain-specific finalized-block policies, frozen snapshot pagination, and more operational monitoring.

## Review and interview preparation

The author should be able to explain exact boundary comparisons, per-escrow authorization, token assumptions, reentrancy defenses, atomic persistence, duplicate identity, restart recovery, reorg limits, and snapshot-derived API status. Final documentation must match the delivered code; record any implementation deviations and their rationale in the decision log.

## Runtime: who listens and who writes the database

The local supervisor starts Anvil, runs a short-lived deployment script, initializes the SQLite schema, and starts one long-running Node.js process containing Fastify and the indexer worker. SQLite is embedded in that process; no database server must be launched separately. The API process has no signer or private keys.

When an escrow transaction succeeds, its Solidity event is stored in the transaction receipt's logs on Anvil. The blockchain does not push SQL inserts or call our API. Ethers JsonRpcProvider polls the RPC for block updates. Its block listener schedules catch-up; an initial scan and two-second fallback timer use the same path. There is only one writer worker, so overlapping notifications cannot race.

The chain adapter fetches relevant logs and headers. The worker validates/sorts them, then the repository writes headers, new event identities, derived escrow changes, and checkpoint in one transaction. Fastify reads the committed projection. Creation inserts Pending; resolution updates the existing escrow. Time passing is reflected through indexed block timestamps without requiring an expiry event. Listener callbacks schedule work; they do not independently mutate records.

On shutdown the application stops listeners/timers, completes or rolls back its active transaction, closes resources, and exits. The supervisor only stops processes it owns. Final README must name actual source entry points and configuration files.

## Readiness, health diagnostics, and smoke tests

The required healthcheck command checks selected chain/RPC, deployment receipt/code/ABI identity, manifest/DB alignment, schema initialization, API reachability, worker/listener/timer liveness, checkpoint canonicality, and synchronization to a captured eligible target block. It prints PASS/WARN/FAIL plus an overall exit code, with JSON and optional report-file output. Exact implemented commands and example output belong here after verification.

A responsive RPC alone does not establish that our worker is alive. Health includes worker cycle/progress timestamps separately from RPC freshness. An idle Anvil chain is healthy when periodic checks succeed; no block-age requirement forces artificial mining.

Deploying Escrow does not itself emit EscrowCreated. Zero escrow rows is valid before any escrow action; deployment identity comes from the manifest/receipt/code checks. A separate explicitly invoked local smoke command creates and cancels a small fixture escrow and verifies journal/projection/API results, proving new-event handling. Ordinary healthcheck and GET /health are read-only. The full demo verifies every terminal outcome and Pending expiry before recovery.

## Test tools and coverage goals

Contract tests are Solidity .t.sol tests run by Forge. First-party Escrow code targets 100% line/statement/function and >=95% branch coverage, with every reachable critical path asserted. These are our quality goals, not a percentage mandated by the challenge. Dependency and fixture coverage is reported separately. TypeScript indexer/API tests target >=90% line/statement/function and >=85% branch coverage in first-party logic, plus deployment/health/smoke integration on Anvil. Final README must replace goals-only reporting with actual measured results and explain every relevant instrumentation limitation or gap honestly.

## Future Sepolia deployment and explorer verification

Local Anvil is the delivered/default network. Sepolia preparation is included as opt-in configuration, not as a claim of deployed or verified contracts. Separate RPC, manifest, database, and encrypted signing-account selection keep the local system independent. The API never signs transactions.

The final guide must list environment variables, simulation/dry-run, explicit broadcast, manifest/address selection, and verification-only commands for Etherscan and configurable Blockscout. Exact compiler/optimizer/EVM settings and constructor arguments must match deployment. Build/test/local/health commands must never broadcast publicly. No real keys belong in the repository or log output.

Once a user explicitly deploys and verifies, an explorer can expose read/write interactions: select Sepolia, approve the chosen token for the Escrow address, create an escrow, and act from the correct party wallet. Sepolia uses real chain time; Anvil time-travel methods do not work there, and the seven-day TTL remains unchanged. Explorer verification establishes source/bytecode correspondence; it is not a security audit. Final instructions must state which optional public-network steps were not live-tested.
