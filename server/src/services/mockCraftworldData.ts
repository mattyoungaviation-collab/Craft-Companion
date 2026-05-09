import { CraftworldHomeData } from '../types.js';

export function getMockCraftworldHomeData(): CraftworldHomeData {
  return {
    profile: {},
    account: {
      id: '',
      experiencePoints: 0,
      power: 0,
      skillPoints: 0,
    },
    dynos: [],
    factories: [],
    inventory: [],
    vaults: [],
    workshop: [],
    proficiencies: [],
    currencies: [],
    lastSyncedAt: new Date().toISOString(),
  };
}
