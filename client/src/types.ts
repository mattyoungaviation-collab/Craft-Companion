export * from '../../server/src/types';

export type Me = {
  id: string;
  craftWorldUserId: string;
  craftWorldUid?: string;
  craftWorldFirebaseUserId?: string;
  craftWorldAccountId?: string;
  walletAddress?: string;
  primaryWalletAddress?: string;
  username: string;
  createdAt: string;
  lastLoginAt?: string;
};
