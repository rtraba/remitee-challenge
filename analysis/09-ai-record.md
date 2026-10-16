# AI planning record

This is a curated record of actual prompts and meaningful planning outputs, not a complete transcript. The challenge asks to include prompt outputs. Preserve this record in the repository and expand docs/ai-usage.md during execution with actual prompts/results. Never fabricate missing transcripts or include credentials/private correspondence.

## Actual prompt excerpts and resulting outputs

1. Rodrigo: "The instructions fro codex should start with github repository setup, and the pushing changes during the implementation phase so evaluators can revieww the progress in ordered commits"
   Output: initial remote setup/push is milestone 0; meaningful validated commits pushed during implementation. See 02-decisions.md and 08-execution-plan.md.

2. Rodrigo: "I agreed, not support for fee-on-transfer because the change in accounting represent a major change in the contract behavior. Lets keep consistency and simplicity first"
   Output: validate exact deposit receipt, revert non-exact deposits, use SafeERC20 for mandatory optional-return token compatibility, document unsupported token economics. See 03-contract-spec.md.

3. Rodrigo: "use function modifiers like onlySender() or onlyBeneficiary() making it explicit and easily anderstandable on reading the code"
   Output: onlySender(id)/onlyBeneficiary(id), scoped to immutable escrow parties, with custom errors and no admin/global roles. See 03-contract-spec.md.

4. Rodrigo: "how to treat state changes that depends on time passing if nobody actually executed a transaction yet"
   Output: recorded State remains Pending until a transaction; getEscrowStatus derives flags; API distinguishes recordedState from effective status and recoverable expiry. Shared lifecycle predicates/modifiers keep deadline semantics consistent.

5. Rodrigo: "I'm used to ethers.js... any advantage os disadvabntade on each one?"
   Output: ethers v6 selected over viem for author familiarity; Foundry/Anvil remain the Solidity/local node toolchain; uint256 serialization uses decimal strings.

6. Rodrigo: "Wha identifies unequivocally events ... how many blocks are we going to consider as finality ... what are reorgs"
   Output: per-stream (blockHash, logIndex) identity, transactional journal/projection/checkpoint, local depth 0/non-local default 2 successors with no protocol-finality claim, hash detection and fail-closed explicit rebuild. See 04-indexer-spec.md.

7. Rodrigo: "agree with using the indexed block timestamp for consistent responses"
   Output: one indexed state/time snapshot per request, exposed asOfBlock/asOfTimestamp; no server-clock lifecycle calculation.

8. Rodrigo: "lets keep the most simple approach,that 'd be newest created then?"
   Output: newest-created numeric ID descending, exclusive cursor, live cross-page semantics; no activity-order fields. See 05-api-spec.md.

9. Rodrigo: "I'll need a detailed README file ... explaining all the desitions and assumtions taken and why"
   Output: 10-delivery-readme-draft.md provides narrative before execution; implementation completes and verifies operational sections.

10. Rodrigo accepted API defaults with "its ok" after the API/test-matrix proposal.
    Output: accepted defaults recorded in 02-decisions.md and defined in 05-api-spec.md.

## Reusable execution prompt

Implement the Remitee challenge in /home/rodrigo/code/remitee by following analysis/08-execution-plan.md and its referenced specifications. Begin with GitHub repository setup and initial push, resolving account/name/visibility with me if needed. Push coherent commits at each validated milestone. Complete every mandatory deliverable before optional work. Finalize the root README from analysis/10-delivery-readme-draft.md using tested commands and explain the agreed decisions and assumptions. Record actual AI prompts and meaningful outputs. Do not contact evaluators or send the submission without my instruction.

11. Rodrigo requested deployment-script confirmation, contract/indexer test cases and coverage, explicit listener/process ownership, terminal/file health diagnostics, and future Sepolia/Etherscan/Blockscout preparation.
    Output: 11-runtime-deployment-health.md plus coverage targets and execution/README extensions. No implementation or public deployment was performed by this planning task.
