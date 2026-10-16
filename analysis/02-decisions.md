# Decisions and scope

Status: planning handoff complete. Updated October 14, 2026. Entries are chronological; later accepted decisions supersede earlier proposals.

## Accepted constraints

- Target delivery: October 13, 2026, before end of day in America/Argentina/Cordoba; October 14 is the fallback. No precise submission hour has been supplied.
- Rodrigo is proficient with Solidity and can read/review Foundry, Hardhat, and TypeScript. These tools have not been used recently, so provide concise explanations of consequential implementation choices and commands when requested.
- Planning precedes implementation. No solution implementation or remote repository creation during this planning phase.
- Implementation instructions must begin with GitHub repository setup and pushing an initial commit. Continue pushing ordered, meaningful commits during implementation so evaluators can inspect progress.
- The repository is the deliverable. Do not publish credentials or local private configuration in commits.

## Proposed scope for the deadline

Cover every mandatory requirement first. Add focused fuzz/invariant tests and CI only if the core solution and local demo are already reliable. Defer permit, webhooks, testnet deployment, and storage/gas optimization work. Decide token compatibility explicitly during contract planning rather than adding optional token behavior late.

## Tooling direction

Solidity with Foundry/Anvil; Node.js with TypeScript and viem. Rodrigo has accepted proceeding with this general tool set; exact backend framework, database, dependency versions, and packaging remain to be selected. Choose one contract toolchain rather than maintaining both Foundry and Hardhat. Verify current official documentation and compatible versions before specifying commands.

## Explanation and interview readiness

Each consequential decision should record the chosen behavior, why it is appropriate, and its limits. The final handoff must request an understandable README and a brief walkthrough of state transitions, token safety, indexer restart/reorg behavior, and API time-derived state. Rodrigo may request additional explanations during implementation.

## GitHub implementation requirements

The first execution milestone must:

1. Inspect the target directory and existing Git/remotes without overwriting user files.
2. Check GitHub authentication and determine the intended account, repository name, and visibility. If unresolved, ask Rodrigo before remote creation; public and private repositories are both permitted by the challenge.
3. Initialize the repository if needed, prepare ignore rules, and include the reviewed planning documents and initial project README. Keep the supplied challenge PDF and mail out of tracked files by default unless Rodrigo requests their inclusion.
4. Create the agreed GitHub repository (or use the agreed existing repository), commit the baseline, and push it before implementing the contract.
5. Verify the remote and successful push. If authentication or connectivity prevents pushing, report the blocker promptly; do not claim remote progress or invent a substitute history.

Subsequent milestones must produce real, coherent commits in implementation order, with appropriate checks before pushing. Do not fabricate development history, backdate commits, or squash away the progression before delivery.

Proposed commit sequence, to refine after specifications are complete:

1. Planning baseline and repository setup.
2. Toolchain, project structure, and local configuration.
3. Escrow contract with transition, access, token, and boundary tests.
4. Event persistence and indexer with duplicate/restart tests.
5. API with filters, pagination, and time-derived status tests.
6. Local orchestration and full lifecycle demo with integration verification.
7. Documentation, AI usage record, optional checks if time allows, and delivery verification.

Keep each commit runnable to the extent appropriate for its milestone. Record validation honestly in commit descriptions or delivery notes. Push after each milestone; use additional commits for meaningful fixes rather than combining unrelated changes. The repository must ultimately be accessible to evaluators; private repository access is a delivery check requiring their actual GitHub identities.

## Earlier open items (resolved later unless noted)

- GitHub account, repository name, and visibility.
- Exact technical specification and acceptance-test matrix.
- Final optional scope after the mandatory solution is verified.

## Accepted token policy and priorities

Rodrigo accepted on October 13, 2026:

- Do not support fee-on-transfer tokens. Changes to accounting and payout semantics would expand the core mechanism unnecessarily for this deadline.
- Creation must measure the contract token balance before and after transferFrom and revert if the received amount differs from the requested amount. A revert rolls back the deposit and escrow creation.
- Preserve support for ERC-20 tokens that omit boolean return values through SafeERC20; this mandatory compatibility requirement is distinct from fee-on-transfer support.
- Document the token assumptions and unsupported behavior explicitly in the README.
- Focus first on all mandatory deliverables. Fuzzing and invariant tests are possible later additions that must not change the core mechanism.

Implementation caveat: the deposit balance check alone does not detect every token that charges fees only on outgoing transfers, rebases, or behaves maliciously. Do not claim universal detection or support for arbitrary ERC-20 behavior. Complete the outgoing-transfer/accounting policy and token assumptions in the contract specification before execution.

## Accepted authorization design

