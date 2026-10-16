import {spawn,type ChildProcess} from 'node:child_process';import net from 'node:net';import {existsSync} from 'node:fs';
import {config,provider} from '../api/src/config.js';import {deployLocal} from './deploy.js';import {diagnose} from './healthcheck.js';import {run,until,delay} from './common.js';
async function available(port:number){await new Promise<void>((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(()=>resolve()));});}
async function main(){
 const c=config();if(c.network!=='local')throw Error('Local profile required');
 const rpc=new URL(c.rpcUrl);if(rpc.hostname!=='127.0.0.1')throw Error('Local supervisor requires loopback RPC');
 if(existsSync(c.dbPath)||existsSync(c.manifestPath))throw Error('Existing data/manifest: select fresh DB_PATH and MANIFEST_PATH or use api:start to resume existing node');
 await available(Number(rpc.port||80));await available(c.port);await run('npm',['run','build']);
 const children:ChildProcess[]=[];let stopping=false;let cleaned:Promise<void>|undefined;
 const cleanup=()=>cleaned??=(async()=>{stopping=true;for(const child of [...children].reverse()){if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(5000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}}})();
 process.once('SIGINT',()=>void cleanup());process.once('SIGTERM',()=>void cleanup());
 try{
  const anvil=spawn('anvil',['--host','127.0.0.1','--port',rpc.port||'8545','--chain-id','31337','--silent'],{stdio:'inherit'});children.push(anvil);
  const p=provider(c.rpcUrl);try{await until(async()=>{try{return await p.send('eth_chainId',[]);}catch{return null;}},x=>x==='0x7a69');}finally{p.destroy();}
  if(stopping)return;await deployLocal();if(stopping)return;
  const api=spawn(process.execPath,['--import','tsx','api/src/main.ts'],{stdio:'inherit',env:process.env});children.push(api);
  await until(async()=>diagnose(500),r=>r.ok);if(stopping)return;
  console.log('Local system ready. Commands: npm run healthcheck | npm run smoke | npm run demo. Stop: Ctrl-C.');
  await Promise.race(children.map(child=>new Promise<void>(resolve=>child.once('exit',code=>{if(!stopping&&code!==0)process.exitCode=1;resolve();}))));
 }finally{await cleanup();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
