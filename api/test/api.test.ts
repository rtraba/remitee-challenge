import {test,expect} from 'vitest';import {Repository} from '../src/db/repository.js';import {Worker} from '../src/indexer/worker.js';import {createApp} from '../src/app.js';import {health} from '../src/health.js';
import {identity,FakeChain,created,resolved,header,sender,beneficiary} from './helpers.js';
async function fixture(){const repo=new Repository(':memory:',identity),chain=new FakeChain();chain.events=[];let now=100;const worker=new Worker(repo,chain,()=>now);await worker.start();const app=createApp(repo,worker,{rpcStale:30,workerStale:30},()=>now);return {repo,chain,worker,app,time:(n:number)=>now=n,close:async()=>{await app.close();await worker.stop();repo.close();}};}
test('HTTP detail/list, numeric uint256 pagination, effective SQL filters and strict validation',async()=>{
 const f=await fixture();try{
  const ids=['1','2','9','10','184467440737095516160',((1n<<256n)-1n).toString()];
  f.repo.commit([header(4,8200)],ids.map((id,i)=>created(id,4,i)));
  let res=await f.app.inject('/escrows?limit=2');expect(res.statusCode).toBe(200);expect(res.json().items.map((x:{id:string})=>x.id)).toEqual(ids.slice(-2).reverse());expect(res.json().nextCursor).toBe(ids.at(-2));
  res=await f.app.inject('/escrows?limit=2&cursor='+res.json().nextCursor);expect(res.json().items.map((x:{id:string})=>x.id)).toEqual(['10','9']);
  const d=(await f.app.inject('/escrows/1')).json();expect(d).toMatchObject({recordedState:'Pending',status:'Pending',amount:'100000000000000000000000',canCancel:false,canConfirm:true,asOfTimestamp:8200});
  f.repo.commit([header(5,605800)],[resolved('EscrowCancelled','2',5)]);
  res=await f.app.inject(`/escrows?status=Expired&sender=${sender}&beneficiary=${beneficiary}&limit=100`);expect(res.json().items).toHaveLength(5);expect(res.json().items.every((x:{recoverable:boolean})=>x.recoverable)).toBe(true);
  expect((await f.app.inject('/escrows?status=Pending')).json().items).toEqual([]);
  expect((await f.app.inject('/escrows?status=CancelledBySender')).json().items[0]).toMatchObject({id:'2',canCancel:false,canConfirm:false,recoverable:false});
  expect((await f.app.inject('/escrows/1')).json()).toMatchObject({status:'Expired',recordedState:'Pending',recoverable:true,resolutionTransactionHash:null});
  expect((await f.app.inject('/escrows/3')).statusCode).toBe(404);
  for(const url of ['/escrows/0','/escrows/01','/escrows/-1','/escrows/1e2','/escrows/'+(1n<<256n),'/escrows/1?x=1','/escrows?x=1','/escrows?sender=bad','/escrows?sender=','/escrows?limit=0','/escrows?limit=101','/escrows?limit=01','/escrows?limit=1&limit=2','/escrows?status=expired','/escrows?cursor=01','/escrows?cursor=','/escrows?status='])expect((await f.app.inject(url)).statusCode,url).toBe(400);
  expect((await f.app.inject('/absent')).json()).toMatchObject({error:{code:'ROUTE_NOT_FOUND'}});
 }finally{await f.close();}
});
test('all lifecycle boundaries and terminal precedence at consistent indexed timestamps',async()=>{
 const f=await fixture();try{
  for(const [i,ts] of [8199,8200,8201,605799,605800,605801].entries()){
   const n=4+i;f.repo.commit([header(n,ts)],i===0?[created('1',n)]:[]);
   expect((await f.app.inject('/escrows/1')).json()).toMatchObject({canCancel:ts<8200,canConfirm:ts<605800,canReject:ts<605800,recoverable:ts>=605800,asOfTimestamp:ts,asOfBlock:n});
  }
  f.repo.commit([header(10,605802)],[resolved('EscrowExpired','1',10)]);expect((await f.app.inject('/escrows/1')).json()).toMatchObject({recordedState:'Expired',recoverable:false,status:'Expired'});
 }finally{await f.close();}
});
test('health distinguishes RPC freshness, stopped/stale worker, schema and latched integrity',async()=>{
 const f=await fixture();try{
  expect((await f.app.inject('/health')).statusCode).toBe(200);expect((await f.app.inject('/escrows')).json().items).toEqual([]);
  f.time(131);expect((await f.app.inject('/health')).json()).toMatchObject({reason:'RPC_STALE'});expect((await f.app.inject('/escrows')).statusCode).toBe(503);
  await f.worker.request();expect((await f.app.inject('/health')).statusCode).toBe(200);
  f.worker.lastCycleCompletedAt=0;f.worker.lastProgressAt=0;expect((await f.app.inject('/health')).json().reason).toBe('WORKER_STALE');
  f.worker.lastProgressAt=131;expect((await f.app.inject('/health')).statusCode).toBe(200);
  f.worker.latestObservedBlock=10;expect((await f.app.inject('/health')).json()).toMatchObject({status:'syncing',indexingLag:7});
  f.repo.db.pragma('user_version=2');expect((await f.app.inject('/health')).json().reason).toBe('DATABASE_SCHEMA');f.repo.db.pragma('user_version=1');
  f.worker.integrityError='CHAIN_OR_PROJECTION_INTEGRITY';expect((await f.app.inject('/health')).json().status).toBe('reorg_detected');expect((await f.app.inject('/escrows/1')).statusCode).toBe(503);
  f.worker.integrityError=null;await f.worker.stop();expect((await f.app.inject('/health')).json().reason).toBe('WORKER_STOPPED');
 }finally{await f.close();}
});
test('no usable initial snapshot returns 503 even with fresh RPC and live worker',async()=>{
 const r=new Repository(':memory:',{...identity,confirmationDepth:10}),c=new FakeChain(),w=new Worker(r,c,()=>100);await w.start();const app=createApp(r,w,undefined,()=>100);
 try{expect((await app.inject('/health')).json()).toMatchObject({status:'initializing',lastIndexedBlock:null,eligibleBlock:null});expect((await app.inject('/escrows')).statusCode).toBe(503);}finally{await app.close();await w.stop();r.close();}
});
test('internal errors are sanitized and idle chain age is independent of health',async()=>{
 const f=await fixture();try{f.time(10000);await f.worker.request();expect(health(f.repo,f.worker,{rpcStale:30,workerStale:30},10000).status).toBe('healthy');
 f.repo.list=()=>{throw Error('secret SQL rpc://password');};const response=await f.app.inject('/escrows');expect(response.statusCode).toBe(500);expect(response.body).not.toContain('password');
 }finally{await f.close();}
});
