# Required verification matrix

Status: mandatory acceptance requirements prepared for execution; exact runnable commands will be established and recorded by implementation. Optional fuzz/invariant work follows mandatory checks.

| Area | Required checks | Evidence |
| --- | --- | --- |
| Contract creation | Valid storage/event/receipt/deadlines; sequential IDs; zero amount, invalid beneficiary/token, allowance/balance failure; no orphaned ID/state | Forge unit tests |
| Authorization | Sender and beneficiary modifiers; wrong party, unrelated party, party of another escrow; unknown IDs | Forge custom-error assertions |
| State machine | All four resolutions and correct balances/events; every action rejected from every terminal state; independent escrows/tokens | Forge unit tests |
| Time | Cancellation/confirmation/rejection/recovery at deadline - 1, exact deadline, + 1; beneficiary resolution inside first two hours | Forge timestamp control |
| Derived status | Status-query flags match transition eligibility at all boundaries; no storage change from time/read; terminal flags false | Forge unit tests |
| Token safety | Standard and no-return tokens; false/reverting transfers; exact-deposit rejection; callback attacks on creation/payout; atomic transfer failure | Adversarial token fixtures and Forge tests |
| Event projection | Creation and each terminal event; all immutable fields and transaction hashes reconstructed without contract storage | Backend unit/database tests |
| Idempotency | Repeat identical log; multiple logs in one transaction; conflicting same-identity payload fails; no double update | Real temporary SQLite database tests |
| Atomicity/restart | Inject failure before commit, then retry; committed restart skips scanned blocks; empty blocks advance checkpoint | Database transaction and fake RPC tests |
| Ingestion | Deterministic ordering; catch-up after missed notifications/disconnect; serialized worker; cutoff depth 0 and 2 | Fake RPC tests |
| Reorg/rebuild | Checkpoint mismatch, header/log mismatch, transient range change; fail-closed health/reads; canonical rebuild; mismatched deployment/reset | Fake RPC tests plus local integration where practical |
| HTTP | Valid/invalid inputs, not found at snapshot, schemas, all filters, decimal strings, pagination, flags/status, health freshness and failure behavior | Fastify injection tests |
| Full lifecycle | Separate escrows created/released/rejected/cancelled/recovered; pending expired API state before recovery; hashes and payouts match | Anvil integration/demo assertions |
| Reproducibility | Clean install; one-command local start; demo; all test commands; stop/restart resumes without loss; no secrets tracked | Clean-checkout delivery verification |
| Documentation | Implemented behavior and commands match README; curl examples; decisions/assumptions; AI prompt outputs; evaluator access | Final review checklist |

Do not replace behavioral tests with snapshots that merely mirror implementation. Use explicit expected balances, states, errors, and API fields. Include arbitrary large uint256 amounts/IDs at serialization boundaries, and IDs 9/10 for decimal ordering.

Optional invariants must define a standard-token threat model: balance >= pending liabilities accommodates unsolicited transfers; exact equality requires disallowing such transfers in the test model. No claim that arbitrary token contracts preserve solvency.

## Numerical coverage targets and tools (October 15 extension)

Contract tests are Solidity .t.sol tests using Foundry/forge-std, not Hardhat/TypeScript contract tests. API/indexer/database/HTTP tests are TypeScript; integration/demo clients are TypeScript against Anvil.

For first-party contracts/src/Escrow.sol: target 100% executable line coverage, 100% statement coverage, 100% function coverage, and at least 95% measured branch coverage, aiming for 100%. All reachable branches in access checks, Pending checks, deadlines, deposit accounting and rollback/security handling must have behavioral assertions regardless of the numerical score. Percentages are project quality targets, not a threshold specified in the challenge PDF.

Use forge coverage with summary and LCOV reports supported by the pinned version; expose npm run coverage:contract. Reports must include file-level scope and distinguish first-party contract code from OpenZeppelin, forge-std, scripts, and token fixtures. Do not modify dependencies or contract logic to inflate a metric. If a pinned instrumentation tool cannot measure a metric or reports unreachable/instrumentation artifacts, document raw results, uncovered locations, and precise justification; do not silently lower thresholds or report an unmeasured percentage as achieved.

For first-party backend modules (ingestion, chain adapter, projector, DB repository, lifecycle, and routes): target at least 90% line/statement/function and 85% branch coverage via the TypeScript test runner's supported coverage tool. Expose npm run coverage:api. Coverage gaps must not omit any mandatory scenario. Thin entry points/scripts can have separate integration coverage rather than fake unit tests. Record actual metrics only after running the tools.

Add npm run test:integration for deployment/startup/healthcheck/smoke against Anvil. Include the original lifecycle demo, DB restart, and a deliberately mismatched deployment identity. Include explicit tests for scanner/worker liveness versus RPC liveness, schema readiness, healthcheck exit/report behavior, no-event deployment, and disabled-by-default public network execution. See 11-runtime-deployment-health.md.

Targets do not replace mutation reasoning/security review; a line executed once is not proof of correct behavior. Meaningful fuzz/invariant tests remain optional after mandatory deterministic coverage and demo reliability.
