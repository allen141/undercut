import { GOODS, TOWNS, type GoodId, type Town } from './catalog.js';
import { identifierSeed, randomInt, seededRandom } from './random.js';

export const MAX_VENDOR_VISITS = 2;
export const REPUTATION_TIERS = [
  { threshold: 0, discount: 0 },
  { threshold: 30, discount: 0.08 },
  { threshold: 75, discount: 0.15 },
] as const;

const ARCHETYPES = {
  bargain: { priceMultiplier: 0.85, regularStock: [4, 8], dealStock: [1, 3], dealDiscount: 0.25 },
  generalist: { priceMultiplier: 1.1, regularStock: [5, 10], dealStock: [1, 3], dealDiscount: 0.18 },
  specialist: { priceMultiplier: 0.95, regularStock: [8, 13], dealStock: [2, 4], dealDiscount: 0.20 },
} as const;
const IMPORT_MULTIPLIER = 1.2;
const REPUTATION_DEAL_TIER = 1;
const REPUTATION_DEAL_DISCOUNT = 0.35;

export type Vendor = {
  id: string;
  name: string;
  townId: Town['id'];
  archetype: keyof typeof ARCHETYPES;
  goods: readonly GoodId[];
};

export const VENDORS: readonly Vendor[] = [
  { id: 'meadow-bargain', name: 'Mill Yard', townId: 'meadow', archetype: 'bargain', goods: ['grain', 'herbs'] },
  { id: 'meadow-generalist', name: 'Meadow Supply', townId: 'meadow', archetype: 'generalist', goods: ['grain', 'cloth', 'tea', 'iron'] },
  { id: 'meadow-specialist', name: 'Greenbank Growers', townId: 'meadow', archetype: 'specialist', goods: ['herbs', 'grain'] },
  { id: 'forge-bargain', name: 'Foundry Surplus', townId: 'forge', archetype: 'bargain', goods: ['iron', 'grain'] },
  { id: 'forge-generalist', name: 'Forge Supply', townId: 'forge', archetype: 'generalist', goods: ['grain', 'cloth', 'herbs', 'tea'] },
  { id: 'forge-specialist', name: 'Ember Works', townId: 'forge', archetype: 'specialist', goods: ['iron', 'crystal'] },
  { id: 'harbor-bargain', name: 'Dockside Lots', townId: 'harbor', archetype: 'bargain', goods: ['cloth', 'tea'] },
  { id: 'harbor-generalist', name: 'Harbor Supply', townId: 'harbor', archetype: 'generalist', goods: ['herbs', 'grain', 'crystal', 'iron'] },
  { id: 'harbor-specialist', name: 'Tideway Imports', townId: 'harbor', archetype: 'specialist', goods: ['tea', 'cloth'] },
];

export type VendorReputation = { spent: number; tier: number };
export type VendorOffer = {
  id: string;
  goodId: GoodId;
  unitCost: number;
  quantity: number;
  kind: 'regular' | 'dailyDeal' | 'reputationDeal';
  requiredTier?: number;
};

export function vendorsInTown(townId: string | null): Vendor[] {
  return VENDORS.filter((vendor) => vendor.townId === townId);
}

export function reputationFor(state: { vendorReputation: Record<string, VendorReputation> }, vendorId: string): VendorReputation {
  return Object.hasOwn(state.vendorReputation, vendorId)
    ? state.vendorReputation[vendorId]
    : { spent: 0, tier: 0 };
}

export function tierForSpend(spent: number) {
  return REPUTATION_TIERS.filter(({ threshold }) => spent >= threshold).length - 1;
}

export function offersForVendor(seed: number, day: number, vendor: Vendor, tier: number): VendorOffer[] {
  const town = TOWNS.find((candidate) => candidate.id === vendor.townId)!;
  const tuning = ARCHETYPES[vendor.archetype];
  const vendorSeed = seed ^ identifierSeed(vendor.id);
  const random = seededRandom(vendorSeed ^ Math.imul(day, 2654435761));
  const rotation = seededRandom(vendorSeed);
  const firstDealIndex = randomInt(rotation, 0, vendor.goods.length - 1);
  const dealIndex = (firstDealIndex + day - 1) % vendor.goods.length;
  const dealGood = vendor.goods[dealIndex];
  const reputationGood = vendor.goods[(dealIndex + 1) % vendor.goods.length];

  const costs = vendor.goods.map((goodId) => {
    const base = (town.supply as Partial<Record<GoodId, number>>)[goodId]
      ?? GOODS.find((good) => good.id === goodId)!.base * IMPORT_MULTIPLIER;
    return Math.max(1, Math.round(base * tuning.priceMultiplier) + randomInt(random, 0, 1));
  });
  const reputationDiscount = REPUTATION_TIERS[tier].discount;
  const offer = (
    goodId: GoodId,
    kind: VendorOffer['kind'],
    stock: readonly [number, number],
    discount = 0,
  ): VendorOffer => {
    const regularCost = costs[vendor.goods.indexOf(goodId)];
    const regularPrice = Math.max(1, Math.floor(regularCost * (1 - reputationDiscount)));
    const discountedPrice = Math.floor(regularCost * (1 - discount) * (1 - reputationDiscount));
    return {
      id: `${vendor.id}:${kind}:${goodId}`,
      goodId,
      unitCost: discount ? Math.max(1, Math.min(regularPrice - 1, discountedPrice)) : regularPrice,
      quantity: randomInt(random, ...stock),
      kind,
    };
  };

  return [
    ...vendor.goods.map((goodId) => offer(goodId, 'regular', tuning.regularStock)),
    offer(dealGood, 'dailyDeal', tuning.dealStock, tuning.dealDiscount),
    {
      ...offer(reputationGood, 'reputationDeal', tuning.dealStock, REPUTATION_DEAL_DISCOUNT),
      requiredTier: REPUTATION_DEAL_TIER,
    },
  ];
}
