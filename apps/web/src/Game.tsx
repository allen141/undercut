import { useEffect, useRef, useState } from 'react';
import { GOODS, inventoryValue, quantity } from '@undercut/game-core';
import type { Command } from '@undercut/contracts';
import type { Campaign } from './App.js';
import type { ShopController } from './CanvasShop.js';

export type GameProps = {
  campaign: Campaign;
  busy: boolean;
  online: boolean;
  pending: boolean;
  error: string;
  send: (command?: Command) => void;
  back: () => void;
};

export function Game(props: GameProps) {
  const viewport = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const controller = useRef<ShopController | null>(null);
  const latest = useRef(props);
  const [view, setView] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

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
      const shop = await mountShop(stage.current!, controls.current!, () => latest.current);
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
    latest.current = props;
    controller.current?.update();
  }, [props]);

  const { campaign, busy, online, pending, error } = props;
  const state = campaign.state;
  const announcement = !online ? 'You’re offline. Reconnect to continue trading.' : error || (
    busy ? 'Saving…' : pending ? 'An action needs confirmation.' :
    state.phase === 'open' ? state.log.at(-1) ?? 'The shop is open.' :
    `Day ${state.day}. ${state.gold} gold. Progress saved.`);

  return <main ref={viewport} className="canvas-game" aria-label={campaign.name} aria-busy={busy} data-revision={campaign.revision}>
    <div className="canvas-stage" ref={stage} />
    <div className="canvas-controls" ref={controls} aria-label="Shop controls" />
    <div className="canvas-announcement">
      {error && <p role="alert">{error}</p>}
      <p role="status" data-canvas-status>{announcement}</p>
      <p data-canvas-revision>Revision {campaign.revision}</p>
      <p data-canvas-stock>Stock: {GOODS.map(item => `${item.name} ${quantity(state, item.id)}`).join(', ')}. Value {inventoryValue(state)}g.</p>
      {state.phase === 'report' && <dl aria-label="Daily report" data-canvas-report>
        <dt>Sales revenue</dt><dd>{state.revenue}g</dd>
        <dt>Cost of goods sold</dt><dd>{state.costOfSales}g</dd>
        <dt>Trading profit</dt><dd>{state.revenue - state.costOfSales}g</dd>
        <dt>Stock purchased today</dt><dd>{state.purchases}g</dd>
        <dt>Cash remaining</dt><dd>{state.gold}g</dd>
        <dt>Unsold stock at cost</dt><dd>{inventoryValue(state)}g</dd>
      </dl>}
      {state.log.length > 0 && <ol aria-label="Counter ledger" data-canvas-ledger>
        {state.log.map((entry, index) => <li key={index}>{entry}</li>)}
      </ol>}
    </div>
    {view !== 'ready' && <div className="canvas-recovery">
      {view === 'loading' ? <p>Opening the shop…</p> : <>
        <p>WebGL couldn’t start. Check that hardware acceleration is enabled and try again.</p>
        <button onClick={() => { setView('loading'); setAttempt(n => n + 1); }}>Try again</button>
        <button onClick={props.back}>All campaigns</button>
      </>}
    </div>}
  </main>;
}
