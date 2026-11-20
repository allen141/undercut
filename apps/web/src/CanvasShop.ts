import { AccessibilitySystem, Application, Container, Graphics, Rectangle, Text, extensions } from 'pixi.js';
import 'pixi.js/browser';
import 'pixi.js/unsafe-eval';
import {
  CUSTOMERS_PER_DAY, GOODS, MAX_VENDOR_VISITS, REPUTATION_TIERS, TOWNS, WINDOW_SLOT_INDEX,
  inventoryValue, priceRange, quantity, reputationFor, vendorOffersForTown, vendorsInTown, type GoodId,
} from '@undercut/game-core';
import type { GameProps } from './Game.js';
import { drawRoom, drawVista, phaseBooks, roomLayout, type Bounds } from './ShopArt.js';

extensions.remove(AccessibilitySystem);

type Rect = Bounds;
type Action = { id: string; label: string; box: Rect; run: () => void; disabled?: boolean; active?: boolean };
type Panel = 'book' | 'shelf' | 'price' | 'stock';
type Page = 'summary' | 'vendors' | 'activity' | 'stock';
export type ShopController = { update(): void; destroy(): void };

const cream = 0xffe7bb;
const muted = 0xdebb98;
const gold = 0xf0bd73;
const ink = 0x281f2a;
const paperInk = 0x38262e;
const paperMuted = 0x614941;
const money = (n: number) => `${n}g`;
const nameOf = (id: GoodId) => GOODS.find(item => item.id === id)!.name;
const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const displayName = (slot: number) => slot === WINDOW_SLOT_INDEX ? 'Window display' : `Floor display ${slot + 1}`;
const offerName = { regular: 'Regular', dailyDeal: 'Daily deal', reputationDeal: 'Reputation deal' };

