import type { Command, NegotiationOutcome } from '@undercut/contracts';
import { GOODS, TOWNS, priceRange, type GoodId, type Town } from './catalog.js';
import {
  MAX_VENDOR_VISITS, offersForVendor, reputationFor, tierForSpend, vendorsInTown,
  type VendorOffer, type VendorReputation,
} from './market.js';
import { randomInt, seededRandom } from './random.js';

export { GOODS, TOWNS, priceRange, type GoodId, type Town } from './catalog.js';
export {
  MAX_VENDOR_VISITS, REPUTATION_TIERS, VENDORS, reputationFor, vendorsInTown,
  type Vendor, type VendorOffer, type VendorReputation,
} from './market.js';
export { newspaperForDay, type ArticleCategory, type MarketOutlook, type Newspaper, type WorldArticle, type WorldEffect } from './world-news.js';

export const RULES_VERSION = 1;
export const FLOOR_SHELF_COUNT = 3;
export const WINDOW_SLOT_INDEX = FLOOR_SHELF_COUNT;
export const CUSTOMERS_PER_DAY = 8;
const DISPLAY_COUNT = FLOOR_SHELF_COUNT + 1;
const STANDOUT_COUNT_WEIGHTS = [1, 2, 1] as const;
const STANDOUT_COUNTS = STANDOUT_COUNT_WEIGHTS.flatMap((weight, count) => Array<number>(weight).fill(count));
const BARGAIN_DISCOUNT_PERCENT = [10, 25] as const;

export type Lot = { quantity: number; unitCost: number };
export type Shelf = { goodId: GoodId | null; price: number };
export type Customer = { goodId: GoodId; budget: number; bargainDiscount?: number };
export type PendingNegotiation = { customerIndex: number; goodId: GoodId; offer: number; shelfPrice: number };
export type NegotiationResult = PendingNegotiation & { outcome: NegotiationOutcome; salePrice: number | null };
export type VendorPurchases = { quantity: number; gold: number };
export type CustomerResult = {
  customerIndex: number;
  goodId: GoodId;
  result: 'sold' | 'notDisplayed' | 'soldOut' | 'overBudget'
    | 'offerAccepted' | 'priceHeld' | 'offerDeclined' | 'priceHeldLost';
  price: number | null;
};
export type DailyResult = {
  day: number;
  townId: string;
  revenue: number;
  costOfSales: number;
  purchases: number;
  profit: number;
  sold: number;
  purchasesByVendor?: Record<string, VendorPurchases>;
  negotiations?: NegotiationResult[];
  customerResults?: CustomerResult[];
};
export type LegacyState = {
  rulesVersion: number;
  seed: number;
  day: number;
  phase: 'travel' | 'prepare' | 'open' | 'report';
  townId: string | null;
  gold: number;
  inventory: Record<string, Lot[]>;
  shelves: Shelf[];
  customers: Customer[];
  served: number;
  revenue: number;
  costOfSales: number;
  purchases: number;
  sold: number;
  log: string[];
  history: DailyResult[];
};
type ShopLoopState = {
  marketDay: number | null;
  vendorOffers: Record<string, VendorOffer[]>;
  activeVendorId: string | null;
  visitedVendorIds: string[];
  buyingComplete: boolean;
  vendorReputation: Record<string, VendorReputation>;
  pendingNegotiation: PendingNegotiation | null;
  purchasesByVendor: Record<string, VendorPurchases>;
  negotiations: NegotiationResult[];
  customerResults: CustomerResult[];
};
export type State = LegacyState & ShopLoopState;

export class RuleError extends Error {}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}

function emptyShelf(): Shelf {
  return { goodId: null, price: 1 };
}

export function newGame(seed: number): State {
  return {
    rulesVersion: RULES_VERSION,
    seed,
    day: 1,
    phase: 'travel',
    townId: null,
    gold: 100,
    inventory: {},
    shelves: Array.from({ length: DISPLAY_COUNT }, emptyShelf),
    customers: [],
    served: 0,
    revenue: 0,
    costOfSales: 0,
    purchases: 0,
    sold: 0,
    log: [],
    history: [],
    marketDay: null,
    vendorOffers: {},
    activeVendorId: null,
    visitedVendorIds: [],
    buyingComplete: false,
    vendorReputation: {},
    pendingNegotiation: null,
    purchasesByVendor: {},
    negotiations: [],
    customerResults: [],
  };
}

