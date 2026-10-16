# Execution plan for the implementation agent

Status: ready for execution when Rodrigo explicitly requests implementation. This planning chat has not created code or a GitHub repository.

## Starting instruction

Work in /home/rodrigo/code/remitee. Read analysis/README.md, 02-decisions.md, 03-contract-spec.md, 04-indexer-spec.md, 05-api-spec.md, 06-test-matrix.md, 07-local-delivery.md, 09-ai-record.md, 10-delivery-readme-draft.md, and 11-runtime-deployment-health.md before implementation. Read the October 15 extension at the end of this plan before executing any milestone. Read applicable AGENTS.md instructions. The decision log's later accepted decisions supersede earlier proposals. Do not modify any synced sources/ files if working from the ChatGPT project mirror.

Implement mandatory deliverables first. Keep scope simple. Do not add admin roles, participant allowlists, upgrade/pause/rescue paths, fee-on-transfer support, permit, webhooks, frontend, subgraph, testnet deployment, or activity sorting. Fuzz/invariants and CI are optional after core verification. Be able to explain all consequential choices. Record any necessary deviation and rationale; ask Rodrigo for material behavior changes, not routine implementation choices.

## Milestone 0: GitHub setup and initial push (must be first)

Inspect target files, Git status/remotes, and GitHub authentication without overwriting user files. Resolve intended account, repository name, and visibility with Rodrigo if unknown; never assume permission to expose private correspondence/PDF. Initialize Git only if absent; use an existing intended repo if supplied. Preserve planning docs. Create ignore rules and an initial root README identifying planning/implementation status. Exclude credentials, mail, supplied challenge PDF, and runtime data.

Create the agreed GitHub repository, commit the planning baseline, and push before writing the solution. Verify remote URL and successful push. Report authentication/connectivity blockers promptly. No fabricated history or claims of pushed commits. If unresolved, perform independent read-only preparation while awaiting the required information; do not publish to an invented account/name/visibility.

Acceptance: accessible agreed remote, baseline commit pushed, clean intended tracked contents.

Suggested commit: docs: record escrow design and execution plan.

## Milestone 1: working toolchain and project skeleton

Verify official documentation for compatible current Node/ethers v6/Fastify/SQLite-driver/OpenZeppelin/Foundry versions. Pin versions, commit lockfiles and reproducible dependency references; avoid broad unpinned downloads. Establish repository layout, root scripts, TypeScript strict settings, Solidity config, generated ABI use, safe env example, and config validation. Ensure SQLite installation works on the actual platform before building the backend.

Acceptance: dependencies install, minimal build/tests execute, no signer/private key in API config. Record exact tested versions and commands. Commit and push.

Suggested commit: chore: configure Foundry and TypeScript tooling.

## Milestone 2: escrow contract and mandatory security tests

Implement 03-contract-spec.md: EscrowData/State, constants, IDs, errors/events, escrow-aware access and lifecycle modifiers, shared predicates/status view, exact receipt validation, guarded creation, effects-before-transfer resolutions. Document creation ordering rationale. No contract access-control admin.

Implement mandatory contract tests in 06-test-matrix.md, including full boundary checks, every terminal-state action, optional-return tokens, transfer rollback, fee-deposit rejection, callback attacks, isolation, and getEscrowStatus agreement. Use meaningful assertions of balances, state, logs, and errors.

Acceptance: mandatory Forge tests pass; manually review external calls and reentrancy/authorization paths; no underfunded recorded deposits or double resolutions. Commit and push.

Suggested commit: feat: implement escrow lifecycle with security tests.

## Milestone 3: database and indexer

Implement accepted schema/identity, normalized decimal/string handling, ordered serialized catch-up, periodic fallback, transactional journal/projection/headers/checkpoint, precise duplicate conflict handling, confirmation cutoff, hash verification, fail-closed integrity state, and explicit backed-up rebuild. Handle empty blocks and no initial checkpoint correctly. Integrate generated ABI.

Acceptance: real SQLite tests prove duplicate idempotency and rollback, fake RPC tests cover restart/empty blocks/cutoff/reorg/range retry, no contract storage reads used for projection. Commit and push.

Suggested commit: feat: persist escrow events with restart-safe indexing.

## Milestone 4: API

Implement 05-api-spec.md: strict validation, detail/list/health, consistent read snapshots, effective-status SQL filters before paging, newest-created numeric ordering, exclusive cursor, uint256 strings, structured errors, RPC freshness, integrity 503, health lag metadata. Keep chain-time lifecycle and server-time operational freshness separate.

Acceptance: HTTP injection tests and DB tests pass, including large IDs/amounts, 9/10 ordering, every time-derived status boundary and terminal override, filter combinations, initial/reorg/stale 503, and idle-chain health. Commit and push.