export async function mountShop(host: HTMLElement, keyboard: HTMLElement, reading: HTMLElement, props: () => GameProps): Promise<ShopController> {
  const app = new Application();
  await app.init({
    width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight), preference: 'webgl',
    failIfMajorPerformanceCaveat: false, autoDensity: false, antialias: true, autoStart: false,
    resolution: Math.min(devicePixelRatio || 1, 2), background: 0x171b25,
  });
  host.append(app.canvas);
  app.canvas.setAttribute('aria-hidden', 'true');
  app.canvas.dataset.renderer = app.renderer.name;

  let previous = props().campaign;
  let panel: Panel | null = previous.state.pendingNegotiation ? 'book' : null;
  let page: Page = 'summary';
  let pageIndex = 0;
  let selectedTown = -1;
  let selectedShelf = 0;
  let draftGood: GoodId | null = null;
  let draftPrice = 1;
  let digits = '';
  let viewedVendor = '';
  let selectedOffer = '';
  let buyCount = 1;
  let nextFocus = '';
  let returnFocus = 'book';
  let w = 1, h = 1, scale = 1;
  let backingWidth = 0, backingHeight = 0;
  let disposed = false;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attemptedRevision: number | undefined;
  let transition: { start: number; kind: 'open' | 'turn'; from: Rect } | undefined;
  let playback: { served: number; until: number } | undefined;
  let animationClock: ReturnType<typeof setTimeout> | undefined;
  let readingLayer: Container | undefined;
  let lastReadout = '';
  const semantic = new Map<string, HTMLButtonElement>();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const art = new Container();
  const scene = new Container();
  const motion = new Graphics();
  let artKey = '';
  app.stage.addChild(art, scene, motion);

  function box(layer: Container, b: Rect, fill: number, border?: number, alpha = 1, radius = 7) {
    const shape = new Graphics().roundRect(b.x, b.y, b.w, b.h, radius).fill({ color: fill, alpha });
    if (border !== undefined) shape.stroke({ color: border, width: 1.5 });
    layer.addChild(shape);
    return shape;
  }

  function text(layer: Container, value: string, x: number, y: number, options: {
    size?: number; color?: number; align?: 'left' | 'center' | 'right'; max?: number; serif?: boolean;
  } = {}) {
    const align = options.align ?? 'left';
    const label = new Text({ text: value, style: {
      fontFamily: options.serif ? 'Georgia, serif' : 'system-ui, sans-serif',
      fontSize: options.size ?? 15, fill: options.color ?? cream, align,
      wordWrap: !!options.max, wordWrapWidth: options.max ?? w, breakWords: true,
      fontWeight: options.serif ? 'bold' : '500',
    } });
    label.anchor.set(align === 'center' ? .5 : align === 'right' ? 1 : 0, .5);
    label.position.set(x, y);
    layer.addChild(label);
    return label;
  }

  function focus(id: string, force = false) {
    if (force || keyboard.contains(document.activeElement)) nextFocus = id;
  }

  function animate(kind: 'open' | 'turn') {
    if (reducedMotion.matches || document.hidden) return;
    transition = { start: performance.now(), kind, from: roomLayout(w, h).book };
    if (!frame) frame = requestAnimationFrame(drawMotion);
  }

  function spread() {
    const bay = roomLayout(w, h).bay;
    const narrow = w < 710 || bay.w < 432;
    const width = narrow ? Math.min(w - 16, 516) : bay.w;
    const height = Math.min(h - 115, Math.max(418, bay.h));
    const top = Math.max(63, Math.min(h - 52 - height, bay.y + Math.min(81, bay.h * .21)));
    return rect(narrow ? (w - width) / 2 : bay.x - Math.min(61, bay.w * .08), top, width, height);
  }

  function drawMotion(now: number) {
    frame = 0;
    motion.clear();
    if (disposed || !transition || !panel) return;
    const end = spread();
    const book = phaseBooks[playback ? 'open' : props().campaign.state.phase];
    const p = Math.min(1, (now - transition.start) / (transition.kind === 'open' ? 270 : 210));
    if (transition.kind === 'open' && readingLayer) readingLayer.alpha = Math.max(0, (p - .38) / .62);
    if (p < 1) {
      if (transition.kind === 'open') {
        const t = 1 - Math.pow(1 - p, 2);
        const from = transition.from;
        const interpolate = (a: number, b: number) => a + (b - a) * t;
        motion.roundRect(interpolate(from.x, end.x), interpolate(from.y, end.y),
          interpolate(from.w, end.w), interpolate(from.h, end.h), 8)
          .fill({ color: book.cover, alpha: 1 - p }).stroke({ color: book.edge, width: 3, alpha: 1 - p });
      } else {
        const fold = end.x + end.w * (1 - p * .88);
        motion.poly([fold, end.y + 13 + p * 18, end.x + end.w - 11, end.y + 11,
          end.x + end.w - 11, end.y + end.h - 11, fold + 11, end.y + end.h - 15 - p * 11])
          .fill({ color: book.page, alpha: (1 - p) * .77 }).stroke({ color: book.edge, width: 2, alpha: 1 - p });
      }
      frame = requestAnimationFrame(drawMotion);
    } else transition = undefined;
    app.render();
  }

  function show(next: Panel, origin: string, initialFocus = 'dismiss') {
    focus(initialFocus);
    if (panel !== next) animate('open');
    panel = next;
    returnFocus = origin;
    render();
  }

  function close() {
    if (props().campaign.state.pendingNegotiation) return;
    if (panel === 'price') {
      panel = 'shelf';
      focus('price');
      animate('turn');
      render();
      return;
    }
    focus(returnFocus);
    panel = panel === 'shelf' && returnFocus.startsWith('setup-') ? 'book' : null;
    if (panel) returnFocus = 'book';
    transition = undefined;
    motion.clear();
    render();
  }

  function turn(next: Page, index = 0) {
    page = next;
    pageIndex = index;
    animate('turn');
    render();
  }

  function sync(actions: Action[]) {
    const ids = new Set(actions.map(action => action.id));
    for (const [id, button] of semantic) {
      if (!ids.has(id)) { button.remove(); semantic.delete(id); }
    }
    let position = 0;
    for (const action of actions) {
      let button = semantic.get(action.id);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.canvasAction = action.id;
        semantic.set(action.id, button);
        button.addEventListener('focus', () => requestAnimationFrame(render));
        button.addEventListener('blur', () => requestAnimationFrame(render));
      }
      if (keyboard.children[position] !== button) keyboard.insertBefore(button, keyboard.children[position] ?? null);
      position++;
      const { x, y, w: width, h: height } = action.box;
      Object.assign(button.style, { left: `${x * scale}px`, top: `${y * scale}px`, width: `${width * scale}px`, height: `${height * scale}px` });
      button.textContent = action.label;
      button.setAttribute('aria-disabled', String(!!action.disabled));
      if (action.active !== undefined) button.setAttribute('aria-pressed', String(action.active));
      else button.removeAttribute('aria-pressed');
      button.onclick = () => { if (!action.disabled) action.run(); };
    }
  }

  function setup(slot: number, origin: string) {
    const { state } = props().campaign;
    selectedShelf = slot;
    draftGood = state.shelves[slot].goodId;
    draftPrice = state.shelves[slot].price;
    show('shelf', origin);
  }

  function render() {
    if (disposed) return;
    scene.removeChildren().forEach(child => child.destroy({ children: true }));
    readingLayer = undefined;
    const p = props();
    const state = p.campaign.state;
    const phase = playback ? 'open' : state.phase;
    const served = playback?.served ?? state.served;
    const laterRevenue = playback ? state.customerResults.filter(result => result.customerIndex >= served)
      .reduce((value, result) => value + (result.price ?? 0), 0) : 0;
    const receipts = state.revenue - laterRevenue;
    const theme = phaseBooks[phase];
    const town = TOWNS.find(t => t.id === state.townId);
    const preview = TOWNS[selectedTown];
    const blocked = p.busy || p.pending || !p.online || !!playback;
    const narrow = w < 710;
    const margin = narrow ? 8 : 19;
    const layout = roomLayout(w, h);
    const modal = panel !== null;
    const actions: Action[] = [];
    const readingLines: string[] = [];
    let readingTitle = 'Current book page';

    function control(layer: Container, id: string, title: string, bounds: Rect, run: () => void, options: {
      copy?: string; hide?: boolean; active?: boolean; disabled?: boolean; paper?: boolean; primary?: boolean;
    } = {}) {
      const focused = document.activeElement === semantic.get(id);
      const item = new Container();
      const border = focused ? gold : options.paper ? 0xa87958 : options.active || options.primary ? gold : 0xa77a59;
      const base = options.primary ? (options.paper ? theme.cover : 0xe4ac69)
        : options.active ? (options.paper ? 0xd4b88d : 0x755143) : options.paper ? 0xf4e4c4 : 0x382a33;
      const shape = options.hide
        ? new Graphics().roundRect(bounds.x, bounds.y, bounds.w, bounds.h, 6).stroke({ color: border, width: focused ? 3 : 2 })
        : box(item, bounds, base, border, options.disabled ? .68 : .97);
      if (options.hide) { shape.alpha = focused ? 1 : 0; item.addChild(shape); }
      if (!options.hide) text(item, options.copy ?? title, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, {
        align: 'center', max: Math.max(26, bounds.w - 10), size: narrow ? 13 : 15,
        color: options.paper ? options.primary ? cream : paperInk : options.primary ? ink : options.disabled ? muted : cream,
      });
      if (!modal || layer !== scene) {
        actions.push({ id, label: title, box: bounds, run, disabled: options.disabled, active: options.active });
        if (!options.disabled) {
          item.eventMode = 'static';
          item.hitArea = new Rectangle(bounds.x, bounds.y, bounds.w, bounds.h);
          item.cursor = 'pointer';
          item.on('pointertap', run);
          item.on('pointerover', () => { shape.alpha = options.hide ? focused ? 1 : .58 : .82; app.render(); });
          item.on('pointerout', () => { shape.alpha = options.hide && !focused ? 0 : 1; app.render(); });
        }
      }
      layer.addChild(item);
    }

    const townId = phase === 'travel' ? preview?.id : undefined;
    const artShelf = panel === 'shelf' || panel === 'price' ? selectedShelf : undefined;
    const displayState = state.shelves.map(shelf => [shelf.goodId, shelf.goodId ? Math.min(5, quantity(state, shelf.goodId)) : 0]);
    const key = JSON.stringify([w, h, phase, phase === 'open' ? served : null, townId ?? state.townId, artShelf, modal, displayState]);
    if (key !== artKey) {
      art.removeChildren().forEach(child => child.destroy({ children: true }));
      drawRoom(art, w, h, { ...state, phase, served }, { townId, selectedShelf: artShelf, bookOpen: modal });
      artKey = key;
    }

    box(scene, rect(margin, 10, w - 2 * margin, 48), ink, 0x946c50, .94);
    const navW = narrow ? 59 : 131;
    control(scene, 'back', 'All campaigns', rect(margin + 3, 12, navW, 44), p.back,
      { copy: narrow ? '‹ Menu' : '‹ All campaigns', disabled: p.busy || !p.online });
    control(scene, 'stock', 'Inventory and gold', rect(w - margin - (narrow ? 67 : 114), 12, narrow ? 64 : 111, 44),
      () => show('stock', 'stock'), { copy: money(state.gold - laterRevenue) });
    text(scene, narrow ? `Day ${state.day} · ${town?.name ?? 'Travel'}` : `${p.campaign.name.slice(0, 36)}  /  Day ${state.day} · ${town?.name ?? 'Between towns'}`,
      w / 2, 34, { align: 'center', max: w - (narrow ? 155 : 308), serif: !narrow, size: narrow ? 13 : 17 });

    function openBook() {
      show('book', 'book');
    }

    const bookName = { travel: 'Open destination book', prepare: 'Open wholesale book', open: 'Open business book', report: 'Day’s takings' }[phase];
    control(scene, 'book', bookName, layout.book, openBook, { hide: true });
    if (!modal) text(scene, theme.title, layout.book.x + layout.book.w * .52, layout.book.y + layout.book.h * .50,
      { serif: true, size: narrow ? 13 : 17, align: 'center', max: layout.book.w - 14 });
    if (phase === 'travel') {
      control(scene, 'dial', 'Turn the door dial', layout.dial, openBook, { hide: true });
      text(scene, 'Turn dial', layout.dial.x + layout.dial.w / 2, layout.dial.y + layout.dial.h + 9,
        { align: 'center', size: 12, max: 70 });
    }
    if (phase === 'prepare' && state.buyingComplete || phase === 'open') {
      layout.shelves.forEach((bounds, slot) => {
        const shelf = state.shelves[slot];
        if (phase === 'prepare') control(scene, `shelf-${slot}`, displayName(slot), bounds, () => setup(slot, `shelf-${slot}`), { hide: true });
        if (phase === 'open' && !shelf.goodId) return;
        const tagW = Math.min(bounds.w - 3, 142);
        box(scene, rect(bounds.x + (bounds.w - tagW) / 2, bounds.y + bounds.h - 15, tagW, 28), ink, 0x815e4b, .92, 4);
        const count = shelf.goodId ? quantity(state, shelf.goodId) : 0;
        const caption = shelf.goodId ? `${nameOf(shelf.goodId)} · ${phase === 'open' ? `${count} left` : money(shelf.price)}` : displayName(slot);
        text(scene, caption, bounds.x + bounds.w / 2,
          bounds.y + bounds.h - 1, { align: 'center', size: 11, max: tagW - 5 });
      });
    }
    if (phase === 'prepare' && state.buyingComplete) {
      const openW = narrow ? 126 : 145;
      const openX = Math.min(w - margin - openW, layout.bell.x + layout.bell.w + 7);
      control(scene, 'open', 'Open the shop', rect(openX, layout.bell.y + 5, openW, 44),
        () => p.send({ type: 'open' }), { primary: true, disabled: blocked });
    }

    const progress = `${served}/${CUSTOMERS_PER_DAY} visits`;
    if (phase === 'open') {
      const progressX = narrow ? w * .65 : w * .80;
      const progressY = h - 87;
      const progressW = narrow ? Math.min(154, w * .38) : 220;
      box(scene, rect(progressX - progressW / 2, progressY - 26, progressW, 52), ink, 0x946c50, .95);
      text(scene, `${progress} · ${money(receipts)}`, progressX, progressY - 9, { align: 'center', max: progressW - 10, size: 13 });
      box(scene, rect(progressX - progressW / 2 + 12, progressY + 7, progressW - 24, 6), 0x684644, undefined, 1, 3);
      if (served > 0) box(scene, rect(progressX - progressW / 2 + 12, progressY + 7,
        (progressW - 24) * served / CUSTOMERS_PER_DAY, 6), gold, undefined, 1, 3);
    }

    const tip = !p.online ? 'You’re offline. Reconnect to continue trading.' : p.error || (
      p.busy ? 'Saving…' : p.pending ? 'Confirm your last action.' :
      phase === 'travel' ? 'Turn the door dial or open the atlas to choose a town.' :
      phase === 'prepare' ? state.buyingComplete ? 'Set up your displays and open the shop.' : 'Open the supplier ledger to compare vendors.' :
      phase === 'open' ? state.log[served - 1] ?? 'The shop is open. Customers are on their way.' :
      'The shop is closed. Review your accounts when ready.');
    box(scene, rect(margin, h - 43, w - margin * 2, 35), ink, 0x76574b, .94);
    text(scene, tip, w / 2, h - 25, { align: 'center', max: w - margin * 2 - 14, size: narrow ? 11 : 13, color: p.error ? 0xffbcb0 : muted });
    if (!modal && p.pending && p.online && !p.busy) {
      control(scene, 'retry', 'Confirm last action', rect(w / 2 - 88, h - 102, 176, 44), () => p.send(), { primary: true });
    }

    if (panel) {
      const overlay = new Container();
      readingLayer = overlay;
      if (transition?.kind === 'open') overlay.alpha = Math.max(0, (performance.now() - transition.start - 103) / 167);
      scene.addChild(overlay);
      const shade = new Graphics().rect(0, 0, w, h).fill({ color: 0x14111d, alpha: .24 });
      shade.eventMode = 'static';
      shade.on('pointertap', close);
      overlay.addChild(shade);
      const reading = spread();
      const { x, y } = reading;
      const rw = reading.w, rh = reading.h;
      box(overlay, rect(x - 4, y + 4, rw + 8, rh + 6), 0x1a1720, undefined, .55, 12);
      box(overlay, reading, theme.cover, theme.edge, 1, 10).eventMode = 'static';
      box(overlay, rect(x + 9, y + 10, rw - 18, rh - 18), 0xb99a79, undefined, 1, 5);
      box(overlay, rect(x + 10, y + 6, rw / 2 - 9, rh - 17), theme.page, undefined, 1, 5);
      box(overlay, rect(x + rw / 2 - 1, y + 6, rw / 2 - 9, rh - 17), theme.page, undefined, 1, 5);
      overlay.addChild(new Graphics().rect(x + rw / 2 - 2, y + 12, 4, rh - 28).fill({ color: 0x9a735f, alpha: .17 })
        .moveTo(x + 15, y + rh - 13).lineTo(x + rw / 2 - 2, y + rh - 11)
        .lineTo(x + rw - 15, y + rh - 13).stroke({ color: 0xe2c4a0, width: 1 }));
      const left = x + 20;
      const inner = rw - 40;
      const foot = rh - 64;
      const title = (copy: string, max = inner - 43) => {
        readingTitle = copy;
        text(overlay, copy, left, y + 29, { color: paperInk, serif: true, size: narrow ? 21 : 27, max });
      };
      const words = (copy: string, dx: number, dy: number, options: Parameters<typeof text>[4] = {}) => {
        readingLines.push(copy);
        text(overlay, copy, left + dx, y + dy, { color: paperInk, ...options });
      };
      const note = (copy: string, dy: number) => words(copy, 0, dy, { color: paperMuted, size: 13, max: inner });
      const button = (id: string, name: string, dx: number, dy: number, width: number, run: () => void,
        options: Parameters<typeof control>[5] = {}) => {
        if (options.copy && options.copy !== '×' && options.copy !== name) readingLines.push(options.copy);
        control(overlay, id, name, rect(left + dx, y + dy, width, 43), run, { paper: true, ...options });
      };
      const primary = (id: string, name: string, run: () => void, options: Parameters<typeof control>[5] = {}) =>
        button(id, name, 0, foot, inner, run, { primary: true, disabled: blocked, ...options });
      const rule = (dy: number) => overlay.addChild(new Graphics().moveTo(left, y + dy).lineTo(left + inner, y + dy)
        .stroke({ color: 0xad8769, width: 1, alpha: .58 }));
      const line = (title: string, value: string, dy: number) => {
        words(title, 0, dy, { max: inner * .67, size: 14 });
        words(value, inner, dy, { align: 'right', size: 14 });
      };

      if (!state.pendingNegotiation || playback) button('dismiss', 'Close panel', inner - 41, 8, 43, close, { copy: '×' });
      if (panel === 'stock') {
        title('Stock chest');
        GOODS.forEach((good, i) => line(good.name, String(quantity(state, good.id)), 65 + i * 32));
        rule(249);
        line('Stock value at cost', money(inventoryValue(state)), 269);
        line('Cash remaining', money(state.gold), 299);
      }
      if (panel === 'book' && phase === 'travel') {
        title('Route Atlas', inner - 136);
        const cell = (inner - 12) / 3;
        TOWNS.forEach((destination, i) => button(`preview-${destination.id}`, `Preview ${destination.name}`,
          i * (cell + 6), 56, cell, () => {
            selectedTown = i;
            animate('turn');
            render();
          }, { copy: destination.name, active: i === selectedTown }));
        const destination = preview ?? TOWNS[0];
        const illustration = new Graphics();
        const illustrationBounds = rect(left + inner - 128, y + 15, 87, 28);
        drawVista(illustration, illustrationBounds, destination.id);
        illustration.rect(illustrationBounds.x, illustrationBounds.y, illustrationBounds.w, illustrationBounds.h)
          .stroke({ color: 0xa87958, width: 1.5 });
        overlay.addChild(illustration);
        const rates = Object.entries(vendorOffersForTown(state, destination.id)).flatMap(([vendorId, offers]) =>
          offers.filter(offer => reputationFor(state, vendorId).tier >= (offer.requiredTier ?? 0)));
        note(`${destination.specialty} · ${money(state.gold)} available`, 115);
        rule(129);
        const columns = [0, inner * .39, inner * .59, inner * .80, inner - 2];
        ['Good', 'Buy', 'Demand', 'Budget', 'Held'].forEach((label, i) =>
          words(label, columns[i], 144, { align: i === 0 ? 'left' : i === 4 ? 'right' : 'center', color: paperMuted, size: 11 }));
        GOODS.forEach((good, i) => {
          const prices = rates.filter(offer => offer.goodId === good.id).map(offer => offer.unitCost);
          const low = Math.min(...prices), high = Math.max(...prices);
          const supply = !prices.length ? '—' : low === high ? money(low) : `${low}–${high}g`;
          const range = priceRange(destination, good.id);
          const demand = destination.demand[good.id];
          const row = [good.name, supply,
            demand >= 1.2 ? 'High' : demand <= .9 ? 'Low' : 'Mid', `${range.min}–${range.max}g`, String(quantity(state, good.id))];
          row.forEach((value, j) => words(value, columns[j], 170 + i * 25, {
            size: 12, align: j === 0 ? 'left' : j === 4 ? 'right' : 'center',
          }));
        });
        note('— indicates no local supply', 316);
        primary('choose-town', `Choose ${destination.name}`, () => p.send({ type: 'chooseTown', townId: destination.id }),
          { disabled: blocked || !preview });
      }

      if (panel === 'book' && phase === 'prepare' && !state.buyingComplete) {
        const vendors = vendorsInTown(state.townId);
        const active = vendors.find(vendor => vendor.id === state.activeVendorId);
        const current = viewedVendor === 'all' ? undefined : vendors.find(vendor => vendor.id === viewedVendor) ?? active;
        const visitsLeft = MAX_VENDOR_VISITS - state.visitedVendorIds.length;
        if (!current) {
          title('Supplier Ledger');
          note(`${visitsLeft} of ${MAX_VENDOR_VISITS} visits remaining · ${money(state.gold)} available`, 62);
          vendors.forEach((vendor, i) => {
            const visited = state.visitedVendorIds.includes(vendor.id);
            const offers = state.vendorOffers[vendor.id] ?? [];
            const deal = offers.find(o => o.kind === 'dailyDeal');
            const rep = reputationFor(state, vendor.id);
            const row = 88 + 68 * i;
            const compareW = Math.round((inner - 8) * .63);
            button(`compare-${vendor.id}`, `Compare ${vendor.name}`, 0, row, compareW, () => {
              viewedVendor = vendor.id;
              selectedOffer = '';
              focus('vendor-list', true);
              turn('summary');
            }, { copy: vendor.name });
            button(`visit-${vendor.id}`, `Visit ${vendor.name}`, compareW + 8, row, inner - compareW - 8, () =>
              p.send({ type: 'visitVendor', vendorId: vendor.id }), {
              copy: vendor.id === active?.id ? 'Active' : visited ? 'Visited' : 'Visit',
              disabled: blocked || !!active || visited || visitsLeft <= 0,
            });
            const dealText = deal ? ` · ${nameOf(deal.goodId)} deal ${money(deal.unitCost)}` : '';
            words(`${vendor.archetype[0].toUpperCase()}${vendor.archetype.slice(1)} · Tier ${rep.tier}${dealText}`, 3, row + 54,
              { size: 11, color: paperMuted, max: inner - 5 });
          });
          rule(292);
          note(active ? `Visiting ${active.name}. Leave before visiting another.` : 'Starting a visit uses it for the day.', 307);
        } else {
          const reputation = reputationFor(state, current.id);
          const activeHere = active?.id === current.id;
          const alreadyVisited = state.visitedVendorIds.includes(current.id);
          const offers = state.vendorOffers[current.id] ?? [];
          const offer = offers.find(o => o.id === selectedOffer);
          const perPage = 3;
          const totalPages = Math.max(1, Math.ceil(offers.length / perPage));
          const currentPage = Math.min(pageIndex, totalPages - 1);
          const discount = REPUTATION_TIERS[reputation.tier]?.discount ?? 0;
          const nextTier = REPUTATION_TIERS[reputation.tier + 1];
          title(current.name);
          const navW = (inner - 8) / 2;
          button('vendor-list', 'Compare all vendors', 0, 54, navW, () => {
            viewedVendor = 'all';
            selectedOffer = '';
            focus('dismiss', true);
            turn('summary');
          }, { copy: '‹ All vendors' });
          const leave = () => p.send({ type: 'leaveVendor' });
          if (activeHere) button('leave-vendor', 'Leave vendor', navW + 8, 54, navW, leave, { disabled: blocked });
          else button('visit-current', `Visit ${current.name}`, navW + 8, 54, navW, () =>
            p.send({ type: 'visitVendor', vendorId: current.id }),
          { disabled: blocked || !!active || alreadyVisited || visitsLeft <= 0, copy: alreadyVisited ? 'Visited' : active ? 'Visit underway' : 'Visit' });
          note(`Tier ${reputation.tier} · ${money(reputation.spent)} spent · ${Math.round(discount * 100)}% off`, 109);
          note(nextTier ? `Next tier at ${money(nextTier.threshold)} · ${money(state.gold)} available` : `Top tier · ${money(state.gold)} available`, 127);

          offers.slice(currentPage * perPage, (currentPage + 1) * perPage).forEach((row, i) => {
            const locked = reputation.tier < (row.requiredTier ?? 0);
            const stock = locked ? `Tier ${row.requiredTier} required` : row.quantity ? `${row.quantity} left` : 'Sold out';
            const good = nameOf(row.goodId);
            const controlName = row.kind === 'regular' ? `Select ${good}` : `Select ${good} ${offerName[row.kind].toLowerCase()}`;
            const rowCopy = `${good} · ${money(row.unitCost)} · ${stock}`;
            button(`offer-${row.id}`, controlName, 0, 142 + i * 44, inner, () => {
              selectedOffer = row.id;
              buyCount = 1;
              render();
            }, {
              copy: row.kind === 'regular' ? rowCopy : `${rowCopy} · ${offerName[row.kind]}`,
              active: offer?.id === row.id,
              disabled: !activeHere || locked || row.quantity === 0 || blocked,
            });
          });
          if (totalPages > 1) {
            button('previous-offers', 'Previous offers', 0, 276, 43, () => turn('summary', currentPage - 1),
              { copy: '‹', disabled: currentPage === 0 });
            button('next-offers', 'Next offers', inner - 43, 276, 43, () => turn('summary', currentPage + 1),
              { copy: '›', disabled: currentPage + 1 >= totalPages });
            if (activeHere && offer) button('finish-buying', 'Finish buying', 51, 276, inner - 102,
              () => p.send({ type: 'finishBuying' }), { disabled: blocked });
            else words(`Offers ${currentPage + 1} of ${totalPages}`, inner / 2, 297, { align: 'center', size: 12 });
          }
          if (activeHere && offer) {
            const limit = Math.min(99, offer.quantity, Math.floor(state.gold / offer.unitCost));
            const count = Math.max(1, Math.min(buyCount, limit));
            const locked = reputation.tier < (offer.requiredTier ?? 0);
            const canBuy = limit > 0 && !locked;
            const buyW = inner - 123;
            button('decrease-quantity', 'Decrease quantity', 0, foot, 39, () => { buyCount = count - 1; render(); },
              { copy: '−', disabled: blocked || count <= 1 });
            words(String(count), 55, foot + 22, { align: 'center', size: 15 });
            button('increase-quantity', 'Increase quantity', 73, foot, 39, () => { buyCount = count + 1; render(); },
              { copy: '+', disabled: blocked || count >= limit });
            button('buy', `Buy ${nameOf(offer.goodId)}`, 123, foot, buyW, () =>
              p.send({ type: 'buy', offerId: offer.id, quantity: count }),
            { copy: locked ? 'Tier locked' : offer.quantity === 0 ? 'Sold out' : !canBuy ? 'Too little gold' : `Buy · ${money(offer.unitCost * count)}`,
              primary: true, disabled: blocked || !canBuy });
          }
        }
        if (!current || !active) primary('finish-buying', 'Finish buying', () => p.send({ type: 'finishBuying' }),
          { copy: state.visitedVendorIds.length === 0 ? 'Skip buying' : 'Finish buying' });
        else if (current.id !== active.id || !selectedOffer) {
          const caption = 'Finish buying';
          primary('finish-buying', caption, () => p.send({ type: 'finishBuying' }));
        }
      }

      if (panel === 'book' && phase === 'prepare' && state.buyingComplete) {
        title('Display setup');
        state.shelves.forEach((shelf, slot) => {
          const name = displayName(slot);
          button(`setup-${slot}`, name, 0, 60 + slot * 56, inner,
            () => setup(slot, `setup-${slot}`), { copy: shelf.goodId ? `${name} · ${nameOf(shelf.goodId)} · ${money(shelf.price)}` : name });
        });
        note('Choose an in-stock good and a price for each display.', 299);
        primary('open', 'Open the shop', () => p.send({ type: 'open' }));
      }

      if (panel === 'shelf' && town) {
        title(displayName(selectedShelf));
        const available = GOODS.filter(good => quantity(state, good.id) > 0 &&
          !state.shelves.some((shelf, slot) => shelf.goodId === good.id && slot !== selectedShelf));
        const goods = [{ id: null, name: 'Empty' }, ...available];
        const cell = (inner - 10) / 3;
        goods.forEach((good, i) => button(`display-${good.id ?? 'empty'}`, good.id ? `Display ${good.name}` : 'Leave display empty',
          i % 3 * (cell + 5), 57 + Math.floor(i / 3) * 45, cell, () => {
            draftGood = good.id;
            draftPrice = good.id ? good.id === state.shelves[selectedShelf].goodId ? state.shelves[selectedShelf].price
              : priceRange(town, good.id).min : 1;
            render();
          }, { copy: good.name, active: draftGood === good.id, disabled: blocked }));
        if (draftGood) {
          const expected = priceRange(town, draftGood);
          note(`${quantity(state, draftGood)} in stock · Buyers pay ${expected.min}–${expected.max}g`, 210);
          button('decrease-price', 'Decrease price', 0, 233, 43, () => { draftPrice--; render(); }, { copy: '−', disabled: blocked || draftPrice <= 1 });
          button('price', 'Price per item', 49, 233, inner - 98, () => {
            digits = String(draftPrice);
            focus('digit-1');
            panel = 'price';
            animate('turn');
            render();
          }, { copy: money(draftPrice), disabled: blocked });
          button('increase-price', 'Increase price', inner - 43, 233, 43, () => { draftPrice++; render(); },
            { copy: '+', disabled: blocked || draftPrice >= 10000 });
        } else if (available.length === 0) note('There is no unassigned stock to display.', 210);
        primary('save-shelf', `Save ${displayName(selectedShelf).toLowerCase()}`, () =>
          p.send({ type: 'shelf', slot: selectedShelf, goodId: draftGood, price: draftGood ? draftPrice : 1 }));
      }

      if (panel === 'price') {
        title('Price per item');
        words(digits ? money(Number(digits)) : '—', inner / 2, 65, { align: 'center', size: 24, serif: true });
        const cell = (inner - 10) / 3;
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].forEach((digit, i) => button(`digit-${digit}`, `Digit ${digit}`,
          i % 3 * (cell + 5), 86 + Math.floor(i / 3) * 46, cell, () => addDigit(String(digit)), { copy: String(digit) }));
        button('clear-price', 'Clear price', cell + 5, 224, cell, () => { digits = ''; render(); }, { copy: 'Clear' });
        button('done-price', 'Done', 2 * (cell + 5), 224, cell, () => {
          draftPrice = Number(digits);
          focus('price');
          panel = 'shelf';
          animate('turn');
          render();
        }, { primary: true, disabled: Number(digits) < 1 });
      }

      if (panel === 'book' && phase === 'open') {
        const offer = playback ? null : state.pendingNegotiation;
        if (offer) {
          title('Customer offer');
          note(`Customer ${offer.customerIndex + 1} of ${CUSTOMERS_PER_DAY} · ${nameOf(offer.goodId)}`, 79);
          line('Listed price', money(offer.shelfPrice), 126);
          line('Customer offers', money(offer.offer), 157);
          rule(181);
          button('accept-offer', 'Accept offer', 0, 200, inner,
            () => p.send({ type: 'negotiate', outcome: 'acceptOffer' }), { primary: true, disabled: blocked });
          button('hold-price', 'Hold shelf price', 0, 249, inner,
            () => p.send({ type: 'negotiate', outcome: 'holdPrice' }), { disabled: blocked });
          button('decline-offer', 'Decline offer', 0, 298, inner,
            () => p.send({ type: 'negotiate', outcome: 'decline' }), { disabled: blocked });
        } else {
          title('Shop Journal');
          note(`${progress} · ${money(receipts)} receipts`, 66);
          rule(83);
          const log = state.log.slice(0, served);
          if (!log.length) note('The first customers are on their way.', 112);
          log.forEach((entry, i) => words(entry, 0, 106 + i * 29, { max: inner, size: 12 }));
        }
      }

      if (panel === 'book' && phase === 'report') {
        title('Accounts Book');
        const tabs = [['summary', 'Summary'], ['vendors', 'Vendors'], ['activity', 'Activity'], ['stock', 'Stock']] as const;
        const cell = (inner - 15) / 4;
        tabs.forEach(([tab, caption], i) => button(`report-${tab}`, caption, i * (cell + 5), 54, cell,
          () => turn(tab), { active: page === tab }));
        if (page === 'summary') {
          const profit = state.revenue - state.costOfSales;
          note(`Day ${state.day} · ${town?.name ?? 'Closing'} · ${state.sold} of ${state.served} sold`, 113);
          line('Gross profit', money(profit), 137);
          rule(151);
          line('Sales revenue', money(state.revenue), 169);
          line('Cost of goods sold', money(state.costOfSales), 194);
          line('Starting gold', money(state.gold + state.purchases - state.revenue), 219);
          line('Wholesale spending', money(state.purchases), 244);
          line('Ending gold', money(state.gold), 269);
          line('Unsold stock at cost', money(inventoryValue(state)), 294);
        }
        if (page === 'vendors') {
          const vendors = vendorsInTown(state.townId);
          if (!state.purchases) note('No wholesale purchases today.', 124);
          else if (!Object.keys(state.purchasesByVendor).length) note(`Wholesale spending: ${money(state.purchases)}`, 124);
          else vendors.forEach((vendor, i) => {
            const purchase = state.purchasesByVendor[vendor.id];
            const rep = reputationFor(state, vendor.id);
            if (!purchase) return;
            const tiersReached = REPUTATION_TIERS.filter(({ threshold }) => threshold > rep.spent - purchase.gold && threshold <= rep.spent);
            line(vendor.name, `${purchase.quantity} units · ${money(purchase.gold)}`, 126 + i * 51);
            words(tiersReached.length ? `Reached tier ${rep.tier} today` : `Reputation tier ${rep.tier} · ${money(rep.spent)} total`,
              0, 144 + i * 51, { color: paperMuted, size: 12 });
          });
        }
        if (page === 'activity') {
          const activity: string[] = [];
          if (state.customerResults.length) {
            const resultLabels = {
              sold: 'Sold at shelf price', notDisplayed: 'Not displayed', soldOut: 'Sold out', overBudget: 'Over budget',
              offerAccepted: 'Offer accepted', priceHeld: 'Sold at held price', offerDeclined: 'Offer declined', priceHeldLost: 'Held price, no sale',
            } as const;
            GOODS.forEach(good => {
              const grouped = new Map<string, number>();
              state.customerResults.filter(result => result.goodId === good.id).forEach(result => {
                const label = resultLabels[result.result];
                grouped.set(label, (grouped.get(label) ?? 0) + 1);
              });
              for (const [label, count] of grouped) activity.push(`${good.name} · ${label} ×${count}`);
            });
            state.negotiations.forEach(negotiation => {
              const decision = { acceptOffer: 'Accepted', holdPrice: 'Held price', decline: 'Declined' }[negotiation.outcome];
              const sale = negotiation.salePrice === null ? 'no sale' : money(negotiation.salePrice);
              activity.push(`${nameOf(negotiation.goodId)} · ${decision} ${money(negotiation.offer)} offer · ${sale}`);
            });
          } else activity.push(...state.log);
          const perPage = 5;
          const totalPages = Math.ceil(activity.length / perPage);
          activity.slice(pageIndex * perPage, (pageIndex + 1) * perPage).forEach((entry, i) =>
            words(entry, 0, 119 + i * 28, { max: inner, size: 12 }));
          if (activity.length === 0) note('No customer activity recorded.', 119);
          if (totalPages > 1) {
            button('previous-activity', 'Previous activity', 0, 265, 43, () => turn('activity', pageIndex - 1),
              { copy: '‹', disabled: pageIndex === 0 });
            button('next-activity', 'Next activity', inner - 43, 265, 43, () => turn('activity', pageIndex + 1),
              { copy: '›', disabled: pageIndex + 1 >= totalPages });
            words(`Page ${pageIndex + 1} of ${totalPages}`, inner / 2, 287, { align: 'center', size: 12 });
          }
        }
        if (page === 'stock') {
          GOODS.forEach((good, i) => line(good.name, String(quantity(state, good.id)), 122 + i * 27));
          line('Unsold stock at cost', money(inventoryValue(state)), 288);
        }
        primary('next-day', `Begin day ${state.day + 1}`, () => p.send({ type: 'nextDay' }));
      }

      if (p.pending && p.online && !p.busy) {
        control(overlay, 'retry', 'Confirm last action', rect(w / 2 - 88, h - 48, 176, 43), () => p.send(), { primary: true });
      }
    }

    keyboard.setAttribute('aria-label', modal ? `${readingTitle} controls` : 'Shop controls');
    sync(actions);
    reading.hidden = !modal;
    const readout = [readingTitle, ...readingLines].join('\n');
    if (modal && lastReadout !== readout) {
      reading.setAttribute('aria-label', readingTitle);
      reading.replaceChildren(...readingLines.map(copy => {
        const paragraph = document.createElement('p');
        paragraph.textContent = copy;
        return paragraph;
      }));
      lastReadout = readout;
    }
    if (nextFocus) {
      semantic.get(nextFocus)?.focus({ preventScroll: true });
      nextFocus = '';
    }
    app.render();
  }

  function addDigit(digit: string) {
    const next = Number(digits + digit);
    if (next <= 10000) digits = String(next);
    render();
  }

  function scheduleService() {
    clearTimeout(timer);
    const p = props();
    const { revision, state } = p.campaign;
    if (state.phase !== 'open' || state.pendingNegotiation || playback || p.busy || p.pending || !p.online ||
      attemptedRevision === revision) return;
    timer = setTimeout(() => {
      const latest = props();
      if (latest.campaign.revision !== revision || latest.busy || latest.pending || !latest.online) return;
      attemptedRevision = revision;
      latest.send({ type: 'serve' });
    }, reducedMotion.matches ? 0 : 750);
  }

  function showOutcome() {
    const { state } = props().campaign;
    if (state.pendingNegotiation) {
      if (panel !== 'book') animate('open');
      else animate('turn');
      panel = 'book';
      returnFocus = 'book';
      focus('accept-offer', true);
    } else if (state.phase === 'report') {
      focus('book');
      panel = null;
      page = 'summary';
      pageIndex = 0;
      transition = undefined;
      motion.clear();
    }
    render();
    scheduleService();
  }

  function playBusiness() {
    if (!playback || disposed) return;
    if (playback.served >= playback.until || reducedMotion.matches) {
      playback = undefined;
      showOutcome();
      return;
    }
    playback.served++;
    render();
    animationClock = setTimeout(playBusiness, 285);
  }

  function update() {
    const campaign = props().campaign;
    const current = campaign.state;
    const prior = previous.state;
    let renderOutcome = false;
    if (campaign.revision !== previous.revision) {
      if (prior.phase === 'open' && current.served > prior.served && !reducedMotion.matches && !document.hidden) {
        clearTimeout(animationClock);
        playback = { served: prior.served, until: current.served };
        if (prior.pendingNegotiation) {
          focus('book');
          panel = null;
          transition = undefined;
          motion.clear();
        }
        animationClock = setTimeout(playBusiness, 220);
      } else if (current.pendingNegotiation || prior.phase === 'open' && current.phase === 'report') {
        renderOutcome = true;
      } else if (current.phase !== prior.phase) {
        focus(current.phase === 'travel' ? 'dial' : 'book');
        panel = null;
        viewedVendor = '';
        selectedOffer = '';
        selectedTown = -1;
        page = 'summary';
        pageIndex = 0;
        transition = undefined;
        motion.clear();
      } else if (current.buyingComplete !== prior.buyingComplete) {
        focus('setup-0');
        pageIndex = 0;
        animate('turn');
      } else if (current.activeVendorId !== prior.activeVendorId) {
        viewedVendor = current.activeVendorId ?? 'all';
        selectedOffer = '';
        pageIndex = 0;
        buyCount = 1;
        focus(current.activeVendorId ? 'vendor-list' : 'dismiss');
        animate('turn');
      } else if (panel === 'shelf' && (current.shelves[selectedShelf].goodId !== prior.shelves[selectedShelf].goodId ||
        current.shelves[selectedShelf].price !== prior.shelves[selectedShelf].price)) {
        focus(returnFocus);
        panel = returnFocus.startsWith('setup-') ? 'book' : null;
        transition = undefined;
        motion.clear();
      } else if (panel === 'book' && current.purchases > prior.purchases) {
        buyCount = 1;
      }
    }
    previous = campaign;
    if (renderOutcome) showOutcome();
    else {
      render();
      scheduleService();
    }
  }

  function resize() {
    if (disposed) return;
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height || width === backingWidth && height === backingHeight) return;
    backingWidth = width;
    backingHeight = height;
    scale = Math.min(1, height / 505, width / 320);
    w = width / scale;
    h = height / scale;
    transition = undefined;
    motion.clear();
    art.scale.set(scale);
    scene.scale.set(scale);
    motion.scale.set(scale);
    app.renderer.resize(width, height);
    render();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && panel) {
      event.preventDefault();
      if (panel === 'price') {
        panel = 'shelf';
        focus('price');
        render();
      } else close();
    }
    if (panel === 'price' && /^\d$/.test(event.key)) {
      event.preventDefault();
      addDigit(event.key);
    }
    if (panel === 'price' && ['Backspace', 'Delete'].includes(event.key)) {
      event.preventDefault();
      digits = digits.slice(0, -1);
      render();
    }
  }

  function motionPreference() {
    if (reducedMotion.matches) {
      transition = undefined;
      motion.clear();
      if (playback) {
        clearTimeout(animationClock);
        playBusiness();
      } else render();
    }
    scheduleService();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  keyboard.addEventListener('keydown', onKey);
  reducedMotion.addEventListener('change', motionPreference);
  if (previous.state.pendingNegotiation) focus('accept-offer', true);
  resize();
  scheduleService();
  return {
    update,
    destroy() {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      clearTimeout(animationClock);
      reducedMotion.removeEventListener('change', motionPreference);
      keyboard.removeEventListener('keydown', onKey);
      for (const button of semantic.values()) button.remove();
      reading.replaceChildren();
      reading.hidden = true;
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
