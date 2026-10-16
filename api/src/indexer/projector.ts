import type { Database } from 'better-sqlite3';
import { IntegrityError, type Event } from '../types.js';
import { address, safeInteger, uint256 } from '../validation.js';
export const terminalEvents:Record<string,string> = {EscrowCancelled:'CancelledBySender',EscrowReleased:'Released',EscrowRejected:'Rejected',EscrowExpired:'Expired'};
export function project(db:Database,event:Event) {
 const p=event.payload;
 if(event.name==='EscrowCreated') {
  const cancel=safeInteger(p.cancelDeadline,'deadline'), expiry=safeInteger(p.expiresAt,'expiry');
  if(expiry<=cancel || address(p.sender)===address(p.beneficiary) || /^0x0{40}$/.test(address(p.sender)) || /^0x0{40}$/.test(address(p.beneficiary))) throw new IntegrityError('Invalid creation');
  db.prepare('INSERT INTO escrows VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL)').run(uint256(event.id),address(p.sender),address(p.beneficiary),address(p.token),uint256(p.amount),cancel,expiry,'Pending',event.transactionHash,event.blockNumber);
 } else {
  const state=terminalEvents[event.name]; if(!state)throw new IntegrityError('Unknown event');
  const result=db.prepare("UPDATE escrows SET recorded_state=?, resolution_transaction_hash=?,resolution_block_number=? WHERE id=? AND recorded_state='Pending'").run(state,event.transactionHash,event.blockNumber,event.id);
  if(result.changes!==1)throw new IntegrityError('Impossible escrow transition');
 }
}
