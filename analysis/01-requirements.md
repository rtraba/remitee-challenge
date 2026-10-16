# Challenge requirements and initial review

Status: source review complete; design decisions pending.

## Objective

One Solidity contract manages multiple ERC-20 escrows. A Node.js API indexes its events into a database. The chain is authoritative; the database is an event-derived projection. Favor a simple, correct, justified solution.

## Required contract behavior

Each escrow records an identifier, sender, beneficiary, token, amount, cancellation deadline, expiry, and state. Creation transfers tokens from sender to contract and produces Pending state.

| Action | Authorized actor | Time condition | Terminal state | Recipient |
| --- | --- | --- | --- | --- |
| Cancel | Sender | t < creation + 2 hours | CancelledBySender | Sender |
| Confirm | Beneficiary | t < creation + 7 days | Released | Beneficiary |
| Reject | Beneficiary | t < creation + 7 days | Rejected | Sender |
| Recover expired funds | Sender | t >= creation + 7 days | Expired | Sender |

The strict comparisons follow the action table's wording. Make exact-boundary behavior explicit in the final specification and README. Time passing alone does not execute a contract transition.

All resolution actions require Pending state. A terminal escrow cannot be resolved again. Wrong actors and out-of-window actions revert with clear errors, preferably custom errors.

Required validation: positive amount; beneficiary neither zero nor sender. Token specified per escrow; support ERC-20 transfers without boolean return values. No third party, including any owner, may move escrow funds. Expose a read function by identifier.

Required events: EscrowCreated(id, sender, beneficiary, token, amount, cancelDeadline, expiresAt), EscrowCancelled, EscrowReleased, EscrowRejected, EscrowExpired. Events must suffice to reconstruct escrows without reading contract storage.

## Required backend behavior

- Subscribe to contract events and persist the resulting records in a database.
- Duplicate processing must not duplicate or corrupt data.
- Restart from the last processed block without losing events.
- Document chain reorganization treatment; waiting for confirmations is an explicitly permitted example.
- GET /escrows/:id returns state, amounts, parties, deadlines, and transaction hashes.
- GET /escrows supports sender, beneficiary, and status filters with pagination.
- GET /health returns service status and last indexed block.
- Pending escrows past TTL must be reported as expired and recoverable, even before on-chain recovery.
- Responses indicate whether sender cancellation remains available.
- API need not sign transactions or hold keys.

## Required delivery

- Solidity 0.8.x contract and tests.
- Node.js API; TypeScript recommended; viem or ethers.
- API tests, at least covering event processing.
- Local EVM execution against Anvil or Hardhat Network.
- A command or Docker Compose setup that starts node, deployment, database, and API.
- A script demonstrating creation and all four resolutions, advancing local chain time for expiry. Terminal states imply separate escrows for these scenarios.
- GitHub repository accessible to evaluators, with meaningful development commits.
- README: installation, startup, tests, curl/HTTP examples, design decisions, assumptions, and improvements with more time.
- Include AI prompt outputs. Clarify the record format during planning; preserve meaningful prompts and outputs rather than attempting to recreate them at submission.
- Be prepared to explain and challenge the implementation in a 45-60 minute interview.

## Evaluation priorities

| Criterion | Weight |
| --- | --- |
| Contract security | 30% |
| Logic correctness | 20% |
| Tests | 20% |
| API and indexer | 15% |
| Quality and documentation | 15% |

Optional features do not compensate for security errors.

## Optional work, not yet selected

Fuzz/invariant tests; fee-on-transfer support; EIP-2612 permit; gas reports; justified storage optimization; static analysis with explained findings; webhooks; CI. Testnet deployment is optional.

## Decisions to resolve

1. Stack and dependency versions; verify current official documentation when choosing them.
2. Time available and Rodrigo's familiarity with Solidity tooling and backend stack.
3. Constants versus immutable timing parameters; escrow identifiers and unknown-id behavior.
4. Token policy: optional-return transfers, fee tokens, rebasing tokens, malicious callbacks, invalid token addresses, and transfer failures. Explain limits of the challenge's broad ERC-20 wording.
5. Reentrancy protection and checks-effects-interactions for both creation and resolution.
6. Separate on-chain state from time-derived API state so recoverable expiry cannot imply a refund already happened.
7. Chain time versus server time; response freshness and behavior during RPC failure.
8. Status-filter semantics for time-derived expiry; deterministic pagination.
9. Event identity, ordering, journal schema, transaction hashes, and atomic projection/checkpoint writes.
10. Confirmations, block-hash verification, reorg limits, and recovery behavior.
11. Local deployment identity, restarts, node resets, demo reproducibility, and configuration.
12. Optional scope after mandatory acceptance criteria are covered.

## Security notes to develop

Every token is an external interaction and can revert or call back. Deposits must not create underfunded liabilities. Resolution must not pay twice. Failed transfers must leave a coherent escrow. Token balances can include unsolicited transfers, so an invariant asserting exact equality with pending liabilities needs explicit assumptions; solvency is the more general property. Arbitrary tokens can also pause or blacklist users, which the contract cannot universally prevent.

## Planning completion gate

Implementation is ready only when contract behavior, API semantics, ingestion/recovery policy, local startup, and tests have concrete specifications; all material assumptions have documented decisions; and the ordered execution plan has been reviewed with Rodrigo.