Suggested commit: feat: expose snapshot-consistent escrow API.

## Milestone 5: local orchestration and full demo

Implement 07-local-delivery.md's startup/deploy/config/manifest, process cleanup, restart/rebuild behavior, and independently asserted demo outcomes. Use Anvil known local accounts only in scripts, not API. Verify indexed Pending expiry before recovery and all terminal payouts. Add integration tests where they close gaps not covered by unit tests.

Acceptance: one command starts complete local system; demo succeeds against it; API restart resumes; mismatched node/database fails clearly; time advancement mines/indexes required blocks. Commit and push.

Suggested commit: feat: add reproducible local deployment and lifecycle demo.

## Milestone 6: documentation and delivery verification

Finalize root README from narrative draft and specs with actual tested commands, env table, endpoint examples, decisions/assumptions/rationale, limitations, restart/rebuild, AI usage record, and future work. Expand docs/ai-usage.md with real execution prompts and meaningful outputs. Do not invent unavailable full transcripts or expose secrets.

Run all mandatory tests/build and a clean-install/start/demo check. Verify documented curl examples. Check ignored/tracked content, repository history, successful remote pushes, and evaluator access. Fix failures in additional coherent commits and push them. No broad repeated tests unless changes/failures justify them.

Only after mandatory validation, consider focused fuzz/invariant tests and CI if delivery time remains. Optional work must not delay a working submission or change core semantics.

Acceptance: clean checkout instructions work; tests/demo pass; root README matches implementation; AI record exists; repository is pushed and accessible. Commit and push final documentation/fixes.

Suggested commit: docs: explain design and verified delivery workflow.

## Final report to Rodrigo

Provide repository link, completed mandatory deliverables, exact verification performed, material limitations/deviations, and any unresolved evaluator-access detail. Include a short technical walkthrough suitable for interview preparation. Do not send the submission or contact evaluators without explicit instruction.

## Required open inputs, not behavior blockers

GitHub account/name/visibility are unresolved and must be answered before remote creation. Private evaluator access requires actual identities. The original October 13/14 target dates are historical and have passed. As of the October 16 handoff, no revised submission hour is specified; prioritize mandatory delivery and do not treat earlier dates as future deadlines. Resolve these during milestone 0 rather than treating them as license to publish arbitrary contents.

## October 15 required extension (read before execution)

Read 11-runtime-deployment-health.md alongside all preceding specs. Rodrigo requested explicit deployment scripts, full-stack diagnostics, coverage targets, runtime explanation, and future Sepolia/explorer readiness. This supersedes earlier wording only insofar as testnet CONFIGURATION/PREPARATION is now in scope. Broadcasting/verification on a public network remains out of scope absent a subsequent explicit instruction. No mainnet or auto-network fallback.

Milestone 1: establish coverage tooling, network profile isolation, exact build/ABI identity, and migration/version checks. Include diagnostic/signing-free API configuration.

Milestone 2: write Solidity Foundry tests and coverage:contract; target 100% lines/statements/functions and >=95% branches for first-party Escrow code, with every reachable critical path tested. Record honest scoped metrics and instrument limitations.

Milestones 3/4: add worker/listener/timer lifecycle tracking and database schema readiness to /health. Test worker stoppage even when RPC is fresh. Configure HTTP ethers block polling plus initial/timer catch-up; no implied WebSocket dependency. Add coverage:api with documented targets in 06-test-matrix.md.

Milestone 5: implement named Forge deployment scripts and validated manifests, read-only healthcheck with exit codes/JSON/file report, local-only smoke, startup readiness, graceful owned-process cleanup, and test:integration. Prove both create and cancel propagate to journal/projection/API. Empty fresh deployments must pass once caught up without fake EscrowCreated data. Establish a bounded diagnostic target height and meaningful progress/liveness tracking.

After mandatory local delivery is working, prepare Sepolia env/config and deploy dry-run/broadcast commands with explicit signing/account selection, network guards, separate manifest/DB, and Etherscan/Blockscout verify-only commands. Test preflight/command construction locally. Do not broadcast, submit verification, request real keys, or claim live verification. Preparing this configuration is required; running against Sepolia is not.

Milestone 6: root README must include the runtime flow/process responsibilities, installation/start/healthcheck/smoke/demo/test/coverage/restart/rebuild commands, measured coverage results, terminal diagnostic example, and future Sepolia deployment/manual interaction/verification guide. Explain zero escrow rows after deployment and real-time deadlines on Sepolia. Mark nonexecuted public paths accurately. Keep meaningful commits/pushes for these additions.
