# Reproducible toolchain

[Quick start](../README.md) · [Design](design.md) · [Operations](operations.md)

Tested on Linux x64. Node 22 can be selected with `nvm use` when nvm is available; `.nvmrc` records the tested version. Install the pinned Foundry release from [official releases](https://github.com/foundry-rs/foundry/releases/tag/v1.1.0) and ensure `forge` and `anvil` are on PATH. SQLite uses the bundled native npm driver; no separate database service is required.

Node 22.16.0/npm 10.9.2; installed Forge and Anvil 1.1.0-stable, commit d484a00089d789a19e2e43e63bbb3f1500eb2cbf. Solidity 0.8.30, Cancun EVM, optimizer 200 runs. Exact npm dependencies and integrity references are in package-lock.json. forge-std v1.9.7 is vendored with its upstream license to avoid submodule-install ambiguity.

The implementation uses ethers v6 HTTP polling, Fastify 5, better-sqlite3, and OpenZeppelin 5.4.0. These compatible versions are deliberately pinned rather than automatically upgraded to newer major releases. API configuration never includes a signer.

Official references checked during implementation:

- https://docs.ethers.org/v6/api/providers/jsonrpc/ — HTTP polling and provider options.
- https://fastify.dev/docs/latest/Reference/LTS/ — supported Node release policy.
- https://github.com/WiseLibs/better-sqlite3 — native driver and installation support.
- https://docs.openzeppelin.com/contracts/5.x/api/token/erc20 — SafeERC20 optional return handling.
- https://docs.openzeppelin.com/contracts/5.x/api/utils — ReentrancyGuard.
- https://getfoundry.sh/forge/deploying/ — explicit broadcast semantics.
- Installed `forge coverage --help` — version-specific summary/LCOV flags, report path, scope exclusion.

Public explorer command construction was checked against the pinned CLI and official explorer guidance during implementation; see the references below. No public operation has been executed.

Installer note: npm 10.9.2 crashed resolving optional Vite 8 devtools peers with `Cannot read properties of null (reading 'edgesOut')`. Vite is explicitly pinned to compatible 6.4.4, with Vitest/coverage 4.1.11; the resolver still crashed. `.npmrc` uses `legacy-peer-deps=true` to skip optional peer auto-installation; required runtime and test packages are explicitly pinned. Native driver loading, build, tests and clean-install validation passed; evidence is recorded in [implementation status](../analysis/implementation-status.md).

Explorer preparation references checked:

- https://docs.etherscan.io/contract-verification/verify-with-foundry — existing-address verification and explicit V2 `https://api.etherscan.io/v2/api?chainid=11155111` endpoint.
- https://docs.blockscout.com/devs/verification/foundry-verification — explicit Blockscout verifier and configurable API endpoint. Instance-specific support/authentication must be confirmed by the later operator.
- Pinned `forge verify-contract --help` and offline `--show-standard-json-input` validated both command sets and compiler input, including Solidity 0.8.30, optimizer 200, Cancun and exact sources. No public RPC/key/explorer request was made. Foundry 1.1.0 predates newer built-in Etherscan defaults, so the V2 URL is explicit rather than relying on those defaults. Live endpoint compatibility is not claimed.
