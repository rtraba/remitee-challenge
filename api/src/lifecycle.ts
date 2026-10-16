import type {EscrowRow} from './types.js';
export function present(row:EscrowRow,timestamp:number){
 const pending=row.recordedState==='Pending',expired=timestamp>=row.expiresAt;
 const {creationBlockNumber,resolutionBlockNumber,...data}=row;
 return {...data,status:pending&&expired?'Expired':row.recordedState,recoverable:pending&&expired,canCancel:pending&&timestamp<row.cancelDeadline,canConfirm:pending&&!expired,canReject:pending&&!expired};
}
