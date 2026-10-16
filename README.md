# Remitee ERC-20 escrow challenge

A Solidity escrow contract with a Node.js/TypeScript event indexer and read-only API. Senders deposit ERC-20 tokens; beneficiaries accept or reject them, while cancellation and expiry rules protect the sender. One contract manages multiple independent escrows.

The blockchain is authoritative. Contract events feed a transactional SQLite projection, and the API exposes the indexed state, transaction hashes, and time-dependent action availability. The API never signs transactions or holds wallet keys.

## Install and run

Requires **Node.js 22** and **Foundry** (`forge` and `anvil` on PATH). Tested versions and installation references are in [toolchain notes](docs/toolchain.md). SQLite is embedded; no database server is needed. Docker is not required.

```bash
git clone https://github.com/rtraba/remitee-challenge.git
cd remitee-challenge
npm ci                          # npm install is also supported
npm run build
npm run local
```

Wait for `Local system ready`. This command starts Anvil, deploys Escrow and the demo token, initializes SQLite, and starts the API/indexer. Defaults: RPC `http://127.0.0.1:8545`, API `http://127.0.0.1:3000`. Press **Ctrl-C** to stop its processes.

In another terminal, from the same repository:

```bash
npm run healthcheck             # read-only readiness diagnostics
npm run smoke                   # create/cancel and assert the live write path
npm run demo                    # all four resolutions, including seven-day expiry
```

The demo uses separate escrows, advances Anvil time, checks expiry before recovery, and asserts payouts and indexed transaction hashes. Local fixture wallets are public Anvil development accounts; no real credentials are needed.

Startup refuses existing manifest/database paths rather than erasing them. For a later fresh session, export the following in **both terminals**, choosing unused paths:

```bash
export MANIFEST_PATH=deployments/session-2.json
export DB_PATH=data/session-2.sqlite
```

Then run `npm run local` again. For API-only restart, backed-up rebuild, custom ports, or configuration, see [operations](docs/operations.md).

## Test the solution

```bash
npm test                        # contract + backend tests
npm run test:integration         # isolated Anvil deployment, demo, restart/reorg/rebuild
npm run coverage:contract
npm run coverage:api
```

Stop the local stack before coverage and run `npm run build` afterward to restore production artifacts. Integration uses ports 18545/13000 and cleans up its own processes.

Last validated on October 16, 2026: **10 Forge tests and 29 backend tests passed**, plus integration and fresh-clone startup/health/smoke/demo checks. Measured first-party coverage:

| Scope           | Lines  | Statements | Functions | Branches |
| --------------- | ------ | ---------- | --------- | -------- |
| Escrow contract | 100%   | 100%       | 100%      | 100%     |
| Backend logic   | 99.71% | 99.74%     | 98.41%    | 96.54%   |

These are scoped tool measurements, not a security audit. [Validation details](docs/operations.md#commands-and-actual-verification) explain exclusions, source-map warnings, and clean-checkout evidence.

## Try the API

With the stack running, run smoke or demo first to create records:

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/escrows/1
curl -fsS 'http://127.0.0.1:3000/escrows?status=Released&limit=20'
```

`GET /escrows` also supports sender/beneficiary filters and an exclusive ID cursor. IDs and raw token amounts are decimal strings. Responses expose `recordedState`, effective `status`, action flags, and `asOfBlock`/`asOfTimestamp`. A 404 means absent from the indexed snapshot; unhealthy or unavailable indexing returns 503. [API details and examples](docs/operations.md#http-examples-and-semantics) describe validation, errors, and pagination.

## Design decisions and assumptions

| Action  | Authorized party | Time from creation | Funds go to |
| ------- | ---------------- | ------------------ | ----------- |
| Cancel  | Sender           | Before 2 hours     | Sender      |
| Confirm | Beneficiary      | Before 7 days      | Beneficiary |
| Reject  | Beneficiary      | Before 7 days      | Sender      |
| Recover | Sender           | At/after 7 days    | Sender      |

Terminal states are permanent. Permissions belong to each escrow's parties; there is no owner/admin withdrawal. SafeERC20 supports optional-return tokens, a reentrancy guard protects token interactions, and non-exact deposits revert. Fee-on-transfer, rebasing, and malicious token economics are unsupported.

SQLite keeps local execution simple. One serialized worker atomically commits events, projection, and checkpoint; duplicate events cannot reapply effects. HTTP polling plus fallback catch-up supports restart recovery and advances through empty blocks.

Time passing does not refund tokens: Pending after TTL is reported as expired/recoverable until recovery succeeds. Lifecycle flags use the indexed block timestamp, so they can lag current-chain eligibility. Local confirmation depth is zero; committed-history changes fail closed and require explicit rebuild. Pagination is live across requests.

## Further reading and improvements

- [Design](docs/design.md): rationale, security assumptions, indexing, reorgs, and limitations.
- [Operations](docs/operations.md): configuration, diagnostics, API reference, restart/rebuild, and validation.
- [Toolchain](docs/toolchain.md): exact versions and compatibility notes.
- [Sepolia preparation](docs/sepolia.md): optional commands; no public deployment or verification was performed.
- [AI usage](docs/ai-usage.md): actual prompts/output excerpts and implementation record.

With more time: focused invariants, CI, automatic reorg rollback, and Docker packaging for evaluator convenience. These are future improvements; local execution already satisfies the challenge's single-command startup requirement.
