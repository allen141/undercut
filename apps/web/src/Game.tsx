import { useCallback, useEffect, useRef, useState } from 'react';
import { CUSTOMERS_PER_DAY, GOODS, inventoryValue, quantity } from '@undercut/game-core';
import type { Command } from '@undercut/contracts';
import type { Campaign } from './App.js';
import type { ShopController } from './CanvasShop.js';
import { Ledger, type LedgerPageId } from './Ledger.js';

export type GameProps = {
  campaign: Campaign;
  busy: boolean;
  online: boolean;
  pending: boolean;
  error: string;
  send: (command?: Command) => void;
  back: () => void;
  openLedger?: (page?: LedgerPageId) => void;
};

export type BusinessPresentation = { served: number; announcement: string };

export function Game(props: GameProps) {
  const viewport = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const reading = useRef<HTMLDivElement>(null);
  const controller = useRef<ShopController | null>(null);
  const latest = useRef(props);
  const [view, setView] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [business, setBusiness] = useState<BusinessPresentation | null>(null);
  const initialPage: LedgerPageId = props.campaign.state.phase === 'report' ? 'performance'
    : props.campaign.state.phase === 'travel' ? 'markets'
      : props.campaign.state.buyingComplete ? 'merchandising' : 'suppliers';
  const [ledgerPage, setLedgerPage] = useState<LedgerPageId>(initialPage);
  const [ledgerOpen, setLedgerOpen] = useState(props.campaign.state.phase !== 'open');
  const openLedger = useCallback((page: LedgerPageId = 'inventory') => {
    setLedgerPage(page);
    setLedgerOpen(true);
  }, []);
  const closeLedger = useCallback(() => setLedgerOpen(false), []);

  useEffect(() => {
    const { phase, buyingComplete } = props.campaign.state;
    if (phase === 'report') setLedgerPage('performance');
    else if (phase === 'travel') setLedgerPage('markets');
    else if (phase === 'prepare') setLedgerPage(buyingComplete ? 'merchandising' : 'suppliers');
    setLedgerOpen(phase !== 'open');
  }, [props.campaign.state.phase, props.campaign.state.buyingComplete, props.campaign.state.day]);

  useEffect(() => {
    const element = viewport.current;
    const visible = window.visualViewport;
    if (!element || !visible) return;

    // A fixed element follows the layout viewport. Mobile browser chrome and
    // inherited pinch zoom can expose only a smaller, offset rectangle.
    function fitVisibleViewport() {
      if (!element || !visible || visible.width <= 0 || visible.height <= 0) return;
      Object.assign(element.style, {
        width: Math.floor(visible.width) + 'px',
        height: Math.floor(visible.height) + 'px',
        left: visible.offsetLeft + 'px',
        top: visible.offsetTop + 'px',
      });
    }

    fitVisibleViewport();
    visible.addEventListener('resize', fitVisibleViewport);
    visible.addEventListener('scroll', fitVisibleViewport);
    window.addEventListener('resize', fitVisibleViewport);
    return () => {
      visible.removeEventListener('resize', fitVisibleViewport);
      visible.removeEventListener('scroll', fitVisibleViewport);
      window.removeEventListener('resize', fitVisibleViewport);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    void import('./CanvasShop.js').then(async ({ mountShop }) => {
      if (stopped) return;
      const shop = await mountShop(stage.current!, controls.current!, reading.current!, () => latest.current, setBusiness);
      if (stopped) return shop.destroy();
      controller.current = shop;
      setView('ready');
    }).catch(() => {
      if (!stopped) setView('failed');
    });
    return () => {
      stopped = true;
      controller.current?.destroy();
      controller.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    latest.current = { ...props, openLedger };
    controller.current?.update();
  }, [props, openLedger, ledgerOpen]);

  const { campaign, busy, online, pending, error } = props;
  const state = campaign.state;
  const served = business?.served ?? state.served;
  const ledger = state.log.slice(0, served);
  const unrevealed = business ? state.customerResults.filter(result => result.customerIndex >= served && result.price !== null) : [];
  const offer = state.pendingNegotiation;
  const good = offer && GOODS.find(good => good.id === offer.goodId);
  const announcement = !online ? 'You’re offline. Reconnect to continue trading.' : error || (
    busy ? 'Saving…' : pending ? 'An action needs confirmation.' :
    business?.announcement ?? (offer && good ? `Customer ${state.served + 1} offers ${offer.offer}g for ${good.name}, listed at ${offer.shelfPrice}g.` :
    state.phase === 'open' ? `${state.served} of ${CUSTOMERS_PER_DAY} customer visits. ${state.log.at(-1) ?? 'The shop is open.'}` :
    state.phase === 'report' ? `Day ${state.day} closed. Review the accounts book.` :
    `Day ${state.day}. ${state.gold} gold. Progress saved.`));

  return <main ref={viewport} className="canvas-game" aria-label={campaign.name} aria-busy={busy} data-revision={campaign.revision}>
    <div className="canvas-stage" ref={stage} />
    <div className="canvas-controls" ref={controls} role="group" aria-label="Shop controls" />
    <button className="ledger-menu" type="button" aria-label={`Open ledger · ${state.gold} gold`} onClick={() => openLedger('inventory')}>
      <span>Ledger · </span>◈ {state.gold}g
    </button>
    <div className="canvas-announcement">
      <div ref={reading} role="region" aria-label="Current book page" hidden />
      {error && <p role="alert">{error}</p>}
      <p role="status" data-canvas-status>{announcement}</p>
      <p data-canvas-revision>Revision {campaign.revision}</p>
      <p data-canvas-stock>Stock: {GOODS.map(item =>
        `${item.name} ${quantity(state, item.id) + unrevealed.filter(result => result.goodId === item.id).length}`).join(', ')}.
        {unrevealed.length === 0 && ` Value ${inventoryValue(state)}g.`}
      </p>
      {state.phase === 'report' && !business && <dl aria-label="Daily report" data-canvas-report>
        <dt>Sales revenue</dt><dd>{state.revenue}g</dd>
        <dt>Cost of goods sold</dt><dd>{state.costOfSales}g</dd>
        <dt>Trading profit</dt><dd>{state.revenue - state.costOfSales}g</dd>
        <dt>Starting gold</dt><dd>{state.gold + state.purchases - state.revenue}g</dd>
        <dt>Stock purchased today</dt><dd>{state.purchases}g</dd>
        <dt>Cash remaining</dt><dd>{state.gold}g</dd>
        <dt>Units sold</dt><dd>{state.sold}</dd>
        <dt>Unsold stock at cost</dt><dd>{inventoryValue(state)}g</dd>
      </dl>}
      {ledger.length > 0 && <ol aria-label="Counter ledger" data-canvas-ledger>
        {ledger.map((entry, index) => <li key={index}>{entry}</li>)}
      </ol>}
    </div>
    {view !== 'ready' && <div className="canvas-recovery">
      {view === 'loading' ? <p>Opening the shop…</p> : <>
        <p>WebGL couldn’t start. Check that hardware acceleration is enabled and try again.</p>
        <button onClick={() => { setView('loading'); setAttempt(n => n + 1); }}>Try again</button>
        <button onClick={props.back}>All campaigns</button>
      </>}
    </div>}
    {ledgerOpen && <Ledger campaign={campaign} page={ledgerPage} setPage={setLedgerPage} close={closeLedger}
      send={command => props.send(command)} busy={busy} online={online} />}
  </main>;
}
