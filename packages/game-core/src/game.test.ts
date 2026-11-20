import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyCommand, CUSTOMERS_PER_DAY, inventoryValue, newGame, quantity, reputationFor,
  REPUTATION_TIERS, RuleError, TOWNS, upgradeState, vendorOffersForTown, vendorsInTown, WINDOW_SLOT_INDEX,
  type LegacyState, type State, type VendorOffer,
} from './index.js';

function chooseTown(state: State, townId = 'meadow') {
  return applyCommand(state, { type: 'chooseTown', townId });
}

function visit(state: State, vendorId = 'meadow-generalist') {
  return applyCommand(state, { type: 'visitVendor', vendorId });
}

function getOffer(state: State, predicate: (offer: VendorOffer) => boolean, vendorId = state.activeVendorId!) {
  const offer = state.vendorOffers[vendorId].find(predicate);
  assert.ok(offer);
  return offer;
}

function buy(state: State, offer: VendorOffer, quantity = 1) {
  return applyCommand(state, { type: 'buy', offerId: offer.id, quantity });
}

function openShop(state: State) {
  if (!state.buyingComplete) state = applyCommand(state, { type: 'finishBuying' });
  return applyCommand(state, { type: 'open' });
}

function finishBusiness(state: State) {
  if (!state.pendingNegotiation) state = applyCommand(state, { type: 'serve' });
  while (state.pendingNegotiation) state = applyCommand(state, { type: 'negotiate', outcome: 'decline' });
  return state;
}

test('each town has a deterministic market with finite stock, three vendors and discounted lots', () => {
  for (const town of TOWNS) {
    const vendors = vendorsInTown(town.id);
    assert.deepEqual(vendors.map(({ archetype }) => archetype), ['bargain', 'generalist', 'specialist']);

    const campaign = newGame(42);
    const first = chooseTown(campaign, town.id);
    assert.deepEqual(first.vendorOffers, vendorOffersForTown(campaign, town.id));
    assert.deepEqual(campaign.vendorOffers, {});
    assert.deepEqual(first.vendorOffers, chooseTown(newGame(42), town.id).vendorOffers);
    assert.notDeepEqual(first.vendorOffers, chooseTown(newGame(17), town.id).vendorOffers);
    assert.deepEqual(Object.keys(first.vendorOffers), vendors.map(({ id }) => id));

    const secondDay = chooseTown(applyCommand(finishBusiness(openShop(first)), { type: 'nextDay' }), town.id);
    for (const { id } of vendors) {
      assert.ok(first.vendorOffers[id].every(({ quantity, unitCost }) => quantity > 0 && unitCost > 0));
      const deal = getOffer(first, ({ kind }) => kind === 'dailyDeal', id);
      const regular = getOffer(first, ({ kind, goodId }) => kind === 'regular' && goodId === deal.goodId, id);
      assert.ok(deal.unitCost < regular.unitCost);
      assert.notEqual(getOffer(secondDay, ({ kind }) => kind === 'dailyDeal', id).goodId, deal.goodId);
    }
  }
});

