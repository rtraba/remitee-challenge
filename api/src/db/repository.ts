import Database from 'better-sqlite3';
import { IntegrityError, type Identity, type Header, type Event, type EscrowRow } from '../types.js';
import { project } from '../indexer/projector.js';
const columns=`id,sender,beneficiary,token,amount,cancel_deadline AS cancelDeadline,expires_at AS expiresAt,recorded_state AS recordedState,creation_transaction_hash AS creationTransactionHash,creation_block_number AS creationBlockNumber,resolution_transaction_hash AS resolutionTransactionHash,resolution_block_number AS resolutionBlockNumber`;
export class Repository {
 readonly db:Database.Database;
 readonly schemaVersion=1;
 constructor(path:string,readonly identity:Identity) {
  this.db=new Database(path);this.db.pragma('foreign_keys=ON');this.db.pragma('journal_mode=WAL');
  try {
   const version=this.db.pragma('user_version',{simple:true});
   if(version!==0 && version!==1)throw new IntegrityError('Unsupported database schema');
   this.db.transaction(()=>{
    if(version===0)this.db.exec(`
     CREATE TABLE indexer_state(id INTEGER PRIMARY KEY CHECK(id=1),identity_json TEXT NOT NULL,last_processed_block INTEGER,last_processed_block_hash TEXT);
     CREATE TABLE indexed_blocks(block_number INTEGER PRIMARY KEY,block_hash TEXT NOT NULL UNIQUE,parent_hash TEXT NOT NULL,timestamp INTEGER NOT NULL);
     CREATE TABLE escrow_events(block_hash TEXT NOT NULL,log_index INTEGER NOT NULL,block_number INTEGER NOT NULL,transaction_hash TEXT NOT NULL,transaction_index INTEGER NOT NULL,escrow_id TEXT NOT NULL,event_name TEXT NOT NULL CHECK(event_name IN ('EscrowCreated','EscrowCancelled','EscrowReleased','EscrowRejected','EscrowExpired')),payload_json TEXT NOT NULL,PRIMARY KEY(block_hash,log_index),FOREIGN KEY(block_number) REFERENCES indexed_blocks(block_number));
     CREATE TABLE escrows(id TEXT PRIMARY KEY,sender TEXT NOT NULL,beneficiary TEXT NOT NULL,token TEXT NOT NULL,amount TEXT NOT NULL,cancel_deadline INTEGER NOT NULL,expires_at INTEGER NOT NULL,recorded_state TEXT NOT NULL CHECK(recorded_state IN ('Pending','CancelledBySender','Released','Rejected','Expired')),creation_transaction_hash TEXT NOT NULL,creation_block_number INTEGER NOT NULL,resolution_transaction_hash TEXT,resolution_block_number INTEGER);
     CREATE INDEX escrows_sender_idx ON escrows(sender);CREATE INDEX escrows_beneficiary_idx ON escrows(beneficiary);CREATE INDEX escrows_state_expiry_idx ON escrows(recorded_state,expires_at);CREATE INDEX escrows_newest_idx ON escrows(length(id) DESC,id DESC);
     PRAGMA user_version=1;`);
    const saved=this.db.prepare('SELECT identity_json FROM indexer_state WHERE id=1').get() as {identity_json:string}|undefined;
    if(saved && saved.identity_json!==JSON.stringify(identity))throw new IntegrityError('Database deployment identity mismatch');
    if(!saved)this.db.prepare('INSERT INTO indexer_state VALUES(1,?,NULL,NULL)').run(JSON.stringify(identity));
   })();
  }catch(error){this.db.close();throw error;}
 }
 checkpoint():Header|null {
  return (this.db.prepare('SELECT block_number AS number,block_hash AS hash,parent_hash AS parentHash,timestamp FROM indexed_blocks WHERE block_number=(SELECT last_processed_block FROM indexer_state WHERE id=1)').get() as Header|undefined)??null;
 }
 commit(headers:Header[],events:Event[],beforeCommit?:()=>void) {
  this.db.transaction(()=>{
   for(const h of headers){
    const old=this.db.prepare('SELECT block_hash AS hash,parent_hash AS parentHash,timestamp FROM indexed_blocks WHERE block_number=?').get(h.number) as Omit<Header,'number'>|undefined;
    if(old && (old.hash!==h.hash||old.parentHash!==h.parentHash||old.timestamp!==h.timestamp))throw new IntegrityError('Conflicting stored header');
    if(!old)this.db.prepare('INSERT INTO indexed_blocks VALUES(?,?,?,?)').run(h.number,h.hash,h.parentHash,h.timestamp);
   }
   for(const event of events){
    const values=[event.blockHash,event.logIndex,event.blockNumber,event.transactionHash,event.transactionIndex,event.id,event.name,JSON.stringify(event.payload)];
    const inserted=this.db.prepare('INSERT INTO escrow_events VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(block_hash,log_index) DO NOTHING').run(...values);
    if(inserted.changes===0){
     const old=this.db.prepare('SELECT * FROM escrow_events WHERE block_hash=? AND log_index=?').get(event.blockHash,event.logIndex) as Record<string,unknown>;
     const keys=['block_hash','log_index','block_number','transaction_hash','transaction_index','escrow_id','event_name','payload_json'];
     if(keys.some((key,i)=>old[key]!==values[i]))throw new IntegrityError('Conflicting duplicate event');
    }else project(this.db,event);
   }
   const last=headers.at(-1), current=this.checkpoint();
   if(last && (!current || last.number>=current.number))this.db.prepare('UPDATE indexer_state SET last_processed_block=?,last_processed_block_hash=? WHERE id=1').run(last.number,last.hash);
   beforeCommit?.();
  })();
 }
 snapshot<T>(read:(header:Header|null)=>T):T { return this.db.transaction(()=>read(this.checkpoint()))(); }
 detail(id:string):EscrowRow|undefined {return this.db.prepare(`SELECT ${columns} FROM escrows WHERE id=?`).get(id) as EscrowRow|undefined;}
 list(filters:{sender?:string;beneficiary?:string;status?:string;cursor?:string;limit:number},timestamp:number):EscrowRow[] {
  const where:string[]=[], args:(string|number)[]=[];
  for(const key of ['sender','beneficiary'] as const)if(filters[key]){where.push(`${key}=?`);args.push(filters[key]!);}
  if(filters.status){where.push("(CASE WHEN recorded_state='Pending' AND expires_at<=? THEN 'Expired' ELSE recorded_state END)=?");args.push(timestamp,filters.status);}
  if(filters.cursor){where.push('(length(id)<length(?) OR (length(id)=length(?) AND id<?))');args.push(filters.cursor,filters.cursor,filters.cursor);}
  return this.db.prepare(`SELECT ${columns} FROM escrows ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY length(id) DESC,id DESC LIMIT ?`).all(...args,filters.limit+1) as EscrowRow[];
 }
 diagnostics(){
  return this.snapshot(()=>({schemaVersion:this.db.pragma('user_version',{simple:true}),journalEventCount:(this.db.prepare('SELECT count(*) AS n FROM escrow_events').get() as {n:number}).n,escrowCount:(this.db.prepare('SELECT count(*) AS n FROM escrows').get() as {n:number}).n,lastJournalEvent:this.db.prepare('SELECT block_hash AS blockHash,block_number AS blockNumber,log_index AS logIndex,transaction_hash AS transactionHash,escrow_id AS id,event_name AS name,(SELECT creation_transaction_hash FROM escrows WHERE id=escrow_id) AS creationTransactionHash,(SELECT resolution_transaction_hash FROM escrows WHERE id=escrow_id) AS resolutionTransactionHash FROM escrow_events ORDER BY block_number DESC,transaction_index DESC,log_index DESC LIMIT 1').get()??null}));
 }
 close(){this.db.close();}
}
