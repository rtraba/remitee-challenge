import { JsonRpcProvider, Interface } from 'ethers';
import { readFileSync } from 'node:fs';
import { address, hash, safeInteger, uint256 } from '../validation.js';
import { IntegrityError, type Chain, type Identity, type Header, type Event } from '../types.js';
export function artifact(){return JSON.parse(readFileSync('contracts/out/Escrow.sol/Escrow.json','utf8'));}
export class Reader implements Chain {
 readonly abi=new Interface(artifact().abi);
 constructor(readonly provider:JsonRpcProvider,readonly deployment:Omit<Identity,'confirmationDepth'>){}
 async head(){return safeInteger(Number(await this.provider.send('eth_blockNumber',[])),'head');}
 async header(n:number):Promise<Header>{
  const b=await this.provider.getBlock(n);if(!b?.hash)throw new Error('Missing block');
  return {number:safeInteger(b.number,'block'),hash:hash(b.hash),parentHash:hash(b.parentHash),timestamp:safeInteger(b.timestamp,'timestamp')};
 }
 async identity(){
  const chainId=BigInt(await this.provider.send('eth_chainId',[])).toString();
  const genesis=await this.header(0),deployment=await this.header(this.deployment.deploymentBlock);
  if(await this.provider.getCode(this.deployment.contractAddress)==='0x')throw new IntegrityError('Missing contract code');
  return {...this.deployment,chainId,genesisHash:genesis.hash,deploymentBlockHash:deployment.hash};
 }
 async logs(from:number,to:number):Promise<Event[]>{
  const topics=['EscrowCreated','EscrowCancelled','EscrowReleased','EscrowRejected','EscrowExpired'].map(n=>this.abi.getEvent(n)!.topicHash);
  const logs=await this.provider.getLogs({address:this.deployment.contractAddress,fromBlock:from,toBlock:to,topics:[topics]});
  return logs.map(log=>{
   if(log.removed || address(log.address)!==this.deployment.contractAddress)throw new IntegrityError('Invalid log identity');
   const decoded=this.abi.parseLog(log);if(!decoded)throw new IntegrityError('Undecodable event');
   const payload:Record<string,string|number>={};
   if(decoded.name==='EscrowCreated'){
    for(const key of ['sender','beneficiary','token'])payload[key]=address(decoded.args[key]);
    payload.amount=uint256(decoded.args.amount.toString());
    for(const key of ['cancelDeadline','expiresAt'])payload[key]=safeInteger(Number(decoded.args[key]),key);
   }
   return {blockHash:hash(log.blockHash),blockNumber:safeInteger(log.blockNumber,'block'),logIndex:safeInteger(log.index,'log index'),transactionHash:hash(log.transactionHash),transactionIndex:safeInteger(log.transactionIndex,'transaction index'),id:uint256(decoded.args.id.toString()),name:decoded.name,payload};
  });
 }
 async listen(fn:()=>void){await this.provider.on('block',fn);}
 async unlisten(fn:()=>void){await this.provider.off('block',fn);}
}
