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
export const DISPLAY_CAPACITY = 3;
export type PricePreset = 80 | 100 | 120;
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
export type MarketRecord = {
  goodId: GoodId;
  wholesalePrice: number | null;
  demand: number;
  buyerMin: number;
  buyerMax: number;
  vendors: { vendorId: string; offers: { unitCost: number; quantity: number }[] }[];
};
export type JournalEvent =
  | { day: number; type: 'townChosen'; townId: string; market: MarketRecord[] }
  | { day: number; type: 'vendorVisited' | 'vendorLeft'; vendorId: string }
  | { day: number; type: 'buyingFinished' }
  | { day: number; type: 'stockBought'; goodId: GoodId; vendorId: string; quantity: number; unitCost: number; total: number }
  | { day: number; type: 'shelfSet'; slot: number; goodId: GoodId | null; price: number }
  | { day: number; type: 'displayRestocked'; slot: number; goodId: GoodId; quantity: number }
  | { day: number; type: 'shopOpened'; shelves: { slot: number; goodId: GoodId | null; price: number }[] }
  | { day: number; type: 'customerServed'; customer: number; goodId: GoodId; outcome: CustomerResult['result']; price: number | null; budget: number }
  | { day: number; type: 'dayClosed'; result: DailyResult };
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
  /** Optional so snapshots written before the persistent ledger remain readable. */
  journal?: JournalEvent[];
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
  /** Optional so older campaign snapshots preserve their original display semantics. */
  displayStock?: number[];
  pricePresets?: PricePreset[];
  businessMode?: boolean;
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
    journal: [],
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
    displayStock: Array.from({ length: DISPLAY_COUNT }, () => 0),
    pricePresets: Array.from({ length: DISPLAY_COUNT }, () => 100),
    businessMode: false,
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
    displayStock: saved.displayStock?.length === DISPLAY_COUNT ? saved.displayStock : undefined,
    pricePresets: saved.pricePresets?.length === DISPLAY_COUNT ? saved.pricePresets : Array.from({ length: DISPLAY_COUNT }, () => 100),
    businessMode: saved.businessMode === true,
  };
}

export function priceForPreset(townId: string, goodId: GoodId, preset: PricePreset) {
  const town = TOWNS.find(candidate => candidate.id === townId);
  requireRule(town, 'Choose a town before pricing displays.');
  const range = priceRange(town, goodId);
  return Math.max(1, Math.min(10000, Math.round(((range.min + range.max) / 2) * preset / 100)));
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

function recordSale(state: State, goodId: GoodId, price: number, slot?: number) {
  const lots = state.inventory[goodId];
  const lot = lots[0];
  state.costOfSales += lot.unitCost;
  lot.quantity--;
  if (lot.quantity === 0) lots.shift();
  state.gold += price;
  state.revenue += price;
  state.sold++;
  if (slot !== undefined && state.displayStock) state.displayStock[slot] = Math.max(0, state.displayStock[slot] - 1);
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
    } else if (state.displayStock && state.displayStock.length === DISPLAY_COUNT
      ? state.displayStock[state.shelves.indexOf(shelf)] === 0
      : quantity(state, customer.goodId) === 0) {
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
      recordSale(state, customer.goodId, shelf.price, state.shelves.indexOf(shelf));
      result = 'sold';
      price = shelf.price;
      message = `Bought ${good.name} for ${shelf.price}g.`;
    }
    state.log.push(message);
    state.customerResults.push({ customerIndex: state.served, goodId: customer.goodId, result, price });
    state.served++;
    if (state.businessMode) {
      if (state.served === state.customers.length) closeDay(state);
      return;
    }
  }

  closeDay(state);
}

