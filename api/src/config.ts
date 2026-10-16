import {readFileSync} from 'node:fs';
import {keccak256,toUtf8Bytes,JsonRpcProvider,Contract} from 'ethers';
import {artifact} from './chain/reader.js';import {address,hash,safeInteger} from './validation.js';import type {Identity} from './types.js';
export interface Manifest extends Omit<Identity,'confirmationDepth'> {schemaVersion:1;network:'local'|'sepolia';deploymentTransactionHash:string;artifactHash:string;abiHash:string;runtimeCodeHash:string;demoTokenAddress?:string;demoTokenTransactionHash?:string;demoTokenRuntimeCodeHash?:string}
export function buildIdentity(){const a=artifact();return {artifactHash:keccak256(toUtf8Bytes(JSON.stringify({abi:a.abi,bytecode:a.bytecode.object,runtime:a.deployedBytecode.object}))),abiHash:keccak256(toUtf8Bytes(JSON.stringify(a.abi))),runtimeCodeHash:keccak256(a.deployedBytecode.object)};}
export function parseManifest(value:unknown):Manifest {
 const m=value as Manifest;if(!m||m.schemaVersion!==1||!['local','sepolia'].includes(m.network)||m.chainId!==(m.network==='local'?'31337':'11155111'))throw Error('Invalid manifest profile');
 for(const key of ['genesisHash','deploymentBlockHash','deploymentTransactionHash','artifactHash','abiHash','runtimeCodeHash'] as const)hash(m[key]);
 safeInteger(m.deploymentBlock,'deployment block');address(m.contractAddress);
 if(m.contractAddress!==address(m.contractAddress))throw Error('Manifest addresses must be normalized');
 if(m.network==='local'){address(m.demoTokenAddress);hash(m.demoTokenTransactionHash);hash(m.demoTokenRuntimeCodeHash);}
 return m;
}
export function config(env:NodeJS.ProcessEnv=process.env){
 const network=env.NETWORK??'local';if(network!=='local'&&network!=='sepolia')throw Error('Unsupported network');
 const rpcUrl=network==='local'?(env.RPC_URL??'http://127.0.0.1:8545'):env.SEPOLIA_RPC_URL;
 if(!rpcUrl)throw Error('Selected RPC is required');const url=new URL(rpcUrl);if(!['http:','https:'].includes(url.protocol))throw Error('HTTP RPC required');
 const manifestPath=env.MANIFEST_PATH??`deployments/${network}.json`,dbPath=env.DB_PATH??`data/${network}.sqlite`;
 if(network==='sepolia'&&(manifestPath==='deployments/local.json'||dbPath==='data/local.sqlite'))throw Error('Separate Sepolia paths required');
 const number=(name:string,fallback:number,min=0)=>{const v=env[name]??String(fallback);if(!/^(0|[1-9][0-9]*)$/.test(v))throw Error(`Invalid ${name}`);const n=safeInteger(Number(v),name);if(n<min)throw Error(`Invalid ${name}`);return n;};
 return {network,rpcUrl,manifestPath,dbPath,port:number('PORT',3000,1),confirmationDepth:number('CONFIRMATION_DEPTH',network==='local'?0:2),rpcStale:number('RPC_STALE_AFTER_SECONDS',30,1),workerStale:number('WORKER_STALE_AFTER_SECONDS',30,1),apiUrl:env.API_URL??`http://127.0.0.1:${env.PORT??3000}`};
}
export function loadManifest(path:string,network:string){const m=parseManifest(JSON.parse(readFileSync(path,'utf8')));if(m.network!==network)throw Error('Manifest network mismatch');return m;}
export function provider(url:string){return new JsonRpcProvider(url,undefined,{polling:true,pollingInterval:1000,cacheTimeout:-1,batchMaxCount:1});}
export function sanitizedEndpoint(url:string){const u=new URL(url);return `${u.protocol}//${u.hostname}${u.port?':'+u.port:''}`;}
export async function validateDeployment(p:JsonRpcProvider,m:Manifest){
 if(BigInt(await p.send('eth_chainId',[])).toString()!==m.chainId)throw Error('RPC chain mismatch');
 const genesis=await p.getBlock(0),block=await p.getBlock(m.deploymentBlock),receipt=await p.getTransactionReceipt(m.deploymentTransactionHash);
 if(genesis?.hash?.toLowerCase()!==m.genesisHash||block?.hash?.toLowerCase()!==m.deploymentBlockHash)throw Error('Deployment history mismatch');
 if(!receipt||receipt.status!==1||receipt.blockNumber!==m.deploymentBlock||receipt.blockHash.toLowerCase()!==m.deploymentBlockHash||receipt.contractAddress?.toLowerCase()!==m.contractAddress)throw Error('Deployment receipt mismatch');
 const build=buildIdentity();if(build.artifactHash!==m.artifactHash||build.abiHash!==m.abiHash||build.runtimeCodeHash!==m.runtimeCodeHash)throw Error('Artifact identity mismatch');
 const code=await p.getCode(m.contractAddress);if(code==='0x'||keccak256(code)!==m.runtimeCodeHash)throw Error('Runtime code mismatch');
 const contract=new Contract(m.contractAddress,artifact().abi,p);if(await contract.CANCEL_WINDOW()!==7200n||await contract.TTL()!==604800n)throw Error('Contract interface mismatch');
 if(m.network==='local'){
  const token=await p.getCode(m.demoTokenAddress!),receipt=await p.getTransactionReceipt(m.demoTokenTransactionHash!);
  if(token==='0x'||keccak256(token)!==m.demoTokenRuntimeCodeHash||receipt?.status!==1||receipt.contractAddress?.toLowerCase()!==m.demoTokenAddress)throw Error('Local token identity mismatch');
 }
}
