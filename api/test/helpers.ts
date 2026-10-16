import type {Identity,Header,Event,Chain} from '../src/types.js';
export const h=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
export const sender='0x'+'11'.repeat(20), beneficiary='0x'+'22'.repeat(20),token='0x'+'33'.repeat(20);
export const identity:Identity={chainId:'31337',genesisHash:h(0),contractAddress:'0x'+'44'.repeat(20),deploymentBlock:1,deploymentBlockHash:h(1),confirmationDepth:0};
export const header=(number:number,timestamp=1000+number):Header=>({number,hash:h(number),parentHash:h(number-1),timestamp});
export const created=(id='1',blockNumber=1,logIndex=0):Event=>({id,blockHash:h(blockNumber),blockNumber,logIndex,transactionHash:h(100+blockNumber),transactionIndex:0,name:'EscrowCreated',payload:{sender,beneficiary,token,amount:'100000000000000000000000',cancelDeadline:8200,expiresAt:605800}});
export const resolved=(name='EscrowReleased',id='1',blockNumber=2,logIndex=0):Event=>({...created(id,blockNumber,logIndex),name,payload:{}});
export class FakeChain implements Chain {
 height=3; events:Event[]=[created(),resolved()];headers=new Map<number,Header>();listeners=new Set<()=>void>();fail=false;reads:number[]=[];
 async head(){if(this.fail)throw Error('offline');return this.height;}
 async header(n:number){this.reads.push(n);return this.headers.get(n)??header(n);}
 async logs(from:number,to:number){return this.events.filter(e=>e.blockNumber>=from&&e.blockNumber<=to);}
 async identity(){if(this.fail)throw Error('offline');const {confirmationDepth,...rest}=identity;return rest;}
 async listen(fn:()=>void){this.listeners.add(fn);}async unlisten(fn:()=>void){this.listeners.delete(fn);}
}