test('wholesale requires an active vendor and allows at most two distinct visits or no visits', () => {
  const fresh = newGame(3);
  assert.throws(() => applyCommand(fresh, { type: 'open' }), RuleError);
  assert.throws(() => chooseTown(fresh, 'missing'), RuleError);
  assert.equal(fresh.gold, 100);
  const arrived = chooseTown(fresh);
  const vendor = 'meadow-bargain';
  const deal = getOffer(arrived, ({ kind }) => kind === 'dailyDeal', vendor);

  assert.throws(() => chooseTown(arrived, 'forge'), RuleError);
  assert.throws(() => visit(arrived, 'forge-bargain'), RuleError);
  assert.throws(() => buy(arrived, deal), RuleError);
  assert.throws(() => applyCommand(arrived, { type: 'open' }), RuleError);
  assert.throws(() => applyCommand(arrived, { type: 'shelf', slot: 0, goodId: null, price: 1 }), RuleError);

  const atFirst = visit(arrived, vendor);
  assert.throws(() => visit(atFirst), RuleError);
  assert.throws(() => buy(atFirst, deal, -1), RuleError);
  assert.throws(() => buy(atFirst, deal, deal.quantity + 1), RuleError);
  for (const offerId of ['__proto__', 'constructor', 'toString', arrived.vendorOffers['meadow-generalist'][0].id]) {
    assert.throws(() => applyCommand(atFirst, { type: 'buy', offerId, quantity: 1 }), RuleError);
  }
  assert.throws(() => buy({ ...atFirst, gold: 0 }, deal), { message: 'Not enough gold.' });

  const exhausted = buy(atFirst, deal, deal.quantity);
  assert.equal(getOffer(exhausted, ({ id }) => id === deal.id).quantity, 0);
  assert.throws(() => buy(exhausted, deal), RuleError);
  assert.equal(getOffer(atFirst, ({ id }) => id === deal.id).quantity, deal.quantity);

  const between = applyCommand(exhausted, { type: 'leaveVendor' });
  assert.throws(() => visit(between, vendor), RuleError);
  const atSecond = visit(between);
  const afterBoth = applyCommand(atSecond, { type: 'leaveVendor' });
  assert.throws(() => visit(afterBoth, 'meadow-specialist'), RuleError);
  assert.deepEqual(afterBoth.visitedVendorIds, [vendor, 'meadow-generalist']);
  const finished = applyCommand(atSecond, { type: 'finishBuying' });
  assert.equal(finished.activeVendorId, null);
  assert.throws(() => visit(finished, 'meadow-specialist'), RuleError);

  const skipped = finishBusiness(openShop(arrived));
  assert.equal(skipped.phase, 'report');
  assert.equal(skipped.purchases, 0);
  assert.equal(skipped.sold, 0);
  assert.equal(skipped.served, CUSTOMERS_PER_DAY);
  assert.deepEqual(skipped.visitedVendorIds, []);
  assert.deepEqual(skipped.customerResults.map(({ result }) => result), Array(CUSTOMERS_PER_DAY).fill('notDisplayed'));
});

test('vendor reputation tracks spend, reprices remaining stock and unlocks a future purchase', () => {
  const vendorId = 'meadow-generalist';
  const atVendor = visit(chooseTown(newGame(5)), vendorId);
  const iron = getOffer(atVendor, ({ goodId, kind }) => goodId === 'iron' && kind === 'regular');
  const lockedDeal = getOffer(atVendor, ({ kind }) => kind === 'reputationDeal');
  assert.throws(() => buy(atVendor, lockedDeal), /reputation/);

  const firstQuantity = Math.ceil(REPUTATION_TIERS[1].threshold / iron.unitCost);
  const ranked = buy(atVendor, iron, firstQuantity);
  const rankedIron = getOffer(ranked, ({ id }) => id === iron.id);
  const rankedDeal = getOffer(ranked, ({ kind }) => kind === 'dailyDeal');
  const rankedRegular = getOffer(ranked, ({ kind, goodId }) => kind === 'regular' && goodId === rankedDeal.goodId);
  assert.equal(rankedIron.quantity, iron.quantity - firstQuantity);
  assert.ok(rankedIron.unitCost < iron.unitCost);
  assert.ok(rankedDeal.unitCost < rankedRegular.unitCost);
  const spent = iron.unitCost * firstQuantity;
  assert.deepEqual(reputationFor(ranked, vendorId), { spent, tier: 1 });
  assert.deepEqual(ranked.purchasesByVendor[vendorId], { quantity: firstQuantity, gold: spent });
  assert.deepEqual(ranked.inventory.iron, [{ quantity: firstQuantity, unitCost: iron.unitCost }]);

  const unlockedDeal = getOffer(ranked, ({ id }) => id === lockedDeal.id);
  const purchased = buy(ranked, unlockedDeal);
  assert.equal(purchased.gold, 100 - spent - unlockedDeal.unitCost);
  assert.deepEqual(reputationFor(purchased, 'meadow-bargain'), { spent: 0, tier: 0 });
  assert.deepEqual(reputationFor(newGame(5), vendorId), { spent: 0, tier: 0 });

  const report = finishBusiness(openShop(purchased));
  assert.deepEqual(report.history[0].purchasesByVendor, purchased.purchasesByVendor);
  const nextDay = applyCommand(report, { type: 'nextDay' });
  assert.equal(nextDay.day, 2);
  assert.equal(nextDay.gold, purchased.gold);
  assert.deepEqual(nextDay.inventory, purchased.inventory);
  assert.deepEqual(nextDay.vendorReputation, purchased.vendorReputation);
  assert.deepEqual(nextDay.history, report.history);
  assert.deepEqual(nextDay.purchasesByVendor, {});
  assert.deepEqual(nextDay.negotiations, []);
  assert.deepEqual(nextDay.customerResults, []);
  const returned = visit(chooseTown(nextDay), vendorId);
  const newDeal = getOffer(returned, ({ kind }) => kind === 'reputationDeal');
  assert.doesNotThrow(() => buy(returned, newDeal));
});

