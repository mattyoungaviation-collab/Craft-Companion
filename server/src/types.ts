export type UserAccount = {
  id: string;
  craftWorldUserId: string;
  craftWorldUid?: string;
  walletAddress?: string;
  primaryWalletAddress?: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
};

export type ResourceAmount = { symbol: string; amount: number };
export type DynoSummary = {
  displayName: string;
  imageUrl?: string;
  rarity?: string;
  isOneOfOne?: boolean;
  production: ResourceAmount[];
  claimableResources: ResourceAmount[];
};
export type FactoryBoost = {
  source: 'factory' | 'consumable' | 'worker' | 'landPlot';
  id?: string;
  startTime: string;
  endTime: string;
  boostValue: number;
};
export type FactorySummary = {
  id: string;
  definitionId: string;
  landPlotId: string;
  landPlotName?: string;
  areaId: string;
  areaSymbol: string;
  landPlotPosition?: number;
  level: number;
  currentRunLevel?: number;
  startedAt?: string;
  claimedAt?: string;
  unclaimedUnitsBeforeCurrentRun?: number;
  activeBoosts: FactoryBoost[];
};
export type VaultSummary = { symbol: string; amount: number; capacity: number; isUnlocked: boolean; buildingUnlockLevel?: number };
export type WorkshopItem = { symbol: string; level: number };
export type ProficiencyItem = { symbol: string; collectedAmount: number; claimedLevel: number };
export type CurrencyBalance = { type: string; amount: number };
export type CraftworldHomeData = {
  profile: { uid?: string; displayName?: string; avatarUrl?: string; walletAddress?: string };
  account: { id: string; experiencePoints: number; power: number; powerLastRefill?: string; skillPoints: number; updatedAt?: string; lastUserActionAt?: string; walletAddress?: string };
  dynos: DynoSummary[];
  factories: FactorySummary[];
  inventory: ResourceAmount[];
  vaults: VaultSummary[];
  workshop: WorkshopItem[];
  proficiencies: ProficiencyItem[];
  currencies: CurrencyBalance[];
  lastSyncedAt: string;
};

export type CraftworldProfileBadge = {
  url?: string | null;
  description?: string | null;
  displayName?: string | null;
  infoUrl?: string | null;
};

export type CraftworldProfile = {
  uid: string;
  walletAddress?: string;
  avatarUrl?: string;
  displayName?: string;
  level?: number;
  badges: CraftworldProfileBadge[];
  lastSyncedAt: string;
};

export type CraftworldWallet = {
  address: string;
  type?: string | null;
  provider?: string | null;
  providerId?: string | null;
  primary: boolean;
};

export type AuthUserPayload = { id: string; username: string; craftWorldUserId: string; craftWorldUid?: string };
