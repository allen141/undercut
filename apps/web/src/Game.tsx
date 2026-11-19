import { useState } from 'react';
import type { Command } from '@undercut/contracts';
import { GOODS, TOWNS, inventoryValue, priceRange, quantity, type GoodId, type State, type Town } from '@undercut/game-core';
import type { Campaign } from './App.js';
import { ShopScene } from './ShopScene.js';

const money = (gold: number) => `${gold}g`;
const phases = [
  { id: 'travel', label: 'Choose town', title: 'Where will you open today?' },
  { id: 'prepare', label: 'Prepare shop', title: 'Stock your shelves' },
  { id: 'open', label: 'Serve customers', title: 'The door is open' },
  { id: 'report', label: 'Daily report', title: 'Daily report' },
] as const;

type TradeProps = { disabled: boolean; send: (command: Command) => void };

export function Game({ campaign, busy, online, pending, send, back }: {
  campaign: Campaign;
  busy: boolean;
  online: boolean;
  pending: boolean;
  send: (command?: Command) => void;
  back: () => void;
}) {
  const [selected, select] = useState(0);
  const state = campaign.state;
  const town = TOWNS.find(t => t.id === state.townId);
  const phase = phases.findIndex(p => p.id === state.phase);
  const disabled = busy || pending || !online;
  return <section className="game">
    <div className="game-heading">
      <div>
        <button className="text-button" onClick={back} disabled={busy || !online}>All campaigns</button>
        <h1>{campaign.name}</h1>
      </div>
      <dl className="stats">
        <div><dt>Day</dt><dd>{String(state.day).padStart(2, '0')}</dd></div>
        <div><dt>In your till</dt><dd className="gold">{money(state.gold)}</dd></div>
        <div><dt>Stock value</dt><dd>{money(inventoryValue(state))}</dd></div>
      </dl>
    </div>
    <ol className="phases" aria-label="Day progress">
      {phases.map(({ id, label }, i) => <li key={id} className={i === phase ? 'active' : i < phase ? 'done' : ''}
        aria-current={i === phase ? 'step' : undefined}><b aria-hidden="true">{i + 1}</b>{label}</li>)}
    </ol>
    {pending && <div className="notice" role="status">An action needs confirmation from the server.
      <button onClick={() => send()} disabled={busy || !online}>Confirm last action</button>
    </div>}
    <div className="game-grid">
      <div className="shop-column">
        <div className="shop-frame">
          <div className="shop-caption"><span>{town?.name ?? 'Between towns'}</span><span>{state.phase === 'open' ? 'Open' : 'Closed'}</span></div>
          <ShopScene state={state} onShelf={state.phase === 'prepare' ? select : undefined} />
        </div>
        <div className="inventory-strip" aria-label="Your stock">
          <span className="eyebrow">YOUR STOCK</span>
          {GOODS.map(g => <span key={g.id} data-good={g.id}><i style={{ background: `#${g.color.toString(16)}` }} />{g.name} <b>{quantity(state, g.id)}</b></span>)}
        </div>
        {(state.phase === 'open' || state.phase === 'report') && <section className="panel ledger">
          <h3>Counter ledger</h3>
          {state.log.length ? <ol>{state.log.map((entry, i) => <li key={i}><span>{String(i + 1).padStart(2, '0')}</span>{entry}</li>)}</ol> :
            <p className="muted">Buyer decisions appear here as you serve customers.</p>}
        </section>}
      </div>
      <section className="panel controls" aria-label="Shop controls">
        {town && <span className="eyebrow">{town.name.toUpperCase()}</span>}
        <h2>{phases[phase].title}</h2>
        {state.phase === 'travel' && <Travel disabled={disabled} send={send} />}
        {state.phase === 'prepare' && town && <Prepare state={state} town={town} selected={selected} select={select}
          revision={campaign.revision} disabled={disabled} send={send} />}
        {state.phase === 'open' && <OpenShop state={state} disabled={disabled} send={send} />}
        {state.phase === 'report' && <DailyReport state={state} disabled={disabled} send={send} />}
        <div className="save-status" role="status">{busy ? 'Saving…' : pending ? 'Waiting for confirmation' : !online ? 'Offline · last progress saved' : `Saved · revision ${campaign.revision}`}</div>
      </section>
    </div>
  </section>;
}

function Travel({ disabled, send }: TradeProps) {
  return <>
    <p className="muted">Choose one town for the day. Your stock travels with you.</p>
    <div className="towns">
      {TOWNS.map(town => <article className="town" key={town.id}>
        <div className="town-heading"><i style={{ background: town.color }} /><h3>{town.name}</h3><span>{town.specialty}</span></div>
        <details>
          <summary aria-label={`Market prices in ${town.name}`}>Market prices</summary>
          <table className="market-table" aria-label={`${town.name} market prices`}>
            <thead><tr><th scope="col">Good</th><th scope="col">Buy</th><th scope="col">Buyer range</th></tr></thead>
            <tbody>{GOODS.map(good => {
              const cost = (town.supply as Partial<Record<GoodId, number>>)[good.id];
              const { min, max } = priceRange(town, good.id);
              return <tr key={good.id}><th scope="row">{good.name}</th><td>{cost === undefined ? '—' : money(cost)}</td><td>{min}–{max}g</td></tr>;
            })}</tbody>
          </table>
        </details>
        <button disabled={disabled} onClick={() => send({ type: 'chooseTown', townId: town.id })}>Choose {town.name}</button>
      </article>)}
    </div>
    <p className="small muted">Buyer ranges show what customers may pay. Each customer wants a specific good.</p>
  </>;
}