test('an explicitly opened shop sells from the window with FIFO lot costs and closes after eight', () => {
  let state = visit(chooseTown(newGame(42)));
  const vendorId = state.activeVendorId!;
  const deal = getOffer(state, ({ kind }) => kind === 'dailyDeal');
  const regular = getOffer(state, ({ kind, goodId }) => kind === 'regular' && goodId === deal.goodId);
  state = buy(buy(state, regular), deal);
  state = applyCommand(state, { type: 'finishBuying' });
  assert.throws(() => applyCommand(state, { type: 'shelf', slot: 4, goodId: deal.goodId, price: 8 }), RuleError);
  state = applyCommand(state, { type: 'shelf', slot: WINDOW_SLOT_INDEX, goodId: deal.goodId, price: 8 });
  assert.throws(() => applyCommand(state, { type: 'shelf', slot: 0, goodId: deal.goodId, price: 7 }), RuleError);
  assert.equal(state.shelves.length, 4);

  const firstOpen = openShop(state);
  assert.deepEqual(firstOpen.customers, openShop(state).customers);
  assert.throws(() => buy(firstOpen, deal), RuleError);
  assert.throws(() => applyCommand(firstOpen, { type: 'close' }), RuleError);
  const scripted = {
    ...firstOpen,
    customers: Array.from({ length: CUSTOMERS_PER_DAY }, () => ({ goodId: deal.goodId, budget: 9 })),
  };
  const closed = applyCommand(scripted, { type: 'serve' });

  assert.equal(closed.phase, 'report');
  assert.equal(closed.served, CUSTOMERS_PER_DAY);
  assert.equal(closed.sold, 2);
  assert.equal(closed.costOfSales, regular.unitCost + deal.unitCost);
  assert.equal(closed.revenue, 16);
  assert.equal(closed.gold, 100 - closed.purchases + closed.revenue);
  assert.equal(quantity(closed, deal.goodId), 0);
  assert.equal(inventoryValue(closed), 0);
  assert.match(closed.log[2], /sold out/);
  assert.deepEqual(closed.history[0], {
    day: 1, townId: 'meadow', purchases: closed.purchases, revenue: 16, costOfSales: closed.costOfSales,
    sold: 2, profit: 16 - closed.costOfSales,
    purchasesByVendor: { [vendorId]: { quantity: 2, gold: closed.purchases } },
    negotiations: [],
    customerResults: closed.customerResults,
  });
  assert.throws(() => applyCommand(closed, { type: 'serve' }), RuleError);
  assert.throws(() => applyCommand(closed, { type: 'close' }), RuleError);
});

test('a deterministic day schedules at most two standout customers', () => {
  const counts = new Set<number>();
  for (let seed = 0; seed < 64; seed++) {
    const arrivals = openShop(chooseTown(newGame(seed), 'forge'));
    assert.equal(arrivals.customers.length, CUSTOMERS_PER_DAY);
    counts.add(arrivals.customers.filter(({ bargainDiscount }) => bargainDiscount !== undefined).length);
  }
  assert.deepEqual([...counts].sort(), [0, 1, 2]);
});

