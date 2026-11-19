import type { Command } from '@undercut/contracts';

export const RULES_VERSION = 1;
const SHELF_COUNT = 3;
const CUSTOMERS_PER_DAY = 8;

export const GOODS = [
  { id: 'grain', name: 'Grain', base: 4, color: 0xe6bf72 },
  { id: 'herbs', name: 'Herbs', base: 6, color: 0x92ba9a },
  { id: 'cloth', name: 'Cloth', base: 8, color: 0xb6a4d9 },
  { id: 'tea', name: 'Tea', base: 10, color: 0xc99970 },
  { id: 'iron', name: 'Iron', base: 12, color: 0x94b3ca },
  { id: 'crystal', name: 'Crystal', base: 20, color: 0x86d5ce },
] as const;
export type GoodId = typeof GOODS[number]['id'];

export const TOWNS = [
  {
    id: 'meadow', name: 'Meadow', color: '#a7c9a0', specialty: 'Grain & herbs',
    supply: { grain: 3, herbs: 4, cloth: 9, tea: 11 },
    demand: { grain: 0.9, herbs: 0.9, cloth: 1.3, tea: 1.2, iron: 1.4, crystal: 1.1 },
  },
  {
    id: 'forge', name: 'Forge', color: '#e6aa86', specialty: 'Iron & crystal',
    supply: { iron: 9, crystal: 16, grain: 5, cloth: 9 },
    demand: { grain: 1.3, herbs: 1.4, cloth: 1.1, tea: 1.2, iron: 0.9, crystal: 0.9 },
  },
  {
    id: 'harbor', name: 'Harbor', color: '#9ec6e6', specialty: 'Cloth & tea',
    supply: { cloth: 6, tea: 7, herbs: 7, crystal: 22 },
    demand: { grain: 1.2, herbs: 1.1, cloth: 0.9, tea: 0.9, iron: 1.2, crystal: 1.4 },
  },
] as const;
export type Town = typeof TOWNS[number];

export type Lot = { quantity: number; unitCost: number };
export type Shelf = { goodId: GoodId | null; price: number };
export type DailyResult = {
  day: number;
  townId: string;
  revenue: number;
  costOfSales: number;
  purchases: number;
  profit: number;
  sold: number;
};
export type State = {
  rulesVersion: number;
  seed: number;
  day: number;
  phase: 'travel' | 'prepare' | 'open' | 'report';
  townId: string | null;
  gold: number;
  inventory: Record<string, Lot[]>;
  shelves: Shelf[];
  customers: { goodId: GoodId; budget: number }[];
  served: number;
  revenue: number;
  costOfSales: number;
  purchases: number;
  sold: number;
  log: string[];
  history: DailyResult[];
};

export class RuleError extends Error {}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
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
    shelves: Array.from({ length: SHELF_COUNT }, () => ({ goodId: null, price: 1 })),
    customers: [],
    served: 0,
    revenue: 0,
    costOfSales: 0,
    purchases: 0,
    sold: 0,
    log: [],
    history: [],
  };
}

export function quantity(state: State, goodId: string) {
  const lots = Object.hasOwn(state.inventory, goodId) ? state.inventory[goodId] : [];
  return lots.reduce((total, lot) => total + lot.quantity, 0);
}

export function inventoryValue(state: State) {
  return Object.values(state.inventory).flat()
    .reduce((total, lot) => total + lot.quantity * lot.unitCost, 0);
}