export function vendorOffersForTown(
  state: Pick<State, 'seed' | 'day' | 'vendorReputation'>,
  townId: string | null,
): Record<string, VendorOffer[]> {
  return Object.fromEntries(vendorsInTown(townId).map((vendor) => [
    vendor.id, offersForVendor(state.seed, state.day, vendor, reputationFor(state, vendor.id).tier),
  ]));
}

export function upgradeState(previous: LegacyState | State): State {
  requireRule(previous.rulesVersion === RULES_VERSION, 'This campaign needs a supported rules version.');
  const saved: LegacyState & Partial<ShopLoopState> = previous;
  const vendorReputation = saved.vendorReputation ?? {};
  const hasCurrentMarket = saved.phase !== 'travel' && saved.marketDay === saved.day;
  const needsMarket = saved.phase === 'prepare' && !hasCurrentMarket;

  return {
    ...saved,
    shelves: Array.from({ length: DISPLAY_COUNT }, (_, slot) => saved.shelves[slot] ?? emptyShelf()),
    marketDay: saved.phase === 'travel' ? null : saved.day,
    vendorOffers: hasCurrentMarket ? saved.vendorOffers ?? {}
      : needsMarket ? vendorOffersForTown({ ...saved, vendorReputation }, saved.townId) : {},
    activeVendorId: hasCurrentMarket && saved.phase === 'prepare' ? saved.activeVendorId ?? null : null,
    visitedVendorIds: hasCurrentMarket ? saved.visitedVendorIds ?? [] : [],
    buyingComplete: saved.phase === 'open' || saved.phase === 'report'
      || (hasCurrentMarket && saved.buyingComplete === true),
    vendorReputation,
    pendingNegotiation: hasCurrentMarket && saved.phase === 'open' && saved.pendingNegotiation?.customerIndex === saved.served
      ? saved.pendingNegotiation : null,
    purchasesByVendor: hasCurrentMarket ? saved.purchasesByVendor ?? {} : {},
    negotiations: hasCurrentMarket ? saved.negotiations ?? [] : [],
    customerResults: hasCurrentMarket ? saved.customerResults ?? [] : [],
  };
}

export function quantity(state: LegacyState, goodId: string) {
  const lots = Object.hasOwn(state.inventory, goodId) ? state.inventory[goodId] : [];
  return lots.reduce((total, lot) => total + lot.quantity, 0);
}

export function inventoryValue(state: LegacyState) {
  return Object.values(state.inventory).flat()
    .reduce((total, lot) => total + lot.quantity * lot.unitCost, 0);
}

function createCustomers(state: State, town: Town): Customer[] {
  const townIndex = TOWNS.findIndex((candidate) => candidate.id === town.id);
  const random = seededRandom((state.seed ^ Math.imul(state.day, 2654435761) ^ townIndex) >>> 0);
  const pool = GOODS.flatMap((good) => Array.from({ length: Math.round(town.demand[good.id] * 4) }, () => good));
  const customers: Customer[] = Array.from({ length: CUSTOMERS_PER_DAY }, () => {
    const good = pool[randomInt(random, 0, pool.length - 1)];
    const { min, max } = priceRange(town, good.id);
    return { goodId: good.id, budget: randomInt(random, min, max) };
  });
  const count = STANDOUT_COUNTS[randomInt(random, 0, STANDOUT_COUNTS.length - 1)];
  const indices = customers.map((_, index) => index);

  for (let remaining = count; remaining > 0; remaining--) {
    const [index] = indices.splice(randomInt(random, 0, indices.length - 1), 1);
    customers[index].bargainDiscount = randomInt(random, ...BARGAIN_DISCOUNT_PERCENT) / 100;
  }
  return customers;
}

function recordSale(state: State, goodId: GoodId, price: number) {
  const lots = state.inventory[goodId];
  const lot = lots[0];
  state.costOfSales += lot.unitCost;
  lot.quantity--;
  if (lot.quantity === 0) lots.shift();
  state.gold += price;
  state.revenue += price;
  state.sold++;
}

function closeDay(state: State) {
  requireRule(state.served === CUSTOMERS_PER_DAY && state.townId, 'Serve all eight customers before closing.');
  state.phase = 'report';
  state.history.push({
    day: state.day,
    townId: state.townId,
    revenue: state.revenue,
    costOfSales: state.costOfSales,
    purchases: state.purchases,
    profit: state.revenue - state.costOfSales,
    sold: state.sold,
    purchasesByVendor: state.purchasesByVendor,
    negotiations: state.negotiations,
    customerResults: state.customerResults,
  });
}

