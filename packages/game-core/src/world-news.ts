import { GOODS, TOWNS, type GoodId } from './catalog.js';
import type { DailyResult } from './index.js';
import { offersForVendor, vendorsInTown } from './market.js';
import { seededRandom } from './random.js';

export type ArticleCategory = 'world' | 'trade' | 'local';
export type WorldArticle = {
  id: string;
  occurredOn: number;
  expiresOn: number;
  category: ArticleCategory;
  headline: string;
  body: string;
  source: string;
  relatedGood?: GoodId;
  townId?: string;
  effects: WorldEffect[];
};
export type WorldEffect =
  | { type: 'globalPrice'; goodId: GoodId; percent: number }
  | { type: 'townSupply'; townId: string; goodId: GoodId; percent: number }
  | { type: 'townDemand'; townId: string; goodId: GoodId; percent: number }
  | { type: 'storyFlag'; flag: string; value: string };
export type MarketOutlook = {
  goodId: GoodId;
  current: number;
  change: number;
  projected: number;
  projectedChange: number;
};
export type Newspaper = {
  edition: string;
  day: number;
  articles: WorldArticle[];
  outlook: MarketOutlook[];
};

const worldBriefs = [
  ['A New Day Across the Realms', 'Caravans are crossing the old roads again, bringing fresh goods and rumors to every market.'],
  ['Roads Open After the Rain', 'Travelers report clear skies on the main roads. Local traders expect a busier day in town.'],
  ['The Towns Are Stirring', 'Early bells ring from the market squares as shopkeepers prepare for another day of trade.'],
  ['Lanterns Along the Trade Road', 'A string of lights was seen moving between the towns before dawn. No delays have been reported.'],
  ['Market Day Approaches', 'Vendors are restocking their stalls, and the first wagons have arrived from the countryside.'],
] as const;

const tradeBriefs = [
  ['Merchants Watch the Current', 'River traffic is moving steadily. Traders say deliveries should reach the markets on schedule.'],
  ['Busy Hands at the Exchange', 'Buyers and sellers are meeting early to compare prices before the day’s first bell.'],
  ['A Quiet Start for Trade', 'The exchange opened without a rush. Merchants expect prices to settle as more news arrives.'],
  ['Caravan Counts Rise', 'More wagons than usual were spotted on the eastern road, though their cargo remains a mystery.'],
  ['Porters Return to the Square', 'The market crews have finished unloading overnight deliveries and opened the warehouse gates.'],
] as const;

function rngFor(seed: number, day: number, salt: number) {
  return seededRandom((seed ^ Math.imul(day, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0);
}

function globalPrice(seed: number, day: number, goodId: GoodId) {
  const prices = TOWNS.flatMap(town => vendorsInTown(town.id).flatMap(vendor =>
    offersForVendor(seed, day, vendor, 0).filter(offer => offer.kind === 'regular' && offer.goodId === goodId)
      .map(offer => offer.unitCost)));
  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}

function eventFromPreviousDay(previous: DailyResult | undefined, day: number): WorldArticle | undefined {
  if (!previous) return undefined;
  const town = TOWNS.find(item => item.id === previous.townId);
  const name = town?.name ?? 'A neighboring town';
  const detail = previous.sold > 0
    ? `Travelers from ${name} report brisk trade after ${previous.sold} ${previous.sold === 1 ? 'item changed hands' : 'items changed hands'} yesterday.`
    : `Merchants in ${name} are adjusting their displays after a quiet day in the market.`;
  return {
    id: `town-report-${previous.day}`,
    occurredOn: previous.day,
    expiresOn: day,
    category: 'local',
    headline: `${name} Market Report`,
    body: detail,
    source: 'The Traveling Ledger',
    townId: previous.townId,
    effects: [],
  };
}

/** Create a stable daily paper from the campaign seed and recorded market history. */
export function newspaperForDay(seed: number, day: number, history: readonly DailyResult[] = []): Newspaper {
  const pick = <T,>(pool: readonly T[], salt: number) => pool[Math.floor(rngFor(seed, day, salt)() * pool.length)];
  const [worldHeadline, worldBody] = pick(worldBriefs, 1);
  const [tradeHeadline, tradeBody] = pick(tradeBriefs, 2);
  const local = eventFromPreviousDay(history.at(-1), day);
  const articles: WorldArticle[] = [
    { id: `world-${day}`, occurredOn: day, expiresOn: day, category: 'world', headline: worldHeadline, body: worldBody,
      source: 'The Wandering Gazette', effects: [] },
    local ?? { id: `trade-${day}`, occurredOn: day, expiresOn: day, category: 'trade',
      headline: tradeHeadline, body: tradeBody, source: 'Market Wire', effects: [] },
    ...(local ? [{ id: `trade-${day}`, occurredOn: day, expiresOn: day, category: 'trade' as const,
      headline: tradeHeadline, body: tradeBody, source: 'Market Wire', effects: [] }] : []),
  ];

  const outlook = GOODS.map(good => {
    const previous = globalPrice(seed, Math.max(1, day - 1), good.id);
    const current = globalPrice(seed, day, good.id);
    const noise = (rngFor(seed, day, GOODS.indexOf(good) + 13)() - .5) * .8;
    const projected = Math.max(1, Math.round((current + (current - previous) * .5 + noise) * 10) / 10);
    return {
      goodId: good.id,
      current: Math.round(current * 10) / 10,
      change: Math.round((current - previous) * 10) / 10,
      projected,
      projectedChange: Math.round((projected - current) * 10) / 10,
    };
  });

  return { edition: 'The Wandering Gazette', day, articles, outlook };
}
