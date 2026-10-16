# Remitee challenge: planning workspace

Status: planning handoff complete. Ready for implementation when Rodrigo explicitly requests it. No implementation or remote repository has been created in this planning phase.

Source: ../Remitee_Challenge_Blockchain_Engineer.pdf (October 2026, four pages).

## Working agreement

Develop the solution specification step by step with Rodrigo before implementation. Save planning artifacts here. Separate explicit challenge requirements, proposed decisions, accepted decisions, and open questions. Do not interpret a proposal as an accepted decision. Do not begin solution implementation until Rodrigo requests execution.

## Planning sequence

1. Requirements and scope: confirm mandatory deliverables, available time, experience, and optional work budget.
2. Contract specification: state machine, time boundaries, interface, events, errors, token assumptions, threat model, and accounting.
3. Backend specification: event journal, database projection, atomic checkpoints, catch-up and live ingestion, restart behavior, reorg policy, and time source.
4. API specification: response fields, numeric representation, computed state, filtering, pagination, validation, and health semantics.
5. Verification specification: requirement-to-test matrix, adversarial tokens, time boundaries, indexer failures, and full local integration.
6. Delivery specification: local startup, deployment artifacts, demo scenarios, repository structure, documentation, AI prompt/output record, and interview preparation.
7. Execution handoff: ordered tasks with dependencies, concrete acceptance criteria, validation commands, and commit milestones. Review consistency before marking ready.

## Planned artifacts

- 01-requirements.md: initial challenge review (available).
- 02-decisions.md: scope, accepted constraints, tooling direction, and GitHub progress requirements (accepted decisions and chronological rationale).
- 03-contract-spec.md: contract behavior, lifecycle queries/modifiers, and security model (available).
- 04-indexer-spec.md: accepted schema, ingestion, confirmations, and reorg policy (available).
- 05-api-spec.md: accepted endpoint, snapshot, pagination, error, and health behavior.
- 06-test-matrix.md: mandatory verification matrix.
- 07-local-delivery.md: layout, target commands, startup, demo, and documentation.
- 08-execution-plan.md: ordered implementation instructions beginning with GitHub setup/push.
- 09-ai-record.md: curated real planning prompt/output record and execution prompt.
- 10-delivery-readme-draft.md: detailed narrative to finalize as the delivery README.
- 11-runtime-deployment-health.md: explicit runtime/listener flow, deploy scripts, healthcheck/smoke, and optional Sepolia preparation (October 15 extension).

All listed documents are available. Exact dependency versions and tested operational commands will be established during implementation. GitHub account/name/visibility remain required user inputs before remote creation.

Start execution with 08-execution-plan.md; later accepted entries in 02-decisions.md supersede earlier proposals. No activity sorting, viem backend, or global access roles should be implemented. The API uses newest-created order and indexed chain timestamps.

The October 15 extension adds required coverage targets, deployment/diagnostic commands, and future testnet configuration. Read 11-runtime-deployment-health.md and appended execution-plan requirements; they supersede older exclusions only for testnet preparation, never automatic public deployment.
