import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DISPLAY_CAPACITY, GOODS, TOWNS, VENDORS, inventoryValue, priceForPreset, priceRange, quantity, type GoodId, type JournalEvent, type PricePreset, type State } from '@undercut/game-core';
import type { Command } from '@undercut/contracts';
import type { Campaign } from './App.js';

export type LedgerPageId = 'overview' | 'markets' | 'suppliers' | 'inventory' | 'merchandising' | 'performance' | 'gazette' | 'events' | 'newspapers';
type PageContext = { state: State; send: (command: Command) => void; busy: boolean; online: boolean };
type LedgerPage = { id: LedgerPageId; title: string; render: (context: PageContext) => ReactNode };
const goodName = (id: string) => GOODS.find(good => good.id === id)?.name ?? id;
const townName = (id: string) => TOWNS.find(town => town.id === id)?.name ?? id;
const vendorName = (id: string) => VENDORS.find(vendor => vendor.id === id)?.name ?? id;
const money = (value: number) => `${value}g`;

function eventsForDay(events: JournalEvent[], day: number) { return events.filter(event => event.day === day); }

function digest(events: JournalEvent[], day: number, history: State['history']) {
  const dayEvents = eventsForDay(events, day);
  const location = dayEvents.find((event): event is Extract<JournalEvent, { type: 'townChosen' }> => event.type === 'townChosen');
  const previousResult = history.find(result => result.day === day);
  const result = dayEvents.find((event): event is Extract<JournalEvent, { type: 'dayClosed' }> => event.type === 'dayClosed')?.result ?? previousResult;
  const buys = dayEvents.filter((event): event is Extract<JournalEvent, { type: 'stockBought' }> => event.type === 'stockBought');
  const buyers = dayEvents.filter((event): event is Extract<JournalEvent, { type: 'customerServed' }> => event.type === 'customerServed');
  const products = [...new Set(buyers.filter(event => event.outcome === 'sold').map(event => event.goodId))];
  const hasDetailedArchive = dayEvents.some(event => event.type === 'shopOpened');
  return {
    location: location ? townName(location.townId) : previousResult ? townName(previousResult.townId) : 'Location unavailable',
    result,
    purchaseCount: hasDetailedArchive ? buys.reduce((sum, event) => sum + event.quantity, 0) : null,
    products: hasDetailedArchive ? products : null,
    customers: hasDetailedArchive ? buyers.length : null,
  };
}