export function applyCommand(previous: LegacyState | State, command: Command): State {
  const prior = upgradeState(previous);
  const state = structuredClone(prior);
  state.journal ??= [];
  let restockedQuantity = 0;
  const town = TOWNS.find((candidate) => candidate.id === state.townId);

  switch (command.type) {
    case 'chooseTown': {
      requireRule(state.phase === 'travel', 'The destination is already chosen for this day.');
      requireRule(TOWNS.some((candidate) => candidate.id === command.townId), 'Unknown town.');
      state.townId = command.townId;
      state.phase = 'prepare';
      state.marketDay = state.day;
      state.vendorOffers = vendorOffersForTown(state, state.townId);
      state.pricePresets = Array.from({ length: DISPLAY_COUNT }, () => 100);
      state.shelves = state.shelves.map(shelf => shelf.goodId && quantity(state, shelf.goodId) > 0
        ? { ...shelf, price: priceForPreset(state.townId!, shelf.goodId, 100) }
        : emptyShelf());
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
      state.pricePresets![slot] = 100;
      break;
    }

    case 'configureDisplays': {
      requireRule(state.phase === 'prepare' && state.buyingComplete, 'Finish buying before setting displays.');
      requireRule(new Set(command.displays.map(display => display.slot)).size === DISPLAY_COUNT,
        'Configure each display exactly once.');
      const next = Array.from({ length: DISPLAY_COUNT }, (_, slot) => command.displays.find(display => display.slot === slot)!);
      const selectedGoods = next.flatMap(display => display.goodId ? [display.goodId] : []);
      requireRule(new Set(selectedGoods).size === selectedGoods.length, 'A good can only be assigned to one display.');
      const townId = state.townId;
      requireRule(townId, 'Choose a town before setting displays.');
      const shelves = next.map(display => {
        const good = GOODS.find(candidate => candidate.id === display.goodId);
        requireRule(display.goodId === null || good, 'Unknown good.');
        requireRule(!good || quantity(state, good.id) > 0, 'Buy this good before displaying it.');
        return { goodId: good?.id ?? null, price: good ? priceForPreset(townId, good.id, display.pricePreset) : 1 };
      });
      state.shelves = shelves;
      state.pricePresets = next.map(display => display.pricePreset);
      break;
    }

    case 'restockDisplay': {
      requireRule(state.phase === 'open' && !state.pendingNegotiation, 'A display can only be refilled during business.');
      const { slot } = command;
      requireRule(slot >= 0 && slot < DISPLAY_COUNT, 'Unknown display.');
      const goodId = state.shelves[slot].goodId;
      requireRule(goodId, 'That display is empty.');
      const displayed = state.displayStock![slot] ?? 0;
      const reserve = Math.max(0, quantity(state, goodId) - displayed);
      const moved = Math.min(DISPLAY_CAPACITY - displayed, reserve);
      requireRule(moved > 0, 'There is no reserve stock for this display.');
      restockedQuantity = moved;
      state.displayStock![slot] += moved;
      break;
    }

    case 'open': {
      requireRule(state.phase === 'prepare' && state.buyingComplete && town, 'Choose a town and finish buying before opening.');
      state.customers = createCustomers(state, town);
      state.displayStock = state.shelves.map(shelf => shelf.goodId
        ? Math.min(DISPLAY_CAPACITY, quantity(state, shelf.goodId)) : 0);
      state.businessMode = true;
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
      if (salePrice !== null) recordSale(state, goodId, salePrice, state.shelves.findIndex(shelf => shelf.goodId === goodId));
      state.negotiations.push({ ...pending, outcome: command.outcome, salePrice });
      state.customerResults.push({ customerIndex: state.served, goodId, result, price: salePrice });
      state.served++;
      state.pendingNegotiation = null;
      if (state.businessMode && state.served === state.customers.length) closeDay(state);
      else if (!state.businessMode) advanceBusiness(state);
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
      state.displayStock = Array.from({ length: DISPLAY_COUNT }, () => 0);
      state.pricePresets = Array.from({ length: DISPLAY_COUNT }, () => 100);
      state.businessMode = false;
      break;
    }
  }

  const record = (event: JournalEvent) => state.journal!.push(event);
  if (command.type === 'chooseTown') {
    const chosenTown = TOWNS.find((candidate) => candidate.id === state.townId)!;
    record({
      day: state.day,
      type: 'townChosen',
      townId: chosenTown.id,
      market: GOODS.map(good => {
        const { min, max } = priceRange(chosenTown, good.id);
        const vendors = vendorsInTown(chosenTown.id).map(vendor => ({
          vendorId: vendor.id,
          offers: (state.vendorOffers[vendor.id] ?? [])
            .filter(offer => offer.goodId === good.id)
            .map(offer => ({ unitCost: offer.unitCost, quantity: offer.quantity })),
        }));
        const prices = vendors.flatMap(vendor => vendor.offers.map(offer => offer.unitCost));
        return {
          goodId: good.id,
          wholesalePrice: prices.length ? Math.min(...prices) : null,
          demand: chosenTown.demand[good.id],
          buyerMin: min,
          buyerMax: max,
          vendors,
        };
      }),
    });
  } else if (command.type === 'visitVendor') {
    record({ day: state.day, type: 'vendorVisited', vendorId: command.vendorId });
  } else if (command.type === 'leaveVendor') {
    if (prior.activeVendorId) record({ day: state.day, type: 'vendorLeft', vendorId: prior.activeVendorId });
  } else if (command.type === 'finishBuying') {
    record({ day: state.day, type: 'buyingFinished' });
  } else if (command.type === 'buy') {
    const vendorId = prior.activeVendorId;
    const offer = prior.vendorOffers[vendorId ?? '']?.find(item => item.id === command.offerId);
    if (vendorId && offer) record({
      day: state.day, type: 'stockBought', goodId: offer.goodId, vendorId,
      quantity: command.quantity, unitCost: offer.unitCost, total: command.quantity * offer.unitCost,
    });
  } else if (command.type === 'shelf') {
    record({ day: state.day, type: 'shelfSet', slot: command.slot, goodId: command.goodId as GoodId | null, price: command.price });
  } else if (command.type === 'configureDisplays') {
    state.shelves.forEach((shelf, slot) => record({ day: state.day, type: 'shelfSet', slot, goodId: shelf.goodId, price: shelf.price }));
  } else if (command.type === 'restockDisplay') {
    const shelf = state.shelves[command.slot];
    if (shelf.goodId) record({ day: state.day, type: 'displayRestocked', slot: command.slot, goodId: shelf.goodId, quantity: restockedQuantity });
  } else if (command.type === 'open') {
    record({ day: state.day, type: 'shopOpened', shelves: state.shelves.map((shelf, slot) => ({ slot, ...shelf })) });
  }

  if (command.type === 'serve' || command.type === 'negotiate') {
    const priorResults = prior.customerResults;
    for (const result of state.customerResults.slice(priorResults.length)) {
      record({
        day: state.day, type: 'customerServed', customer: result.customerIndex + 1,
        goodId: result.goodId, outcome: result.result, price: result.price,
        budget: state.customers[result.customerIndex]?.budget ?? 0,
      });
    }
  }
  if (state.history.length > prior.history.length) {
    const result = state.history.at(-1);
    if (result) record({ day: state.day, type: 'dayClosed', result: structuredClone(result) });
  }

  return state;
}
