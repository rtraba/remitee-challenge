import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  config,
  loadManifest,
  provider,
  buildIdentity,
  validateDeployment,
  type Manifest,
} from '../api/src/config.js';
import { publicCommand, type PublicMode } from './sepolia-commands.js';
import { run } from './common.js';
async function main() {
  const mode = process.argv[2] as PublicMode;
  if (!['dry-run', 'broadcast', 'etherscan', 'blockscout'].includes(mode))
    throw Error('Invalid public operation');
  const command = publicCommand(mode, process.env),
    c = config();
  if (c.network !== 'sepolia') throw Error('Explicit Sepolia profile required');
  const p = provider(c.rpcUrl);
  try {
    if (BigInt(await p.send('eth_chainId', [])) !== 11155111n)
      throw Error('Sepolia chain guard rejected RPC');
    await run('forge', ['build'], { cwd: 'contracts' });
    if (mode === 'dry-run' || mode === 'broadcast') {
      if (mode === 'broadcast' && existsSync(c.manifestPath))
        throw Error('Existing manifest: select a fresh explicit manifest path');
      await run('forge', command.args, { cwd: 'contracts', env: command.env });
      if (mode === 'dry-run') {
        console.log('Sepolia RPC simulation completed; no broadcast or manifest written.');
        return;
      }
      const broadcast = JSON.parse(
        readFileSync('contracts/broadcast/DeployEscrow.s.sol/11155111/run-latest.json', 'utf8'),
      );
      const tx = broadcast.transactions.find(
        (t: { contractName: string }) => t.contractName === 'Escrow',
      );
      if (!tx) throw Error('Missing broadcast transaction');
      const receipt = await p.getTransactionReceipt(tx.hash);
      if (!receipt?.contractAddress || receipt.status !== 1)
        throw Error('Deployment receipt failed');
      const genesis = await p.getBlock(0),
        block = await p.getBlock(receipt.blockNumber);
      if (!genesis?.hash || !block?.hash) throw Error('Missing deployment block');
      const m: Manifest = {
        schemaVersion: 1,
        network: 'sepolia',
        chainId: '11155111',
        genesisHash: genesis.hash.toLowerCase(),
        contractAddress: receipt.contractAddress.toLowerCase(),
        deploymentTransactionHash: receipt.hash.toLowerCase(),
        deploymentBlock: receipt.blockNumber,
        deploymentBlockHash: block.hash.toLowerCase(),
        ...buildIdentity(),
      };
      await validateDeployment(p, m);
      mkdirSync(dirname(c.manifestPath), { recursive: true });
      writeFileSync(c.manifestPath + '.tmp', JSON.stringify(m, null, 2) + '\n');
      renameSync(c.manifestPath + '.tmp', c.manifestPath);
      console.log(`Validated manifest written: ${c.manifestPath}`);
    } else {
      const m = loadManifest(c.manifestPath, 'sepolia');
      if (m.contractAddress !== process.env.TARGET_ADDRESS?.toLowerCase())
        throw Error('Target must match explicit selected manifest');
      await validateDeployment(p, m);
      const record = {
        verifier: mode,
        address: m.contractAddress,
        chainId: m.chainId,
        artifactHash: m.artifactHash,
        executedAt: new Date().toISOString(),
        success: false,
      };
      try {
        await run('forge', command.args, { cwd: 'contracts', env: command.env, quiet: true });
        record.success = true;
        console.log(`${mode} verification completed successfully`);
      } finally {
        writeFileSync(
          c.manifestPath + `.verification-${mode}.json`,
          JSON.stringify(record, null, 2) + '\n',
        );
      }
    }
  } finally {
    p.destroy();
  }
}
main().catch(() => {
  console.error(
    'Sepolia operation failed: check explicit profile/RPC/chain/account/manifest/target and explorer configuration. Public paths are opt-in and have not been live-validated by this project.',
  );
  process.exitCode = 1;
});