function advanceBusiness(state: State) {
  while (state.served < state.customers.length) {
    const customer = state.customers[state.served];
    const good = GOODS.find((candidate) => candidate.id === customer.goodId)!;
    const shelf = state.shelves.find((candidate) => candidate.goodId === customer.goodId);

    let message: string;
    let result: CustomerResult['result'];
    let price: number | null = null;
    if (!shelf) {
      result = 'notDisplayed';
      message = `Wanted ${good.name}: not displayed.`;
    } else if (quantity(state, customer.goodId) === 0) {
      result = 'soldOut';
      message = `Wanted ${good.name}: sold out.`;
    } else if (customer.bargainDiscount && shelf.price > 1) {
      state.pendingNegotiation = {
        customerIndex: state.served,
        goodId: customer.goodId,
        offer: Math.min(customer.budget, Math.max(1, Math.floor(shelf.price * (1 - customer.bargainDiscount)))),
        shelfPrice: shelf.price,
      };
      return;
    } else if (shelf.price > customer.budget) {
      result = 'overBudget';
      message = `Declined ${good.name} at ${shelf.price}g: budget was ${customer.budget}g.`;
    } else {
      recordSale(state, customer.goodId, shelf.price);
      result = 'sold';
      price = shelf.price;
      message = `Bought ${good.name} for ${shelf.price}g.`;
    }
    state.log.push(message);
    state.customerResults.push({ customerIndex: state.served, goodId: customer.goodId, result, price });
    state.served++;
  }

  closeDay(state);
}