- No owner, admin, global SENDER_ROLE/BENEFICIARY_ROLE, or participant allowlist.
- Authorization is scoped to the immutable sender and beneficiary recorded in each escrow. The same account may be sender in one escrow and beneficiary in another.
- Express repeated authorization checks through modifiers onlySender(uint256 id) and onlyBeneficiary(uint256 id), making required permissions visible in public function declarations.
- Unauthorized calls must revert with custom errors, proposed signatures UnauthorizedSender(uint256 id, address caller) and UnauthorizedBeneficiary(uint256 id, address caller).
- Unknown identifiers must produce a distinct custom error before party comparisons. Final specification must define consistent validation order and tests for it.
- Sender-only functions: cancellation and expiry recovery. Beneficiary-only functions: confirmation and rejection. Creation assigns msg.sender as sender without administrative enrollment; reads are public.
- Modifiers enforce access only; state, time-window, and transfer rules remain explicit and reviewable. Reuse coherent validation helpers where appropriate, without adding inheritance layers solely to invoke SOLID terminology.
- Keep a reentrancy guard around token-interacting entry points, including creation. Final specification must settle modifier ordering and avoid unnecessary repeated storage lookups where practical.

Rationale: clear function-level permissions, consistent custom errors, immutable per-escrow authority, and no administrative revocation that could block fund recovery.

## Accepted contract interface and lifecycle

Rodrigo accepted the proposed interface and exact deadline behavior:

- createEscrow(address token, address beneficiary, uint256 amount) returns (uint256 id).
- cancelEscrow(uint256 id) and recoverExpired(uint256 id): sender only.
- confirmEscrow(uint256 id) and rejectEscrow(uint256 id): beneficiary only.
- getEscrow(uint256 id) returns (Escrow memory), reverting EscrowNotFound(id) for unknown identifiers.
- Sequential identifiers start at 1.
- Fixed constants: cancellation window 2 hours, TTL 7 days.
- Cancel before cancelDeadline; confirm/reject before expiresAt; recover at or after expiresAt.
- Beneficiary may confirm/reject during the cancellation window. First valid transaction executed resolves the escrow.
- All resolutions require Pending. Terminal states are permanent.
- Apply state effects before outgoing token transfers. Failed transfers revert the entire resolution, preserving the prior escrow.

## Accepted state representation and explicit lifecycle modifiers

- Persist the State enum in each EscrowData. Stored state changes only through successful transactions.
- Derive lifecycle eligibility from recorded state and a timestamp; time passing alone does not mutate storage or refund tokens.
- Add getEscrowStatus(uint256 id) external view returns (EscrowStatus memory), using block.timestamp.
- EscrowStatus fields: State recordedState; bool expiredByTime; bool canCancel; bool canConfirm; bool canReject; bool canRecover.
- expiredByTime is true only for Pending escrows whose expiresAt has been reached. It describes unresolved time expiry, not completed recovery.
- Action flags express availability for the designated actor according to state/time; they do not authorize the caller or guarantee token transfer success.
- Use shared internal lifecycle predicates and explicit modifiers for Pending state and the relevant time window, in addition to onlySender(id)/onlyBeneficiary(id).
- Preserve precise custom errors for unknown IDs, wrong actors, terminal states, and invalid windows.
- API must expose recorded state separately from effective status and recoverability. Derive time conditions from chain timestamps, not confirmation/block counts; settle timestamp freshness during backend planning.

## Accepted blockchain tooling update

Rodrigo agreed to Foundry/Anvil and ethers.js after comparing viem and ethers and explaining Anvil:

- Forge compiles Solidity and runs contract tests.
- Anvil runs the local EVM node for deployment, indexing, and the lifecycle demo, including development time controls.
- Use ethers v6 for the TypeScript backend and demo; this supersedes the earlier viem direction.
- Ethers v6 uses native bigint. Serialize amounts and escrow IDs as decimal strings at database/API boundaries; do not convert uint256 values to JavaScript numbers.
- Pin compatible concrete dependency versions during implementation preparation. Ethers does not require Hardhat; maintain one Solidity toolchain.

Indexer choice: custom TypeScript indexer was recommended over a subgraph for the deadline and local reproducibility. Its detailed design and SQLite choice remain proposals to review next. Do not infer finalized persistence/reorg semantics from acceptance of the blockchain tooling.

## Accepted indexer design (October 14, 2026)

- Custom ethers v6 TypeScript indexer with SQLite; no subgraph for this delivery.
- Four tables: indexer_state (deployment identity/checkpoint), indexed_blocks (canonical headers/timestamps), escrow_events (event journal), escrows (projection). Full proposed schema accepted and recorded in 04-indexer-spec.md.
- Single deployment per database. Event uniqueness: (block_hash, log_index). Transaction hash alone is insufficient.
- Serialized, ordered catch-up with atomic journal/projection/header/checkpoint persistence. Duplicate events never reapply projection effects. Advance checkpoints through empty blocks.
- Confirmation depth means successor blocks: local demo 0; non-local default 2, configurable. This is a confirmation buffer, not protocol finality.
- Detect committed-history changes through block hashes; fail closed, unhealthy health status and 503 escrow reads; explicit canonical rebuild. Automatic rollback deferred.
- No stored time-derived status/flags. Timestamp freshness and API semantics are next planning steps.

