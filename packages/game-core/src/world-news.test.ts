import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GOODS, newspaperForDay, type DailyResult } from './index.js';

test('the morning edition is deterministic and contains current and projected prices', () => {
  const issue = newspaperForDay(177, 4);
  assert.deepEqual(issue, newspaperForDay(177, 4));
  assert.equal(issue.day, 4);
  assert.equal(issue.articles.length, 2);
  assert.deepEqual(issue.outlook.map(row => row.goodId), GOODS.map(good => good.id));
  assert.ok(issue.outlook.every(row => row.current > 0 && row.projected > 0));
  assert.ok(issue.outlook.every(row => row.current > 0 && row.projected > 0 && Number.isFinite(row.change)));
});

test('the morning edition carries yesterday market activity forward as an article', () => {
  const previous: DailyResult = {
    day: 1, townId: 'harbor', revenue: 12, costOfSales: 7, purchases: 4, profit: 5, sold: 2,
  };
  const issue = newspaperForDay(177, 2, [previous]);
  const report = issue.articles.find(article => article.category === 'local');
  assert.ok(report);
  assert.match(report.headline, /Harbor/);
  assert.match(report.body, /2 items changed hands/);
  assert.deepEqual(issue, newspaperForDay(177, 2, [previous]));
  assert.notDeepEqual(issue, newspaperForDay(178, 2, [previous]));
});
