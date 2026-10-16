export const states = ['Pending', 'CancelledBySender', 'Released', 'Rejected', 'Expired'] as const;
export type State = (typeof states)[number];
export interface Identity {
  chainId: string;
  genesisHash: string;
  contractAddress: string;
  deploymentBlock: number;
  deploymentBlockHash: string;
  confirmationDepth: number;
}
export interface Header {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
}
export interface Event {
  blockHash: string;
  logIndex: number;
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  id: string;
  name: string;
  payload: Record<string, string | number>;
}
export interface EscrowRow {
  id: string;
  sender: string;
  beneficiary: string;
  token: string;
  amount: string;
  cancelDeadline: number;
  expiresAt: number;
  recordedState: State;
  creationTransactionHash: string;
  creationBlockNumber: number;
  resolutionTransactionHash: string | null;
  resolutionBlockNumber: number | null;
}
export interface Chain {
  head(): Promise<number>;
  header(n: number): Promise<Header>;
  logs(from: number, to: number): Promise<Event[]>;
  identity(): Promise<Omit<Identity, 'confirmationDepth'>>;
  listen(fn: () => void): Promise<void>;
  unlisten(fn: () => void): Promise<void>;
}
export class IntegrityError extends Error {}
export class RangeChangedError extends Error {}