function Prepare({ state, town, selected, select, revision, disabled, send }: TradeProps & {
  state: State; town: Town; selected: number; select: (slot: number) => void; revision: number;
}) {
  return <>
    <p className="muted">Buy locally and display up to three goods. Prices lock once you open.</p>
    <h3>Wholesaler</h3>
    <div className="wholesale">
      {Object.entries(town.supply).map(([id, cost]) => {
        const name = GOODS.find(good => good.id === id)!.name;
        const limit = Math.min(99, Math.floor(state.gold / cost));
        return <form key={id} aria-label={`Buy ${name}`} onSubmit={event => {
          event.preventDefault();
          const amount = Number(new FormData(event.currentTarget).get('quantity'));
          if (!disabled && amount <= limit) send({ type: 'buy', goodId: id, quantity: amount });
        }}>
          <div><strong>{name}</strong><span>{money(cost)} each</span></div>
          <input aria-label={`Quantity of ${name}`} name="quantity" type="number" inputMode="numeric" min="1" max={Math.max(1, limit)}
            defaultValue="1" required disabled={disabled || limit < 1} />
          <button aria-label={`Buy ${name}`} disabled={disabled || limit < 1}>Buy</button>
        </form>;
      })}
    </div>
    <h3>Your shelves</h3>
    <div className="shelf-tabs" role="group" aria-label="Choose a shelf to edit">
      {state.shelves.map((shelf, i) => <button type="button" key={i} className={selected === i ? 'selected' : ''}
        aria-pressed={selected === i} onClick={() => select(i)}>
        Shelf {i + 1}<small>{GOODS.find(good => good.id === shelf.goodId)?.name ?? 'Empty'}</small>
      </button>)}
    </div>
    <ShelfEditor key={`${selected}-${revision}`} slot={selected} state={state} town={town} disabled={disabled} send={send} />
    <button className="primary full" disabled={disabled} onClick={() => send({ type: 'open' })}>Open the shop</button>
    <p className="small muted">Eight customers will visit. Serve them at your own pace.</p>
  </>;
}

function ShelfEditor({ slot, state, town, disabled, send }: TradeProps & { slot: number; state: State; town: Town }) {
  const shelf = state.shelves[slot];
  const [good, setGood] = useState<GoodId | ''>(shelf.goodId ?? '');
  const range = good ? priceRange(town, good) : null;
  const count = good ? quantity(state, good) : 0;
  return <form className="shelf-editor" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!disabled) send({ type: 'shelf', slot, goodId: good || null, price: good ? Number(data.get('price')) : 1 });
  }}>
    <label>Display good<select value={good} onChange={event => setGood(event.target.value as GoodId | '')} disabled={disabled}>
      <option value="">Empty shelf</option>
      {GOODS.filter(item => item.id === shelf.goodId || (quantity(state, item.id) > 0 && !state.shelves.some(s => s.goodId === item.id)))
        .map(item => <option key={item.id} value={item.id}>{item.name} ({quantity(state, item.id)} in stock)</option>)}
    </select></label>
    {range && <>
      <label>Price per item<input key={good} name="price" type="number" inputMode="numeric" min="1" max="10000"
        defaultValue={good === shelf.goodId ? shelf.price : range.min} required disabled={disabled} /></label>
      <p className="small muted">Customers here pay {range.min}–{range.max}g for {GOODS.find(item => item.id === good)?.name.toLowerCase()}.</p>
      {count === 0 && <p className="small muted">This item is sold out. Restock or choose another good to update this shelf.</p>}
    </>}
    <button disabled={disabled || (!!good && count === 0)}>Save shelf {slot + 1}</button>
  </form>;
}

function OpenShop({ state, disabled, send }: TradeProps & { state: State }) {
  const customer = state.customers[state.served];
  return <>
    <div className="customer-card">
      <span className="eyebrow">{customer ? `CUSTOMER ${state.served + 1} OF 8` : 'ALL CUSTOMERS SERVED'}</span>
      <h3>{customer ? `Looking for ${GOODS.find(good => good.id === customer.goodId)?.name}` : 'Time to count the till'}</h3>
      <p>{customer ? 'The customer buys if the item is on display, in stock, and within budget.' : 'Your remaining stock carries over to tomorrow.'}</p>
    </div>
    <button className="primary full" disabled={disabled} onClick={() => send({ type: customer ? 'serve' : 'close' })}>
      {customer ? 'Serve customer' : 'Close & review day'}
    </button>
    <div className="mini-stats"><span>Sales <b>{state.sold}</b></span><span>Revenue <b>{money(state.revenue)}</b></span></div>
  </>;
}

function DailyReport({ state, disabled, send }: TradeProps & { state: State }) {
  return <>
    <p className="muted">{state.sold} of 8 customers made a purchase.</p>
    <dl className="report">
      <div><dt>Sales revenue</dt><dd>{money(state.revenue)}</dd></div>
      <div><dt>Cost of goods sold</dt><dd>{money(state.costOfSales)}</dd></div>
      <div className="profit"><dt>Trading profit</dt><dd>{money(state.revenue - state.costOfSales)}</dd></div>
      <div><dt>Stock purchased today</dt><dd>{money(state.purchases)}</dd></div>
      <div><dt>Cash remaining</dt><dd>{money(state.gold)}</dd></div>
      <div><dt>Unsold stock at cost</dt><dd>{money(inventoryValue(state))}</dd></div>
    </dl>
    <p className="small muted">Profit deducts the original cost of sold items. Unsold stock stays in your inventory.</p>
    <button className="primary full" disabled={disabled} onClick={() => send({ type: 'nextDay' })}>Begin day {state.day + 1}</button>
  </>;
}
