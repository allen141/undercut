import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCommand, inventoryValue, newGame, quantity, RuleError } from './index.js';

test('two days preserve stock, cash, deterministic customers and actual purchase costs', () => {
  let state = applyCommand(newGame(42), { type: 'chooseTown', townId: 'meadow' });
  state = applyCommand(state, { type: 'buy', goodId: 'grain', quantity: 10 });
  state = applyCommand(state, { type: 'shelf', slot: 0, goodId: 'grain', price: 5 });

  const firstOpen = applyCommand(state, { type: 'open' });
  assert.deepEqual(firstOpen.customers, applyCommand(state, { type: 'open' }).customers);
  state = firstOpen;
  for (let index = 0; index < 8; index++) state = applyCommand(state, { type: 'serve' });
  state = applyCommand(state, { type: 'close' });

  assert.equal(state.gold, 70 + state.revenue);
  assert.equal(state.costOfSales, state.sold * 3);
  assert.equal(inventoryValue(state), (10 - state.sold) * 3);
  assert.equal(state.history[0].profit, state.sold * 2);

  const stock = quantity(state, 'grain');
  state = applyCommand(state, { type: 'nextDay' });
  state = applyCommand(state, { type: 'chooseTown', townId: 'forge' });
  assert.equal(quantity(state, 'grain'), stock);
  assert.equal(state.day, 2);
  assert.equal(state.history.length, 1);

  state = applyCommand(state, { type: 'open' });
  for (let index = 0; index < 8; index++) state = applyCommand(state, { type: 'serve' });
  state = applyCommand(state, { type: 'close' });
  assert.equal(state.history.length, 2);
});

test('phase, stock, funds and town invariants cannot be bypassed', () => {
  const fresh = newGame(1);
  assert.throws(() => applyCommand(fresh, { type: 'open' }), RuleError);
  assert.throws(() => applyCommand(fresh, { type: 'chooseTown', townId: 'missing' }), RuleError);

  const state = applyCommand(fresh, { type: 'chooseTown', townId: 'meadow' });
  assert.throws(() => applyCommand(state, { type: 'chooseTown', townId: 'forge' }), RuleError);
  assert.throws(() => applyCommand(state, { type: 'buy', goodId: 'grain', quantity: 99 }), RuleError);
  assert.throws(() => applyCommand(state, { type: 'buy', goodId: 'grain', quantity: -1 }), RuleError);
  for (const goodId of ['iron', '__proto__', 'constructor', 'toString']) {
    assert.throws(
      () => applyCommand(state, { type: 'buy', goodId, quantity: 1 }),
      { message: 'This wholesaler does not carry that good.' },
    );
    assert.equal(quantity(state, goodId), 0);
  }
  assert.throws(() => applyCommand(state, { type: 'shelf', slot: 0, goodId: 'grain', price: 5 }), RuleError);

  const open = applyCommand(state, { type: 'open' });
  assert.throws(() => applyCommand(open, { type: 'buy', goodId: 'grain', quantity: 1 }), RuleError);
  assert.throws(() => applyCommand(open, { type: 'close' }), RuleError);
  assert.equal(fresh.gold, 100);
  assert.equal(fresh.phase, 'travel');
});

test('FIFO costs are consumed across purchases and campaigns are independent', () => {
  let state = applyCommand(newGame(2), { type: 'chooseTown', townId: 'meadow' });
  state = applyCommand(state, { type: 'buy', goodId: 'grain', quantity: 1 });
  state.inventory.grain.push({ quantity: 1, unitCost: 5 });
  state = applyCommand(state, { type: 'shelf', slot: 0, goodId: 'grain', price: 8 });
  state = applyCommand(state, { type: 'open' });
  state.customers = Array.from({ length: 8 }, () => ({ goodId: 'grain', budget: 9 }));
  for (let index = 0; index < 8; index++) state = applyCommand(state, { type: 'serve' });

  assert.equal(state.sold, 2);
  assert.equal(state.costOfSales, 8);
  assert.equal(state.revenue, 16);
  assert.equal(quantity(state, 'grain'), 0);
  assert.match(state.log[2], /sold out/);
  assert.throws(() => applyCommand(state, { type: 'serve' }), RuleError);
  assert.equal(newGame(3).gold, 100);
});