export function applyCommand(previous: LegacyState | State, command: Command): State {
  const state = structuredClone(upgradeState(previous));
  const town = TOWNS.find((candidate) => candidate.id === state.townId);

  switch (command.type) {
    case 'chooseTown': {
      requireRule(state.phase === 'travel', 'The destination is already chosen for this day.');
      requireRule(TOWNS.some((candidate) => candidate.id === command.townId), 'Unknown town.');
      state.townId = command.townId;
      state.phase = 'prepare';
      state.marketDay = state.day;
      state.vendorOffers = vendorOffersForTown(state, state.townId);
      break;
    }

    case 'visitVendor': {
      requireRule(state.phase === 'prepare' && !state.buyingComplete, 'Wholesale has ended for this day.');
      requireRule(!state.activeVendorId, 'Leave the current vendor before visiting another.');
      requireRule(state.visitedVendorIds.length < MAX_VENDOR_VISITS, 'You have used both vendor visits for this day.');
      requireRule(!state.visitedVendorIds.includes(command.vendorId), 'You have already visited this vendor today.');
      requireRule(vendorsInTown(state.townId).some((vendor) => vendor.id === command.vendorId), 'Unknown vendor in this town.');
      state.activeVendorId = command.vendorId;
      state.visitedVendorIds.push(command.vendorId);
      break;
    }

    case 'leaveVendor': {
      requireRule(state.phase === 'prepare' && state.activeVendorId, 'There is no vendor visit to end.');
      state.activeVendorId = null;
      break;
    }

    case 'finishBuying': {
      requireRule(state.phase === 'prepare' && !state.buyingComplete, 'Wholesale has ended for this day.');
      state.activeVendorId = null;
      state.buyingComplete = true;
      break;
    }

    case 'buy': {
      requireRule(state.phase === 'prepare' && !state.buyingComplete && state.activeVendorId, 'Visit a vendor before buying stock.');
      const { offerId, quantity: count } = command;
      requireRule(Number.isInteger(count) && count > 0 && count <= 99, 'Invalid quantity.');
      const vendorId = state.activeVendorId;
      const offers = state.vendorOffers[vendorId];
      const offer = offers.find(({ id }) => id === offerId);
      requireRule(offer, 'This vendor does not have that offer.');
      const reputation = reputationFor(state, vendorId);
      requireRule(reputation.tier >= (offer.requiredTier ?? 0), 'Your reputation with this vendor is too low for this deal.');
      requireRule(count <= offer.quantity, 'This vendor does not have that many units left.');

      const total = offer.unitCost * count;
      requireRule(state.gold >= total, 'Not enough gold.');
      state.gold -= total;
      state.purchases += total;
      const purchases = (state.purchasesByVendor[vendorId] ??= { quantity: 0, gold: 0 });
      purchases.quantity += count;
      purchases.gold += total;
      offer.quantity -= count;
      (state.inventory[offer.goodId] ??= []).push({ quantity: count, unitCost: offer.unitCost });
      const spent = reputation.spent + total;
      const tier = tierForSpend(spent);
      state.vendorReputation[vendorId] = { spent, tier };

      if (tier !== reputation.tier) {
        const vendor = vendorsInTown(state.townId).find(({ id }) => id === vendorId)!;
        const prices = new Map(offersForVendor(state.seed, state.day, vendor, tier).map((lot) => [lot.id, lot.unitCost]));
        for (const lot of offers) lot.unitCost = prices.get(lot.id) ?? lot.unitCost;
      }
      break;
    }

    case 'shelf': {
      requireRule(state.phase === 'prepare' && state.buyingComplete, 'Finish buying before setting displays.');
      const { slot, price, goodId } = command;
      requireRule(Number.isInteger(slot) && slot >= 0 && slot < DISPLAY_COUNT, 'Unknown display.');
      requireRule(Number.isInteger(price) && price > 0 && price <= 10000, 'Invalid price.');
      const good = GOODS.find((candidate) => candidate.id === goodId);
      requireRule(goodId === null || good, 'Unknown good.');
      requireRule(!good || quantity(state, good.id) > 0, 'Buy this good before displaying it.');
      requireRule(
        !good || !state.shelves.some((shelf, index) => index !== slot && shelf.goodId === good.id),
        'This good is already displayed.',
      );
      state.shelves[slot] = { goodId: good?.id ?? null, price };
      break;
    }

    case 'open': {
      requireRule(state.phase === 'prepare' && state.buyingComplete && town, 'Choose a town and finish buying before opening.');
      state.customers = createCustomers(state, town);
      state.phase = 'open';
      break;
    }

    case 'serve': {
      requireRule(state.phase === 'open', 'The shop is not open.');
      requireRule(!state.pendingNegotiation, 'Answer the customer’s offer first.');
      advanceBusiness(state);
      break;
    }

    case 'negotiate': {
      const pending = state.pendingNegotiation;
      requireRule(state.phase === 'open' && pending, 'There is no offer to answer.');
      const { goodId, offer, shelfPrice } = pending;
      const customer = state.customers[state.served];
      const good = GOODS.find((candidate) => candidate.id === goodId)!;
      let salePrice: number | null = null;
      let result: CustomerResult['result'];
      switch (command.outcome) {
        case 'acceptOffer':
          salePrice = offer;
          result = 'offerAccepted';
          state.log.push(`Agreed on ${good.name} for ${offer}g.`);
          break;
        case 'holdPrice':
          if (customer.budget >= shelfPrice) {
            salePrice = shelfPrice;
            result = 'priceHeld';
            state.log.push(`Bought ${good.name} at the listed price of ${shelfPrice}g.`);
          } else {
            result = 'priceHeldLost';
            state.log.push(`Left without ${good.name}: the listed price of ${shelfPrice}g was over budget.`);
          }
          break;
        case 'decline':
          result = 'offerDeclined';
          state.log.push(`Turned down the ${offer}g offer for ${good.name}.`);
          break;
        default:
          throw new RuleError('Unknown negotiation response.');
      }
      if (salePrice !== null) recordSale(state, goodId, salePrice);
      state.negotiations.push({ ...pending, outcome: command.outcome, salePrice });
      state.customerResults.push({ customerIndex: state.served, goodId, result, price: salePrice });
      state.served++;
      state.pendingNegotiation = null;
      advanceBusiness(state);
      break;
    }

    case 'close': {
      requireRule(state.phase === 'open' && !state.pendingNegotiation, 'Serve all eight customers before closing.');
      closeDay(state);
      break;
    }

    case 'nextDay': {
      requireRule(state.phase === 'report', 'Finish serving the current day first.');
      state.day++;
      state.phase = 'travel';
      state.townId = null;
      state.customers = [];
      state.served = 0;
      state.revenue = 0;
      state.costOfSales = 0;
      state.purchases = 0;
      state.sold = 0;
      state.log = [];
      state.marketDay = null;
      state.vendorOffers = {};
      state.activeVendorId = null;
      state.visitedVendorIds = [];
      state.buyingComplete = false;
      state.purchasesByVendor = {};
      state.negotiations = [];
      state.customerResults = [];
      break;
    }
  }

  return state;
}
