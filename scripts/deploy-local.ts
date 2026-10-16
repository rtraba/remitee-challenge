import { deployLocal } from './deploy.js';
deployLocal()
  .then((m) => console.log(`Local deployment validated at ${m.contractAddress}`))
  .catch(() => {
    console.error(
      'Local deployment failed; check local chain, fresh manifest path and Forge output.',
    );
    process.exitCode = 1;
  });