const pages: LedgerPage[] = [
  { id: 'overview', title: 'Overview', render: ({ state }) => <>
    <p className="ledger-intro">Day {state.day} · {state.townId ? townName(state.townId) : 'Choose today’s market'} · {state.phase}</p>
    <div className="ledger-metrics">
      <div><span>Available gold</span><strong>{money(state.gold)}</strong></div>
      <div><span>Inventory at cost</span><strong>{money(inventoryValue(state))}</strong></div>
      <div><span>Sales today</span><strong>{money(state.revenue)}</strong></div>
      <div><span>Trading profit</span><strong>{money(state.revenue - state.costOfSales)}</strong></div>
    </div>
    <p className="ledger-intro">Use the sections to compare markets, visit suppliers, prepare displays, and review your trading record.</p>
  </> },
  { id: 'inventory', title: 'Inventory', render: ({ state }) => <>
    <p className="ledger-intro">Goods carried between days, valued at their purchase cost.</p>
    <div className="ledger-table" role="table" aria-label="Current inventory">
      <div role="row" className="ledger-table-head"><span role="columnheader">Good</span><span role="columnheader">Quantity</span><span role="columnheader">Cost value</span></div>
      {GOODS.map(good => {
        const lots = state.inventory[good.id] ?? [];
        const count = quantity(state, good.id);
        const value = lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
        return <div role="row" key={good.id}><span role="cell">{good.name}</span><span role="cell">{count}</span><span role="cell">{money(value)}</span></div>;
      })}
    </div>
    <p className="ledger-total">Total stock value <strong>{money(inventoryValue(state))}</strong></p>
  </> },
  { id: 'performance', title: 'Performance', render: context => <PerformancePage {...context} /> },
  { id: 'markets', title: 'Markets', render: context => <MarketExplorer {...context} /> },
  { id: 'suppliers', title: 'Suppliers', render: ({ state, send, busy, online }) => <>
    <p className="ledger-intro">Compare this town’s current offers before using one of your two vendor visits.</p>
    <p>Visits used: {state.visitedVendorIds.length} of 2</p>
    <div className="ledger-vendors">{VENDORS.filter(vendor => (state.vendorOffers[vendor.id] ?? []).length).map(vendor => {
      const active = state.activeVendorId === vendor.id;
      const visited = state.visitedVendorIds.includes(vendor.id);
      return <article className="ledger-vendor" key={vendor.id}>
        <header><div><h3>{vendor.name}</h3><span>{state.vendorReputation[vendor.id]?.tier ?? 0} reputation tier</span></div>
          {!active && <button disabled={busy || !online || state.phase !== 'prepare' || state.buyingComplete || visited || state.visitedVendorIds.length >= 2 || !!state.activeVendorId}
            onClick={() => send({ type: 'visitVendor', vendorId: vendor.id })}>{visited ? 'Visited' : 'Begin visit'}</button>}
          {active && <button disabled={busy || !online} onClick={() => send({ type: 'leaveVendor' })}>End visit</button>}
        </header>
        <div className="ledger-table" role="table" aria-label={`${vendor.name} offers`}>
          <div role="row" className="ledger-table-head"><span role="columnheader">Offer</span><span role="columnheader">Price · stock</span><span role="columnheader">Buy</span></div>
          {(state.vendorOffers[vendor.id] ?? []).map(offer => <div role="row" key={offer.id}>
            <span role="cell">{goodName(offer.goodId)}{offer.requiredTier ? ` · Tier ${offer.requiredTier}` : ''}</span>
            <span role="cell">{money(offer.unitCost)} · {offer.quantity}</span>
            <span role="cell"><button disabled={!active || busy || !online || offer.quantity < 1 || state.gold < offer.unitCost}
              onClick={() => send({ type: 'buy', offerId: offer.id, quantity: 1 })}>Buy 1</button></span>
          </div>)}
        </div>
      </article>;
    })}</div>
    {state.phase === 'prepare' && !state.buyingComplete && <button className="primary" disabled={busy || !online}
      onClick={() => send({ type: 'finishBuying' })}>Finish buying and prepare displays</button>}
  </> },
  { id: 'merchandising', title: 'Merchandising', render: context => <MerchandisingPage {...context} /> },
  { id: 'events', title: 'Events', render: ({ state }) => {
    const events = state.journal ?? [];
    if (!events.length) return <p className="ledger-empty">Campaign activity will appear here as you trade.</p>;
    return <ol className="ledger-events">{[...events].reverse().map((event, index) => <li key={`${event.day}-${events.length - index}`}>
      <span>Day {event.day}</span><strong>{describeEvent(event)}</strong>
    </li>)}</ol>;
  } },
  { id: 'gazette', title: 'Gazette', render: ({ state }) => {
    const issues = [...(state.newspapers ?? [])].reverse();
    if (!issues.length) return <p className="ledger-empty">This campaign predates the saved Gazette archive. New editions will be preserved as they are issued.</p>;
    return <div className="ledger-papers">{issues.map(issue => <article className="ledger-paper" key={issue.day}>
      <span className="ledger-paper-kicker">{issue.edition} · Morning edition · Day {issue.day}</span>
      {issue.articles.map(article => <section key={article.id}>
        <h2>{article.headline}</h2><p>{article.body}</p>
        <span className="ledger-paper-caption">{article.source} · {article.category === 'world' ? 'World' : article.category === 'trade' ? 'Trade' : 'Local'} report</span>
      </section>)}
      <h3>Market outlook · Day {issue.day}</h3>
      <div className="ledger-table market-matrix" role="table" aria-label={`Market outlook for day ${issue.day}`}>
        <div role="row" className="ledger-table-head"><span role="columnheader">Good</span><span role="columnheader">Current estimate</span><span role="columnheader">Daily change</span><span role="columnheader">Forecast</span></div>
        {issue.outlook.map(row => <div role="row" key={row.goodId}>
          <span role="cell">{goodName(row.goodId)}</span><span role="cell">{money(row.current)}</span>
          <span role="cell">{row.change > 0 ? '+' : ''}{money(row.change)}</span>
          <span role="cell">{money(row.projected)} · {row.projectedChange > 0 ? '+' : ''}{money(row.projectedChange)}</span>
        </div>)}
      </div>
    </article>)}</div>;
  } },
];

