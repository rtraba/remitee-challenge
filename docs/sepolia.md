# Sepolia and explorer preparation

[Quick start](../README.md) · [Operations](operations.md) · [Toolchain](toolchain.md)

This is an optional reference, not part of the local quick start. The contract is delivered and validated on Anvil. Public network steps require a separate explicit operator decision.

## Prepared Sepolia and explorer workflow

**Prepared and locally tested only. No public step below was executed.** Use your own user-managed encrypted Foundry account and fund its address with Sepolia ETH through your chosen legitimate source. No real keys are needed for local build/test/start/health. The repository provides no mainnet profile, faucet automation or local-to-public fallback. Do not reuse Anvil keys or local fixture addresses on Sepolia.

Set the following explicitly in an operator-controlled shell; keep actual secrets in your environment:

```bash
export NETWORK=sepolia
export SEPOLIA_RPC_URL='https://YOUR_SEPOLIA_RPC_ENDPOINT'
export MANIFEST_PATH=deployments/sepolia.json
export DB_PATH=data/sepolia.sqlite
export CONFIRMATION_DEPTH=2
export FOUNDRY_ACCOUNT='your-encrypted-foundry-account-name'
export DEPLOYER_ADDRESS='0xYOUR_ACCOUNT_ADDRESS'
npm run deploy:sepolia:dry-run
# Later, only when you intentionally authorize and invoke broadcast:
npm run deploy:sepolia
```

Both commands first require RPC chain ID **11155111**. Dry-run uses the explicitly selected address for RPC simulation and has no `--broadcast` or keystore signing flag. Broadcast adds the named encrypted account and explicit broadcast flag; it never adds verification. Store/import that account with Foundry's encrypted account tooling separately; account provisioning, password management, funding and public simulation are not live-validated here. No private-key CLI argument is generated. Broadcast requires a fresh manifest path and writes a manifest only from validated successful receipts/code. Contract timings remain constants with no constructor arguments.

After a later successful deployment, select its actual address from the manifest:

```bash
export TARGET_ADDRESS='0xACTUAL_ESCROW_ADDRESS_FROM_SELECTED_MANIFEST'
export ETHERSCAN_API_KEY='YOUR_API_KEY'
npm run verify:sepolia:etherscan
# Alternative explicit supported Blockscout instance/API:
export BLOCKSCOUT_VERIFIER_URL='https://YOUR_SUPPORTED_BLOCKSCOUT_API_ENDPOINT/api/'
# export BLOCKSCOUT_API_KEY='YOUR_KEY_IF_REQUIRED'
npm run verify:sepolia:blockscout
```

Verify-only commands require the explicit target to match the selected manifest and preflight the chain/receipt/runtime/build. They never deploy. Etherscan explicitly uses its V2 endpoint with `chainid=11155111`; Blockscout requires an operator-selected supported HTTPS endpoint and optional key. Existing-address flags were checked against the pinned Forge CLI and compiled standard input locally; authentication, endpoint compatibility and verification results are **not live-tested**. A later actual invocation records success/failure in an ignored manifest-adjacent verification JSON. Verification is source/bytecode correspondence, not a security audit.

Keep exact Solidity 0.8.30, optimizer 200, Cancun EVM, source/dependency versions and empty constructor args. Do not change build settings between deployment and verification. References: [Etherscan Foundry guide](https://docs.etherscan.io/contract-verification/verify-with-foundry), [Blockscout Foundry guide](https://docs.blockscout.com/devs/verification/foundry-verification), [Foundry verifier flags](https://www.getfoundry.sh/reference/common/verifier-options).

Start the API separately against that profile (never `npm run local` for Sepolia):

```bash
npm run api:start
# another terminal, same profile exports
npm run healthcheck
```

Choose/deploy your own supported Sepolia ERC-20 explicitly; production Escrow deployment does not deploy a demo token. Through a compatible explorer and a testnet wallet: connect the intended account, approve the token for the actual Escrow address, call `createEscrow(token, beneficiary, rawAmount)`, then resolve from the required sender/beneficiary. Read `getEscrow` and `getEscrowStatus` through the explorer after source verification. No assumption is made that a token allows minting or permit. Sepolia uses real block time: cancellation remains two hours, expiry seven days; Anvil time travel and local smoke/demo are unavailable there. Two successor blocks are a buffer, not protocol finality.
