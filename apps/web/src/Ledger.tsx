import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GOODS, TOWNS, VENDORS, inventoryValue, quantity, type JournalEvent, type State } from '@undercut/game-core';
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
  { id: 'performance', title: 'Performance', render: ({ state }) => {
    const total = state.history.reduce((sum, day) => ({
      revenue: sum.revenue + day.revenue, costs: sum.costs + day.costOfSales,
      profit: sum.profit + day.profit, sold: sum.sold + day.sold,
    }), { revenue: 0, costs: 0, profit: 0, sold: 0 });
    return <>
      <p className="ledger-intro">Completed trading days in this campaign.</p>
      <div className="ledger-metrics">
        <div><span>Revenue</span><strong>{money(total.revenue)}</strong></div>
        <div><span>Cost of goods sold</span><strong>{money(total.costs)}</strong></div>
        <div><span>Trading profit</span><strong>{money(total.profit)}</strong></div>
        <div><span>Items sold</span><strong>{total.sold}</strong></div>
      </div>
      {!state.history.length ? <p className="ledger-empty">Close your first shop day to begin tracking performance.</p> :
        <div className="ledger-table" role="table" aria-label="Daily shop performance">
          <div role="row" className="ledger-table-head"><span role="columnheader">Day / town</span><span role="columnheader">Revenue</span><span role="columnheader">Profit</span></div>
          {[...state.history].reverse().map(day => <div role="row" key={day.day}>
            <span role="cell">Day {day.day} · {townName(day.townId)}</span><span role="cell">{money(day.revenue)}</span><span role="cell">{money(day.profit)}</span>
          </div>)}
        </div>}
    </>;
  } },
  { id: 'markets', title: 'Locations & prices', render: ({ state }) => <MarketHistory events={state.journal ?? []} /> },
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
  { id: 'merchandising', title: 'Merchandising', render: ({ state }) => <>
    <p className="ledger-intro">Set the four displays from available stock. Current listed prices and assignments are shown here.</p>
    <div className="ledger-table" role="table" aria-label="Shop displays">
      <div role="row" className="ledger-table-head"><span role="columnheader">Display</span><span role="columnheader">Good</span><span role="columnheader">Listed price</span></div>
      {state.shelves.map((shelf, slot) => <div role="row" key={slot}><span role="cell">{slot === 3 ? 'Window' : `Floor ${slot + 1}`}</span><span role="cell">{shelf.goodId ? goodName(shelf.goodId) : 'Empty'}</span><span role="cell">{shelf.goodId ? money(shelf.price) : '—'}</span></div>)}
    </div>
    <p>Assignments are edited from the shop display controls during preparation.</p>
  </> },
  { id: 'events', title: 'Events', render: ({ state }) => {
    const events = state.journal ?? [];
    if (!events.length) return <p className="ledger-empty">Campaign activity will appear here as you trade.</p>;
    return <ol className="ledger-events">{[...events].reverse().map((event, index) => <li key={`${event.day}-${events.length - index}`}>
      <span>Day {event.day}</span><strong>{describeEvent(event)}</strong>
    </li>)}</ol>;
  } },
  { id: 'gazette', title: 'Gazette', render: ({ state }) => {
    const events = state.journal ?? [];
    const days = [...new Set(state.history.map(result => result.day))].reverse();
    if (!days.length) return <p className="ledger-empty">The first edition is published after your first completed day.</p>;
    return <div className="ledger-papers">{days.map(day => {
      const edition = digest(events, day, state.history);
      return <article className="ledger-paper" key={day}>
        <span className="ledger-paper-kicker">The Merchant’s Register · Day {day}</span>
        <h2>Trade closes in {edition.location}</h2>
        <p>{edition.result ? `The shop earned ${money(edition.result.revenue)} in sales and ${money(edition.result.profit)} in trading profit.` : 'The daily account is unavailable.'}</p>
        <p>{edition.purchaseCount === null ? 'Earlier purchase details were not archived.' : edition.purchaseCount ? `${edition.purchaseCount} items entered stock.` : 'No stock purchases were recorded.'} {edition.products === null ? 'Earlier customer details were not archived.' : edition.products.length ? `Customers bought ${edition.products.map(goodName).join(', ')}.` : 'No items sold.'}</p>
        <span className="ledger-paper-caption">{edition.customers === null ? 'Edition based on the saved daily summary' : `${edition.customers} customer reports recorded`}</span>
      </article>;
    })}</div>;
  } },
];

function describeEvent(event: JournalEvent) {
  switch (event.type) {
    case 'townChosen': return `Travelled to ${townName(event.townId)}`;
    case 'vendorVisited': return `Visited ${vendorName(event.vendorId)}`;
    case 'vendorLeft': return `Left ${vendorName(event.vendorId)}`;
    case 'buyingFinished': return 'Finished buying stock';
    case 'stockBought': return `Bought ${event.quantity} ${goodName(event.goodId)} from ${vendorName(event.vendorId)} for ${money(event.total)}`;
    case 'shelfSet': return event.goodId ? `Set shelf ${event.slot + 1}: ${goodName(event.goodId)} at ${money(event.price)}` : `Cleared shelf ${event.slot + 1}`;
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