test('standout customers pause automatic service and each choice records its actual result', () => {
  let state = visit(chooseTown(newGame(0)));
  const grain = getOffer(state, ({ goodId, kind }) => goodId === 'grain' && kind === 'regular');
  state = applyCommand(buy(state, grain, 3), { type: 'finishBuying' });
  state = openShop(applyCommand(state, { type: 'shelf', slot: 0, goodId: 'grain', price: 8 }));
  const ordinary = { goodId: 'grain', budget: 9 } as const;
  const unstocked = { goodId: 'iron', budget: 20 } as const;
  state.customers = [
    ordinary, { ...ordinary, budget: 7, bargainDiscount: 0.25 },
    unstocked, { ...ordinary, bargainDiscount: 0.25 },
    unstocked, unstocked, unstocked, unstocked,
  ];
  const pending = applyCommand(state, { type: 'serve' });
  assert.equal(pending.served, 1);
  assert.deepEqual(pending.pendingNegotiation, { customerIndex: 1, goodId: 'grain', offer: 6, shelfPrice: 8 });
  assert.deepEqual(upgradeState(JSON.parse(JSON.stringify(pending))).pendingNegotiation, pending.pendingNegotiation);
  assert.throws(() => applyCommand(pending, { type: 'serve' }), RuleError);
  assert.throws(() => applyCommand(pending, { type: 'nextDay' }), RuleError);

  const accepted = applyCommand(pending, { type: 'negotiate', outcome: 'acceptOffer' });
  const held = applyCommand(pending, { type: 'negotiate', outcome: 'holdPrice' });
  const declined = applyCommand(pending, { type: 'negotiate', outcome: 'decline' });
  assert.equal(accepted.served, 3);
  assert.equal(accepted.revenue, 14);
  assert.equal(accepted.costOfSales, grain.unitCost * 2);
  assert.equal(held.revenue, 8);
  assert.equal(declined.revenue, 8);
  assert.deepEqual(accepted.negotiations, [{ ...pending.pendingNegotiation!, outcome: 'acceptOffer', salePrice: 6 }]);
  assert.equal(held.customerResults[1].result, 'priceHeldLost');
  assert.equal(declined.customerResults[1].result, 'offerDeclined');
  assert.deepEqual(accepted.pendingNegotiation, { customerIndex: 3, goodId: 'grain', offer: 6, shelfPrice: 8 });
  const closed = applyCommand(accepted, { type: 'negotiate', outcome: 'holdPrice' });
  assert.equal(closed.phase, 'report');
  assert.equal(closed.revenue, 22);
  assert.equal(closed.sold, 3);
  assert.deepEqual(closed.customerResults.map(({ result }) => result), [
    'sold', 'offerAccepted', 'notDisplayed', 'priceHeld',
    'notDisplayed', 'notDisplayed', 'notDisplayed', 'notDisplayed',
  ]);
  assert.deepEqual(closed.history[0].negotiations, closed.negotiations);
  assert.throws(() => applyCommand(closed, { type: 'negotiate', outcome: 'decline' }), RuleError);
});

test('legacy snapshots retain their rules version, phase, inventory, layout and ordinary customer progress', () => {
  const legacy: LegacyState = {
    rulesVersion: 1, seed: 11, day: 3, phase: 'prepare', townId: 'harbor', gold: 76,
    inventory: { grain: [{ quantity: 2, unitCost: 3 }] },
    shelves: [{ goodId: 'grain', price: 6 }, { goodId: null, price: 1 }, { goodId: null, price: 1 }],
    customers: [], served: 0, revenue: 0, costOfSales: 0, purchases: 24, sold: 0, log: [], history: [],
  };
  const upgraded = upgradeState(legacy);
  assert.equal(upgraded.rulesVersion, 1);
  assert.equal(upgraded.phase, 'prepare');
  assert.equal(upgraded.gold, 76);
  assert.deepEqual(upgraded.inventory, legacy.inventory);
  assert.deepEqual(upgraded.shelves.slice(0, 3), legacy.shelves);
  assert.deepEqual(upgraded.shelves[WINDOW_SLOT_INDEX], { goodId: null, price: 1 });
  assert.equal(upgraded.buyingComplete, false);
  assert.equal(Object.keys(upgraded.vendorOffers).length, 3);
  assert.deepEqual(legacy.shelves.length, 3);

  const alreadyOpen: LegacyState = {
    ...legacy, phase: 'open', served: 7,
    customers: Array.from({ length: CUSTOMERS_PER_DAY }, () => ({ goodId: 'grain', budget: 7 })),
  };
  const closed = applyCommand(alreadyOpen, { type: 'serve' });
  assert.equal(closed.phase, 'report');
  assert.equal(closed.history.length, 1);
  assert.equal(closed.purchases, alreadyOpen.purchases);
  assert.equal(closed.served, CUSTOMERS_PER_DAY);
  assert.equal(closed.gold, 82);
  assert.deepEqual(closed.negotiations, []);
  assert.deepEqual(closed.customerResults, [{ customerIndex: 7, goodId: 'grain', result: 'sold', price: 6 }]);

  const alreadyServed = { ...alreadyOpen, served: CUSTOMERS_PER_DAY };
  const legacyReport = applyCommand(alreadyServed, { type: 'close' });
  assert.equal(legacyReport.history.length, 1);
  assert.equal(upgradeState(legacyReport).history.length, 1);
  assert.throws(() => applyCommand(legacyReport, { type: 'close' }), RuleError);

  const afterRollback: State = { ...closed, day: 4, phase: 'prepare', townId: 'forge' };
  const resumed = upgradeState(afterRollback);
  assert.deepEqual(resumed.customerResults, []);
  assert.deepEqual(Object.keys(resumed.vendorOffers), vendorsInTown('forge').map(({ id }) => id));
});