function MerchandisingPage({ state, send, busy, online }: PageContext) {
  const [goods, setGoods] = useState<(string | null)[]>(state.shelves.map(shelf => shelf.goodId));
  const [presets, setPresets] = useState<PricePreset[]>(state.pricePresets ?? [100, 100, 100, 100]);
  const townId = state.townId;
  const choices = GOODS.filter(good => quantity(state, good.id) > 0);
  return <>
    <p className="ledger-intro">Assign up to four different goods. The baseline is the midpoint of this town’s estimated buyer range.</p>
    <div className="ledger-display-grid">{state.shelves.map((shelf, slot) => {
      const goodId = goods[slot];
      const price = goodId && townId ? priceForPreset(townId, goodId as GoodId, presets[slot]) : null;
      const displayed = state.displayStock?.[slot] ?? 0;
      const reserve = goodId ? Math.max(0, quantity(state, goodId) - displayed) : 0;
      const range = goodId && townId ? priceRange(TOWNS.find(item => item.id === townId)!, goodId as GoodId) : null;
      return <article className="ledger-display" key={slot}>
        <h3>{slot === 3 ? 'Window display' : `Floor display ${slot + 1}`}</h3>
        {state.phase === 'prepare' && <>
          <label>Good<select value={goodId ?? ''} disabled={busy || !online} onChange={event => setGoods(current => current.map((value, index) => index === slot ? event.target.value || null : value))}>
            <option value="">Empty</option>{choices.map(good => <option key={good.id} value={good.id} disabled={goods.some((value, index) => index !== slot && value === good.id)}>{good.name} · {quantity(state, good.id)} in stock</option>)}
          </select></label>
          {goodId && <fieldset className="price-presets"><legend>Daily price</legend>{([80, 100, 120] as const).map(preset => <label key={preset}><input type="radio" name={`preset-${slot}`} checked={presets[slot] === preset} onChange={() => setPresets(current => current.map((value, index) => index === slot ? preset : value))} />{preset}%</label>)}</fieldset>}
          {price !== null && <p className="display-price">{money(price)} <span>Budget estimate {range?.min}–{range?.max}g</span></p>}
        </>}
        {state.phase !== 'prepare' && <p>{shelf.goodId ? goodName(shelf.goodId) : 'Empty'} · {shelf.goodId ? money(shelf.price) : '—'}</p>}
        {state.phase === 'open' && shelf.goodId && <>
          <p>Displayed {displayed}/{DISPLAY_CAPACITY} · Reserve {reserve}</p>
          <button disabled={busy || !online || reserve < 1 || displayed >= DISPLAY_CAPACITY || !!state.pendingNegotiation}
            onClick={() => send({ type: 'restockDisplay', slot })}>Refill display</button>
        </>}
      </article>;
    })}</div>
    {state.phase === 'prepare' && <button className="primary" disabled={busy || !online || !state.buyingComplete || !townId}
      onClick={() => send({ type: 'configureDisplays', displays: goods.map((goodId, slot) => ({ slot, goodId, pricePreset: presets[slot] })) })}>
      Save all displays
    </button>}
  </>;
}

