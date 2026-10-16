import {test,expect,vi} from 'vitest';import {JsonRpcProvider} from 'ethers';import {Reader,artifact} from '../src/chain/reader.js';import {identity,header,h,sender,beneficiary,token} from './helpers.js';
test('HTTP reader validates identity, decodes all generated-ABI events and releases listener',async()=>{
 let logs:unknown[]=[],code='0x1234';const provider={send:vi.fn(async(method:string)=>method==='eth_chainId'?'0x7a69':'0x3'),getBlock:vi.fn(async(n:number)=>header(n)),getCode:vi.fn(async()=>code),getLogs:vi.fn(async()=>logs),on:vi.fn(),off:vi.fn()};
 const reader=new Reader(provider as unknown as JsonRpcProvider,identity);expect(artifact().abi.length).toBeGreaterThan(0);expect(await reader.head()).toBe(3);expect(await reader.identity()).toMatchObject({chainId:'31337',deploymentBlockHash:h(1)});
 const names=['EscrowCreated','EscrowCancelled','EscrowReleased','EscrowRejected','EscrowExpired'];
 logs=names.map((name,i)=>{const encoded=reader.abi.encodeEventLog(reader.abi.getEvent(name)!,i?[1n]:[1n,sender,beneficiary,token,2n**200n,8200n,605800n]);return {...encoded,blockHash:h(1),blockNumber:1,index:i,transactionIndex:0,transactionHash:h(100),address:identity.contractAddress,removed:false};});
 expect((await reader.logs(1,3)).map(e=>e.name)).toEqual(names);expect((await reader.logs(1,3))[0].payload.amount).toBe((2n**200n).toString());
 expect(provider.getLogs).toHaveBeenCalledWith(expect.objectContaining({address:identity.contractAddress,fromBlock:1,toBlock:3}));
 const fn=()=>{};await reader.listen(fn);await reader.unlisten(fn);expect(provider.off).toHaveBeenCalledWith('block',fn);
 logs=[{...(logs[0] as object),removed:true}];await expect(reader.logs(1,3)).rejects.toThrow('Invalid log');
 logs=[{...(logs[0] as object),removed:false,address:sender}];await expect(reader.logs(1,3)).rejects.toThrow('Invalid log');
 logs=[{...(logs[0] as object),address:identity.contractAddress,topics:[h(999)]}];await expect(reader.logs(1,3)).rejects.toThrow('Undecodable');
 code='0x';await expect(reader.identity()).rejects.toThrow('Missing contract');
 provider.getBlock=vi.fn(async()=>null) as unknown as typeof provider.getBlock;await expect(reader.header(1)).rejects.toThrow('Missing block');
});