## Accepted API time reference (October 14, 2026)

- Calculate time-derived status and lifecycle flags from the last fully indexed block's timestamp, not server time or an unindexed latest block.
- Read escrow projection and indexed snapshot metadata consistently in one database read transaction.
- Responses expose asOfBlock and asOfTimestamp. These describe an indexed snapshot, not guaranteed current transaction eligibility.
- Confirmation depth and indexing lag can delay observable expiry. The local demo must advance time and mine a block, then wait for indexing.
- Terminal states take precedence over all deadline calculations. Pending at/after expiresAt has effective status Expired and recoverable true; completed Expired has recoverable false.
- Do not perform live contract reads to populate ordinary escrow endpoints. A separate live status feature is deferred.

API proposal still to review: pagination, complete JSON schema, input validation, error responses, HTTP framework, and health freshness/lag semantics.

## Accepted list ordering (October 14, 2026)

- Default order: newest created first, using sequential escrow IDs in descending numeric order.
- A resolution does not change list position. Do not add last-activity fields or activity-based sorting for this delivery.
- Exclusive cursor is the last returned ID; the following page includes matching IDs smaller than that cursor.
- Since IDs are canonical decimal strings, compare numerically using string length and then lexicographic comparison. Do not cast uint256 IDs to SQLite INTEGER or JavaScript number.
- Proposed supporting index: (length(id) DESC, id DESC). Final query must use equivalent numeric comparisons for the exclusive cursor.
- Use live pagination: each page has its own indexed snapshot metadata; no frozen cross-page snapshot is promised. Newly created higher IDs will not enter subsequent pages, but resolutions/time changes can change filter membership between pages. Explain this limitation in the README.

## Accepted documentation requirement

- Produce a detailed delivery README draft during planning, based on these conversations: requirements, decisions, assumptions, rationale, trade-offs, limitations, and future improvements.
- Implementation agent must finalize the root README with actual, tested setup/start/demo/test/rebuild commands, configuration and curl examples. Never present proposed or unverified commands as tested.
- Use analysis/10-delivery-readme-draft.md as the starting narrative; analysis/02-decisions.md remains the authoritative decision log. Keep the final README consistent with implemented behavior.

## API defaults prepared for review (October 14, 2026)

Under Rodrigo's instruction to move forward, 05-api-spec.md now specifies recommended defaults: Fastify; detail/list JSON shapes; raw amounts; effective status filters; default limit 20/max 100; strict scalar query validation; structured 400/404/503/500 errors; health checkpoint/eligible-lag metadata; 2-second fallback catch-up; configurable 30-second RPC freshness threshold. These details are recommendations, not separately confirmed decisions. Health server-time freshness does not affect chain-time lifecycle calculations.

06-test-matrix.md maps mandatory behavior to verification evidence. Exact runnable commands and dependency versions remain for the delivery/execution specification.

## API defaults accepted (October 14, 2026)

Rodrigo accepted the API defaults summarized in the preceding proposal, including Fastify, strict input validation, structured errors, limit 20/max 100, health/checkpoint/lag visibility, configurable 30-second RPC freshness behavior, and separation of server-clock health from indexed chain-time lifecycle status. This supersedes the preceding 'prepared for review' qualification.

## October 15 extension: deployment, coverage, runtime health, future testnet

Rodrigo requested explicit deployment/listener specification, tests and coverage targets, end-to-end health diagnostics, README explanation, and Sepolia/explorer configuration readiness. See 11-runtime-deployment-health.md and appended requirements in 06/07/08/10.

- Contract tests remain Foundry Solidity .t.sol. Numerical targets newly specified: first-party Escrow 100% line/statement/function, >=95% branches (aim 100%); every critical reachable behavior tested regardless of score. Backend targets >=90% line/statement/function and >=85% branches. These are planning targets, not achieved measurements or PDF requirements.
- Required named Forge deploy scripts and receipt/code/manifest checks; HTTP block polling and one Node.js process own the ingestion/listener and embedded SQLite writes.
- Required read-only healthcheck terminal/JSON/optional report command, worker progress diagnostics, and separate state-changing LOCAL ONLY smoke proof.
- Prepare Sepolia config and opt-in deploy/verify instructions/commands, no public broadcast or verification submission now. This extends earlier testnet exclusion for preparation only; Anvil remains delivered/default network.