function MarketExplorer({ state, send, busy, online }: PageContext) {
  const [selectedGood, setSelectedGood] = useState(GOODS[0].id);
  const currentTown = TOWNS.find(town => town.id === state.townId);
  const [selectedTownId, setSelectedTownId] = useState(currentTown?.id ?? TOWNS[0].id);
  const selectedTown = TOWNS.find(town => town.id === selectedTownId) ?? TOWNS[0];
  return <>
    <p className="ledger-intro">Estimated retail ranges and demand context before travel. Current seller offers appear only after arrival.</p>
    <label className="ledger-filter">Commodity<select value={selectedGood} onChange={event => setSelectedGood(event.target.value as typeof selectedGood)}>
      {GOODS.map(good => <option key={good.id} value={good.id}>{good.name}</option>)}
    </select></label>
    {state.phase === 'travel' && <section className="merchant-compass-workspace" aria-label="Merchant compass">
      <div className="merchant-compass" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}shop-art/destination-dial.webp)` }}>
        {TOWNS.map(town => <button type="button" key={town.id} aria-pressed={selectedTownId === town.id}
          className={`merchant-compass-town merchant-compass-${town.id}`} onClick={() => setSelectedTownId(town.id)}>
          {town.name}
        </button>)}
      </div>
      <div className="merchant-route-preview">
        <div className="town-window-preview" role="img" aria-label={`${selectedTown.name} vista`} style={{ backgroundImage: `url(${import.meta.env.BASE_URL}shop-art/town-${selectedTown.id}.webp)` }} />
        <div><h3>{selectedTown.name}</h3><p>{selectedTown.specialty}</p>
          <button className="primary" type="button" disabled={busy || !online}
            onClick={() => send({ type: 'chooseTown', townId: selectedTown.id })}>Travel to {selectedTown.name}</button>
        </div>
      </div>
    </section>}
    <div className="market-explorer-grid">{TOWNS.map(town => {
      const range = priceRange(town, selectedGood);
      const held = quantity(state, selectedGood);
      const demand = town.demand[selectedGood];
      return <article className={`market-town ${currentTown?.id === town.id ? 'selected' : ''}`} key={town.id}>
        <h3>{town.name}</h3><p>{town.specialty}</p>
        <dl><dt>Estimated retail</dt><dd>{range.min}–{range.max}g</dd><dt>Demand index</dt><dd>{demand.toFixed(1)}×</dd><dt>Held stock</dt><dd>{held}</dd></dl>
        {state.phase === 'travel' && <button type="button" aria-pressed={selectedTownId === town.id}
          onClick={() => setSelectedTownId(town.id)}>Preview {town.name}</button>}
      </article>;
    })}</div>
    <h3>Commodity comparison</h3>
    <div className="ledger-table market-matrix" role="table" aria-label="Estimated retail by town and good">
      <div role="row" className="ledger-table-head"><span role="columnheader">Good</span>{TOWNS.map(town => <span role="columnheader" key={town.id}>{town.name}</span>)}</div>
      {GOODS.map(good => <div role="row" key={good.id}><span role="cell">{good.name}</span>{TOWNS.map(town => {
        const range = priceRange(town, good.id);
        return <span role="cell" key={town.id}>{range.min}–{range.max}g</span>;
      })}</div>)}
    </div>
  </>;
}

function PerformancePage({ state, send, busy, online }: PageContext) {
  const [townFilter, setTownFilter] = useState('all');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const history = state.history.filter(day => townFilter === 'all' || day.townId === townFilter);
  const total = history.reduce((sum, day) => ({
    revenue: sum.revenue + day.revenue, costs: sum.costs + day.costOfSales,
    profit: sum.profit + day.profit, sold: sum.sold + day.sold,
  }), { revenue: 0, costs: 0, profit: 0, sold: 0 });
  const commodityResults = GOODS.map(good => {
    const outcomes = history.flatMap(day => (day.customerResults ?? [])
      .filter(result => result.goodId === good.id));
    const sales = outcomes.filter(result => result.price !== null);
    const revenue = sales.reduce((sum, result) => sum + (result.price ?? 0), 0);
    const costsRecorded = sales.every(result => typeof result.costOfSales === 'number');
    const costs = costsRecorded ? sales.reduce((sum, result) => sum + (result.costOfSales ?? 0), 0) : null;
    return { good, customers: outcomes.length, units: sales.length, revenue, costs, profit: costs === null ? null : revenue - costs };
  });
  const townResults = TOWNS.map(town => {
    const days = history.filter(day => day.townId === town.id);
    return { town, days: days.length, revenue: days.reduce((sum, day) => sum + day.revenue, 0), profit: days.reduce((sum, day) => sum + day.profit, 0) };
  }).filter(row => row.days > 0);
  const vendorResults = VENDORS.map(vendor => {
    const purchases = history.reduce((sum, day) => {
      const result = day.purchasesByVendor?.[vendor.id];
      return { quantity: sum.quantity + (result?.quantity ?? 0), gold: sum.gold + (result?.gold ?? 0) };
    }, { quantity: 0, gold: 0 });
    return { vendor, ...purchases };
  }).filter(row => row.quantity > 0 || row.gold > 0);
  const missedResults = history.flatMap(day => day.customerResults ?? [])
    .filter(result => result.price === null)
    .reduce<Record<string, number>>((counts, result) => {
      counts[result.result] = (counts[result.result] ?? 0) + 1;
      return counts;
    }, {});
  const max = Math.max(1, ...history.map(day => day.revenue));
  const selected = history.find(day => day.day === selectedDay);
  return <>
    <p className="ledger-intro">Recorded trading results. Cash flow, cost of goods sold, and profit are separate measures.</p>
    <label className="ledger-filter">Town filter<select value={townFilter} onChange={event => setTownFilter(event.target.value)}>
      <option value="all">All towns</option>{TOWNS.map(town => <option key={town.id} value={town.id}>{town.name}</option>)}
    </select></label>
    <div className="ledger-metrics">
      <div><span>Revenue</span><strong>{money(total.revenue)}</strong></div><div><span>COGS</span><strong>{money(total.costs)}</strong></div>
      <div><span>Gross profit</span><strong>{money(total.profit)}</strong></div><div><span>Gross margin</span><strong>{total.revenue ? `${Math.round(total.profit / total.revenue * 100)}%` : '—'}</strong></div>
      <div><span>Sales conversion</span><strong>{history.length ? `${Math.round(total.sold / (history.length * 8) * 100)}%` : '—'}</strong></div>
      <div><span>Units sold</span><strong>{total.sold}</strong></div>
    </div>
    {!history.length ? <p className="ledger-empty">Close your first shop day to begin tracking performance.</p> : <>
      <section className="performance-chart" aria-label="Daily revenue and profit chart">
        <h3>Revenue and profit by day</h3><div className="performance-bars">{history.map(day => <button type="button" key={day.day}
          className={selectedDay === day.day ? 'selected' : ''} onClick={() => setSelectedDay(day.day)}
          aria-label={`Day ${day.day}: revenue ${day.revenue} gold, profit ${day.profit} gold`}>
          <span className="bar-pair"><i style={{ height: `${Math.max(3, day.revenue / max * 100)}%` }} /><b style={{ height: `${Math.max(3, Math.max(0, day.profit) / max * 100)}%` }} /></span>
          <small>Day {day.day}</small></button>)}</div><p className="chart-legend"><i /> Revenue <b /> Profit</p>
      </section>
      {selected && (() => {
        const before = state.history.filter(day => day.day < selected.day);
        const startingGold = selected.startingGold ?? 100 + before.reduce((sum, day) => sum + day.revenue - day.purchases, 0);
        const endingGold = selected.endingGold ?? startingGold - selected.purchases + selected.revenue;
        return <>
          <p className="selected-day">Day {selected.day} · {townName(selected.townId)} · Revenue {money(selected.revenue)} · COGS {money(selected.costOfSales)} · Profit {money(selected.profit)} · Wholesale {money(selected.purchases)}</p>
          <section className="ledger-analysis" aria-label={`Cash reconciliation for day ${selected.day}`}>
            <h3>Cash reconciliation · Day {selected.day}</h3>
            <p>Starting gold {money(startingGold)} − wholesale purchases {money(selected.purchases)} + sales revenue {money(selected.revenue)} = ending gold {money(endingGold)}.</p>
            <p>FIFO cost of goods sold is used to calculate profit; it is not an additional cash expense. Remaining stock value: {selected.remainingStockValue === undefined ? 'Not recorded for this day' : money(selected.remainingStockValue)}.</p>
          </section>
        </>;
      })()}
      <div className="ledger-table" role="table" aria-label="Daily shop performance">
        <div role="row" className="ledger-table-head"><span role="columnheader">Day / town</span><span role="columnheader">Revenue</span><span role="columnheader">Profit</span></div>
        {[...history].reverse().map(day => <button type="button" role="row" className="performance-row" key={day.day} onClick={() => setSelectedDay(day.day)}>
          <span role="cell">Day {day.day} · {townName(day.townId)}</span><span role="cell">{money(day.revenue)}</span><span role="cell">{money(day.profit)}</span>
        </button>)}
      </div>
      <h3>Results by commodity</h3>
      <div className="ledger-table performance-products" role="table" aria-label="Commodity performance">
        <div role="row" className="ledger-table-head"><span role="columnheader">Good</span><span role="columnheader">Sales</span><span role="columnheader">Revenue</span><span role="columnheader">FIFO cost</span><span role="columnheader">Profit</span></div>
        {commodityResults.map(row => <div role="row" key={row.good.id}>
          <span role="cell">{row.good.name}</span><span role="cell">{row.units}/{row.customers}</span><span role="cell">{money(row.revenue)}</span>
          <span role="cell">{row.costs === null ? 'Not recorded' : money(row.costs)}</span><span role="cell">{row.profit === null ? 'Not recorded' : money(row.profit)}</span>
        </div>)}
      </div>
      <h3>Results by town</h3>
      <div className="ledger-table" role="table" aria-label="Town performance">
        <div role="row" className="ledger-table-head"><span role="columnheader">Town</span><span role="columnheader">Days</span><span role="columnheader">Revenue</span><span role="columnheader">Profit</span></div>
        {townResults.map(row => <div role="row" key={row.town.id}>
          <span role="cell">{row.town.name}</span><span role="cell">{row.days}</span><span role="cell">{money(row.revenue)}</span><span role="cell">{money(row.profit)}</span>
        </div>)}
      </div>
      <h3>Vendor spending</h3>
      {!vendorResults.length ? <p className="ledger-empty">No vendor purchases in the selected history.</p> : <div className="ledger-table" role="table" aria-label="Vendor spending">
        <div role="row" className="ledger-table-head"><span role="columnheader">Vendor</span><span role="columnheader">Units</span><span role="columnheader">Gold spent</span></div>
        {vendorResults.map(row => <div role="row" key={row.vendor.id}>
          <span role="cell">{row.vendor.name}</span><span role="cell">{row.quantity}</span><span role="cell">{money(row.gold)}</span>
        </div>)}
      </div>}
      <h3>Missed sales</h3>
      {!Object.keys(missedResults).length ? <p className="ledger-empty">No recorded missed customer sales.</p> : <div className="ledger-table" role="table" aria-label="Missed sales by outcome">
        <div role="row" className="ledger-table-head"><span role="columnheader">Outcome</span><span role="columnheader">Visits</span></div>
        {Object.entries(missedResults).map(([reason, count]) => <div role="row" key={reason}>
          <span role="cell">{reason.replace(/([A-Z])/g, ' $1')}</span><span role="cell">{count}</span>
        </div>)}
      </div>}
    </>}
    {state.phase === 'report' && <button className="primary begin-next-day" disabled={busy || !online}
      onClick={() => send({ type: 'nextDay' })}>Begin next day</button>}
  </>;
}

function describeEvent(event: JournalEvent) {
  switch (event.type) {
    case 'newspaperIssued': return `Published the Day ${event.issue.day} Gazette`;
    case 'townChosen': return `Travelled to ${townName(event.townId)}`;
    case 'vendorVisited': return `Visited ${vendorName(event.vendorId)}`;
    case 'vendorLeft': return `Left ${vendorName(event.vendorId)}`;
    case 'buyingFinished': return 'Finished buying stock';
    case 'stockBought': return `Bought ${event.quantity} ${goodName(event.goodId)} from ${vendorName(event.vendorId)} for ${money(event.total)}`;
    case 'shelfSet': return event.goodId ? `Set shelf ${event.slot + 1}: ${goodName(event.goodId)} at ${money(event.price)}` : `Cleared shelf ${event.slot + 1}`;
    case 'displayRestocked': return `Refilled display ${event.slot + 1} with ${event.quantity} ${goodName(event.goodId)}`;
    case 'shopOpened': return 'Opened the shop';
    case 'customerServed': return ['sold', 'offerAccepted', 'priceHeld'].includes(event.outcome)
      ? `Sold ${goodName(event.goodId)} for ${money(event.price ?? 0)}`
      : `${goodName(event.goodId)} customer outcome: ${event.outcome}`;
    case 'dayClosed': return `Closed the day with ${money(event.result.profit)} trading profit`;
  }
}

function MarketHistory({ events }: { events: JournalEvent[] }) {
  const visits = events.filter((event): event is Extract<JournalEvent, { type: 'townChosen' }> => event.type === 'townChosen');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const day = selectedDay ?? visits.at(-1)?.day;
  const visit = visits.find(item => item.day === day);
  const opened = events.find((event): event is Extract<JournalEvent, { type: 'shopOpened' }> => event.type === 'shopOpened' && event.day === day);
  const shelves = events.filter((event): event is Extract<JournalEvent, { type: 'shelfSet' }> => event.type === 'shelfSet' && event.day === day);
  const latestByShelf = opened?.shelves ?? [...shelves].reverse().filter((event, index, all) => all.findIndex(item => item.slot === event.slot) === index);
  if (!visits.length) return <p className="ledger-empty">Choose your first town to record its wholesale supply and local demand.</p>;
  return <>
    <p className="ledger-intro">Compare recorded wholesale prices, buyer ranges, and shelf prices by visit.</p>
    <label className="ledger-filter">Town visit<select value={day} onChange={event => setSelectedDay(Number(event.target.value))}>
      {visits.map(item => <option key={item.day} value={item.day}>Day {item.day} · {townName(item.townId)}</option>)}
    </select></label>
    {visit && <div className="ledger-table" role="table" aria-label={`Market history for ${townName(visit.townId)}`}>
      <div role="row" className="ledger-table-head"><span role="columnheader">Good</span><span role="columnheader">Wholesale</span><span role="columnheader">Buyer range</span></div>
      {visit.market.map(item => <div role="row" key={item.goodId}><span role="cell">{goodName(item.goodId)}</span>
        <span role="cell">{item.wholesalePrice === null ? '—' : money(item.wholesalePrice)}</span><span role="cell">{item.buyerMin}–{item.buyerMax}g</span>
      </div>)}
    </div>}
    {visit && <>
      <h3>Vendor prices · Day {day}</h3>
      <div className="ledger-table" role="table" aria-label={`Vendor prices in ${townName(visit.townId)}`}>
        <div role="row" className="ledger-table-head"><span role="columnheader">Vendor / good</span><span role="columnheader">Price</span><span role="columnheader">Stock</span></div>
        {visit.market.flatMap(item => item.vendors.flatMap(vendor => vendor.offers.map((offer, index) =>
          <div role="row" key={`${item.goodId}-${vendor.vendorId}-${index}`}>
            <span role="cell">{vendorName(vendor.vendorId)} · {goodName(item.goodId)}</span>
            <span role="cell">{money(offer.unitCost)}</span><span role="cell">{offer.quantity}</span>
          </div>)))}
      </div>
    </>}
    {!!latestByShelf.length && <section className="ledger-shelves"><h3>Recorded shelf prices · Day {day}</h3>
      {latestByShelf.map(item => <p key={item.slot}>Shelf {item.slot + 1}: {item.goodId ? `${goodName(item.goodId)} · ${money(item.price)}` : 'Empty'}</p>)}
    </section>}
  </>;
}

export function Ledger({ campaign, page, setPage, close, send, busy, online }: {
  campaign: Campaign; page: LedgerPageId; setPage: (page: LedgerPageId) => void; close: () => void;
  send: (command: Command) => void; busy: boolean; online: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  const selected = useMemo(() => pages.find(candidate => candidate.id === page) ?? pages[0], [page]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.querySelector<HTMLElement>('button')?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab' || !element) return;
      const focusable = [...element.querySelectorAll<HTMLElement>('button:not(:disabled), select, input, a[href]')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [close]);
  return <div className="ledger-backdrop">
    <section ref={dialog} className="ledger-book" role="dialog" aria-modal="true" aria-labelledby="ledger-title" tabIndex={-1}>
      <header className="ledger-book-header"><div><span className="ledger-kicker">{campaign.name} · Day {campaign.state.day}</span><h1 id="ledger-title">The shop ledger</h1></div>
        <button type="button" onClick={close} aria-label="Continue trading">Continue</button>
      </header>
      <nav className="ledger-nav" aria-label="Ledger pages">
        {pages.map(item => <button type="button" key={item.id} className={page === item.id ? 'active' : ''}
          aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}>{item.title}</button>)}
      </nav>
      <div className="ledger-content" key={page}><h2>{selected.title}</h2>{selected.render({ state: campaign.state, send, busy, online })}</div>
      <footer className="ledger-book-footer"><span>Campaign record · Revision {campaign.revision}</span><button type="button" onClick={close}>Continue trading</button></footer>
    </section>
  </div>;
}
