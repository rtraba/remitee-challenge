# Reproducible toolchain

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

Public explorer command construction will also be checked against the pinned CLI and current official explorer guidance before that milestone. No public operation has been executed.

Installer note: npm 10.9.2 crashed resolving optional Vite 8 devtools peers with `Cannot read properties of null (reading 'edgesOut')`. Vite is explicitly pinned to compatible 6.4.4, with Vitest/coverage 4.1.11; the resolver still crashed. `.npmrc` uses `legacy-peer-deps=true` to skip optional peer auto-installation; required runtime and test packages are explicitly pinned. Native driver, build, test and clean-install validation remain required.
