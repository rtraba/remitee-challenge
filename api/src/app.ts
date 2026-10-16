import Fastify from 'fastify';
import {Repository} from './db/repository.js';import {Worker} from './indexer/worker.js';
import {health} from './health.js';import {present} from './lifecycle.js';import {address,uint256} from './validation.js';import {states} from './types.js';
export function createApp(repo:Repository,worker:Worker,options={rpcStale:30,workerStale:30},clock=()=>Date.now()/1000){
 const app=Fastify({logger:false});
 const error=(code:string,message:string)=>({error:{code,message}});
 const snapshot=()=>health(repo,worker,options,clock());
 const available=()=>['healthy','syncing'].includes(snapshot().status);
 app.setErrorHandler((_error,_request,reply)=>reply.code(500).send(error('INTERNAL_ERROR','Unexpected service error')));
 app.setNotFoundHandler((_request,reply)=>reply.code(404).send(error('ROUTE_NOT_FOUND','Route not found')));
 app.get('/health',(_request,reply)=>{const data=snapshot();return reply.code(['healthy','syncing'].includes(data.status)?200:503).send(data);});
 app.get<{Params:{id:string}}>('/escrows/:id',(request,reply)=>{
  let id:string;
  try{id=uint256(request.params.id);if(new URLSearchParams(request.url.split('?')[1]).size)throw Error('Unknown query parameters');}catch{return reply.code(400).send(error('INVALID_ARGUMENT','id must be a positive uint256 decimal string; no query parameters supported'));}
  if(!available())return reply.code(503).send(error('INDEXER_UNAVAILABLE','Indexed snapshot is unavailable'));
  return repo.snapshot(header=>{
   const row=repo.detail(id);if(!row)return reply.code(404).send(error('ESCROW_NOT_FOUND','Escrow absent from indexed snapshot'));
   return {...present(row,header!.timestamp),asOfBlock:header!.number,asOfTimestamp:header!.timestamp};
  });
 });
 app.get('/escrows',(request,reply)=>{
  const filters:{sender?:string;beneficiary?:string;status?:string;cursor?:string;limit:number}={limit:20};
  try {
   const query=new URLSearchParams(request.url.split('?')[1]);
   for(const [key,value] of query){
    if(!['sender','beneficiary','status','limit','cursor'].includes(key)||query.getAll(key).length!==1||value==='')throw Error('Invalid query');
    if(key==='sender'||key==='beneficiary')filters[key]=address(value);
    if(key==='status'){if(!states.includes(value as typeof states[number]))throw Error('Invalid status');filters.status=value;}
    if(key==='cursor')filters.cursor=uint256(value);
    if(key==='limit'){if(!/^[1-9][0-9]*$/.test(value)||value.length>3||Number(value)>100)throw Error('Invalid limit');filters.limit=Number(value);}
   }
  }catch{return reply.code(400).send(error('INVALID_ARGUMENT','Invalid query parameter'));}
  if(!available())return reply.code(503).send(error('INDEXER_UNAVAILABLE','Indexed snapshot is unavailable'));
  return repo.snapshot(header=>{
   const rows=repo.list(filters,header!.timestamp),more=rows.length>filters.limit,items=rows.slice(0,filters.limit).map(r=>present(r,header!.timestamp));
   return {items,nextCursor:more?items.at(-1)!.id:null,asOfBlock:header!.number,asOfTimestamp:header!.timestamp};
  });
 });
 return app;
}
