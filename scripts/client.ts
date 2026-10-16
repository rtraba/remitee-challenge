import assert from 'node:assert/strict';import {Contract,HDNodeWallet,NonceManager,Interface,type TransactionReceipt} from 'ethers';
import {config,loadManifest,provider,validateDeployment} from '../api/src/config.js';import {artifact} from '../api/src/chain/reader.js';import {until} from './common.js';
const fixtureMnemonic='test test test test test test test test test test test junk';
const tokenAbi=['function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)'];
export async function localClient(mode:'smoke'|'demo'){
 const c=config();if(c.network!=='local')throw Error('LOCAL_ONLY');const p=provider(c.rpcUrl);
 try{
  if(BigInt(await p.send('eth_chainId',[]))!==31337n)throw Error('LOCAL_ONLY');
  const m=loadManifest(c.manifestPath,'local');await validateDeployment(p,m);
  const sender=HDNodeWallet.fromPhrase(fixtureMnemonic,undefined,"m/44'/60'/0'/0/0").connect(p),beneficiary=HDNodeWallet.fromPhrase(fixtureMnemonic,undefined,"m/44'/60'/0'/0/1").connect(p);
  const s=new NonceManager(sender),b=new NonceManager(beneficiary),escrow=new Contract(m.contractAddress,artifact().abi,s),recipient=new Contract(m.contractAddress,artifact().abi,b),token=new Contract(m.demoTokenAddress!,tokenAbi,s),abi=new Interface(artifact().abi);
  async function detail(id:string){const res=await fetch(c.apiUrl+'/escrows/'+id);return res.ok?await res.json():null;}
  async function observed(receipt:TransactionReceipt,id:string,state:string){
   const row:any=await until(async()=>{const r:any=await detail(id);return r?.recordedState===state&&r.asOfBlock>=receipt.blockNumber?r:null;},r=>r!==null);
   assert.equal(state==='Pending'?row.creationTransactionHash:row.resolutionTransactionHash,receipt.hash.toLowerCase());
   const health:any=await(await fetch(c.apiUrl+'/health')).json();assert.equal(health.lastJournalEvent.transactionHash,receipt.hash.toLowerCase());assert.equal(health.lastJournalEvent.blockHash,receipt.blockHash.toLowerCase());assert.equal(health.lastJournalEvent.blockNumber,receipt.blockNumber);
   return row;
  }
  async function create(){await(await token.approve(m.contractAddress,100n)).wait();const receipt=await(await escrow.createEscrow(m.demoTokenAddress,beneficiary.address,100n)).wait() as TransactionReceipt;
   const event=receipt.logs.map(log=>{try{return abi.parseLog(log);}catch{return null;}}).find(x=>x?.name==='EscrowCreated');assert(event);const id=event.args.id.toString(),row=await observed(receipt,id,'Pending');assert.equal(row.amount,'100');assert.equal(row.canCancel,true);assert.equal(row.canConfirm,true);assert.equal(row.canReject,true);return {id,row};
  }
  async function resolve(id:string,action:string,state:string,to:string){const before:bigint=await token.balanceOf(to);const contract=action==='confirmEscrow'||action==='rejectEscrow'?recipient:escrow;
   const receipt=await(await contract[action](id)).wait() as TransactionReceipt;const row=await observed(receipt,id,state);assert.equal(await token.balanceOf(to),before+100n);assert.equal(row.recoverable,false);assert.equal(row.canCancel,false);assert.equal(row.canConfirm,false);assert.equal(row.canReject,false);return row;
  }
  const balanceBefore:bigint=await token.balanceOf(m.contractAddress);const cancel=await create();await resolve(cancel.id,'cancelEscrow','CancelledBySender',sender.address);
  if(mode==='demo'){
   const release=await create();await resolve(release.id,'confirmEscrow','Released',beneficiary.address);
   const reject=await create();await resolve(reject.id,'rejectEscrow','Rejected',sender.address);
   const expired=await create();await p.send('evm_setNextBlockTimestamp',[expired.row.expiresAt]);await p.send('evm_mine',[]);
   const row:any=await until(()=>detail(expired.id),(r:any)=>r?.status==='Expired'&&r.recoverable===true);assert.equal(row.recordedState,'Pending');assert.equal(row.resolutionTransactionHash,null);assert.equal(row.canConfirm,false);
   await resolve(expired.id,'recoverExpired','Expired',sender.address);
   const list:any=await(await fetch(c.apiUrl+'/escrows?limit=100')).json();for(const id of [cancel.id,release.id,reject.id,expired.id])assert(list.items.some((x:{id:string})=>x.id===id));
  }
  assert.equal(await token.balanceOf(m.contractAddress),balanceBefore);console.log(`${mode.toUpperCase()} PASS: receipt/block hashes, journal, projection, API state and payouts independently asserted`);
 }finally{p.destroy();}
}