export function priceRange(town: Town, goodId: GoodId) {
  const base = GOODS.find((good) => good.id === goodId)!.base * 1.8 * town.demand[goodId];
  return {
    min: Math.max(1, Math.floor(base * 0.85)),
    max: Math.max(1, Math.floor(base * 1.15)),
  };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function applyCommand(previous: State, command: Command): State {
  requireRule(previous.rulesVersion === RULES_VERSION, 'This campaign needs a supported rules version.');
  const state = structuredClone(previous);
  const town = TOWNS.find((candidate) => candidate.id === state.townId);

  switch (command.type) {
    case 'chooseTown': {
      requireRule(state.phase === 'travel', 'The destination is already chosen for this day.');
      requireRule(TOWNS.some((candidate) => candidate.id === command.townId), 'Unknown town.');
      state.townId = command.townId;
      state.phase = 'prepare';
      break;
    }

    case 'buy': {
      requireRule(state.phase === 'prepare' && town, 'Buy stock before opening.');
      const { goodId, quantity: count } = command;
      requireRule(Number.isInteger(count) && count > 0 && count <= 99, 'Invalid quantity.');
      requireRule(Object.hasOwn(town.supply, goodId), 'This wholesaler does not carry that good.');

      const unitCost = (town.supply as Record<string, number>)[goodId];
      const total = unitCost * count;
      requireRule(state.gold >= total, 'Not enough gold.');
      state.gold -= total;
      state.purchases += total;
      (state.inventory[goodId] ??= []).push({ quantity: count, unitCost });
      break;
    }

    case 'shelf': {
      requireRule(state.phase === 'prepare', 'Set shelves before opening.');
      const { slot, price, goodId } = command;
      requireRule(Number.isInteger(slot) && slot >= 0 && slot < SHELF_COUNT, 'Unknown shelf.');
      requireRule(Number.isInteger(price) && price > 0 && price <= 10000, 'Invalid price.');
      requireRule(goodId === null || GOODS.some((good) => good.id === goodId), 'Unknown good.');
      requireRule(goodId === null || quantity(state, goodId) > 0, 'Buy this good before displaying it.');
      requireRule(
        goodId === null || !state.shelves.some((shelf, index) => index !== slot && shelf.goodId === goodId),
        'This good is already displayed.',
      );
      state.shelves[slot] = { goodId: goodId as GoodId | null, price };
      break;
    }

    case 'open': {
      requireRule(state.phase === 'prepare' && town, 'Choose a town and prepare first.');
      const townIndex = TOWNS.findIndex((candidate) => candidate.id === town.id);
      const random = seededRandom((state.seed ^ Math.imul(state.day, 2654435761) ^ townIndex) >>> 0);
      const pool = GOODS.flatMap((good) => Array.from({ length: Math.round(town.demand[good.id] * 4) }, () => good));

      state.customers = Array.from({ length: CUSTOMERS_PER_DAY }, () => {
        const good = pool[Math.floor(random() * pool.length)];
        const { min, max } = priceRange(town, good.id);
        return { goodId: good.id, budget: min + Math.floor(random() * (max - min + 1)) };
      });
      state.phase = 'open';
      break;
    }

    case 'serve': {
      const customer = state.customers[state.served];
      requireRule(
        state.phase === 'open' && state.served < CUSTOMERS_PER_DAY && customer,
        'No customer is waiting.',
      );
      const good = GOODS.find((candidate) => candidate.id === customer.goodId)!;
      const shelf = state.shelves.find((candidate) => candidate.goodId === customer.goodId);

      let message: string;
      if (!shelf) {
        message = `Wanted ${good.name}: not displayed.`;
      } else if (quantity(state, customer.goodId) === 0) {
        message = `Wanted ${good.name}: sold out.`;
      } else if (shelf.price > customer.budget) {
        message = `Declined ${good.name} at ${shelf.price}g: budget was ${customer.budget}g.`;
      } else {
        const lots = state.inventory[customer.goodId];
        const lot = lots[0];
        state.costOfSales += lot.unitCost;
        lot.quantity--;
        if (lot.quantity === 0) lots.shift();
        state.gold += shelf.price;
        state.revenue += shelf.price;
        state.sold++;
        message = `Bought ${good.name} for ${shelf.price}g.`;
      }

      state.log.push(message);
      state.served++;
      break;
    }

    case 'close': {
      requireRule(state.phase === 'open' && state.served === CUSTOMERS_PER_DAY, 'Serve all eight customers before closing.');
      state.phase = 'report';
      state.history.push({
        day: state.day,
        townId: state.townId!,
        revenue: state.revenue,
        costOfSales: state.costOfSales,
        purchases: state.purchases,
        profit: state.revenue - state.costOfSales,
        sold: state.sold,
      });
      break;
    }

    case 'nextDay': {
      requireRule(state.phase === 'report', 'Close the current day first.');
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
      break;
    }
  }

  return state;
}
