import { AccessibilitySystem, Application, Container, Graphics, Rectangle, Sprite, Text, extensions } from 'pixi.js';
import 'pixi.js/browser';
import 'pixi.js/unsafe-eval';
import {
  CUSTOMERS_PER_DAY, GOODS, MAX_VENDOR_VISITS, REPUTATION_TIERS, TOWNS, WINDOW_SLOT_INDEX,
  inventoryValue, priceRange, quantity, reputationFor, vendorOffersForTown, vendorsInTown, type CustomerResult, type GoodId,
} from '@undercut/game-core';
import type { BusinessPresentation, GameProps } from './Game.js';
import { customerPortrait, drawRoom, phaseBooks, setCoin, setGood } from './ShopArt.js';
import { loadShopTextures, placeSprite, skin } from './ShopAssets.js';
import { roomLayout, shopScale, type Bounds } from './ShopLayout.js';

extensions.remove(AccessibilitySystem);

type Rect = Bounds;
type Action = { id: string; label: string; box: Rect; run: () => void; disabled?: boolean; active?: boolean };
type Panel = 'book' | 'shelf' | 'price' | 'stock' | 'journal';
type Page = 'summary' | 'vendors' | 'activity' | 'stock';
type Playback = { index: number; until: number; start: number; revealAfter: number; revealed: boolean; negotiated: boolean };
export type ShopController = { update(): void; destroy(): void };

const visitDuration = 5000;
const visitReveal = 3780;
const visitExitDuration = 340;
const cream = 0xffe7bb;
const muted = 0xdebb98;
const gold = 0xf0bd73;
const ink = 0x281f2a;
const paperInk = 0x38262e;
const paperMuted = 0x614941;
const journalTheme = { cover: 0x632e44, edge: 0xc18a58, page: 0xf5dfbb };
const journalGoods = { meadow: 'grain', forge: 'iron', harbor: 'cloth' } as const;
const money = (n: number) => `${n}g`;
const nameOf = (id: GoodId) => GOODS.find(item => item.id === id)!.name;
const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const displayName = (slot: number) => slot === WINDOW_SLOT_INDEX ? 'Window display' : `Floor display ${slot + 1}`;
const offerName = { regular: 'Regular', dailyDeal: 'Daily deal', reputationDeal: 'Reputation deal' };

const outcomeCopy = {
  sold: ['Sale made', 'Bought at the listed price.'],
  notDisplayed: ['No sale', 'This item was not on display.'],
  soldOut: ['No sale', 'This item was sold out.'],
  overBudget: ['No sale', 'The shelf price was above their budget.'],
  offerAccepted: ['Offer accepted', 'Bought at the agreed price.'],
  priceHeld: ['Sale made', 'Bought at the shelf price.'],
  offerDeclined: ['Offer declined', 'The visitor left without buying.'],
  priceHeldLost: ['No sale', 'The visitor walked away at the shelf price.'],
} satisfies Record<CustomerResult['result'], [string, string]>;

function outcome(result: CustomerResult) {
  const [title, detail] = outcomeCopy[result.result];
  const good = nameOf(result.goodId);
  return { title, detail, good, line: `${good} · ${title}. ${detail}${result.price === null ? '' : ` You received ${money(result.price)}.`}` };
}

export async function mountShop(host: HTMLElement, keyboard: HTMLElement, reading: HTMLElement,
  props: () => GameProps, presentBusiness: (visit: BusinessPresentation | null) => void): Promise<ShopController> {
  const app = new Application();
  await app.init({
    width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight), preference: 'webgl',
    failIfMajorPerformanceCaveat: false, autoDensity: false, antialias: true, autoStart: false,
    resolution: Math.min(devicePixelRatio || 1, 2), background: 0x171b25,
  });
  const textures = await loadShopTextures().catch(error => {
    app.destroy();
    throw error;
  });
  host.append(app.canvas);
  app.canvas.setAttribute('aria-hidden', 'true');
  app.canvas.dataset.renderer = app.renderer.name;

  let previous = props().campaign;
  let panel: Panel | null = previous.state.pendingNegotiation ? 'book' : null;
  let page: Page = 'summary';
  let pageIndex = 0;
  let journalArticle: number | null = null;
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
  let playback: Playback | undefined;
  let animationClock: ReturnType<typeof setTimeout> | undefined;
  let visitPausedAt: number | undefined;
  let visitFrame = 0;
  let lastVisitFrame = 0;
  let offerArrival: number | undefined;
  let lastPresentation: BusinessPresentation | null = null;
  let readingLayer: Container | undefined;
  let lastReadout = '';
  const semantic = new Map<string, HTMLButtonElement>();
  let focusBounds = new Map<string, Rect>();
  const visualViewport = window.visualViewport;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const art = new Container();
  const visitArt = new Container();
  const visitor = new Container();
  const foreground = new Container();
  const reward = new Container();
  const tradedGood = new Sprite();
  const coins = Array.from({ length: 3 }, () => new Sprite(textures.coin));
  reward.addChild(tradedGood, ...coins);
  const scene = new Container();
  const focusRing = new Graphics();
  const motion = new Graphics();
  focusRing.eventMode = 'none';
  let artKey = '';
  let visitorKey = '';
  visitArt.addChild(visitor, foreground, reward);
  visitor.on('pointertap', hurryVisitor);
  app.stage.addChild(art, visitArt, scene, focusRing, motion);

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

  function drawMotion(now: number) {
    frame = 0;
    motion.clear();
    if (disposed || !transition || !panel) return;
    const end = roomLayout(w, h).page;
    const book = panel === 'journal' ? journalTheme : phaseBooks[playback ? 'open' : props().campaign.state.phase];
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
    if (!playback && props().campaign.state.pendingNegotiation) return;
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

  function paintFocus() {
    focusRing.clear();
    const name = (document.activeElement as HTMLElement | null)?.dataset.canvasAction;
    const bounds = name ? focusBounds.get(name) : undefined;
    if (bounds) focusRing.roundRect(bounds.x, bounds.y, bounds.w, bounds.h, 7).stroke({ color: gold, width: 3 });
  }

  function refreshFocus() {
    if (disposed) return;
    // Keep the event targets stable if a pointer press moves focus away from a keyboard control.
    paintFocus();
    app.render();
  }

  function sync(actions: Action[]) {
    focusBounds = new Map(actions.map(action => [action.id, action.box]));
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
        button.addEventListener('focus', () => requestAnimationFrame(refreshFocus));
        button.addEventListener('blur', () => requestAnimationFrame(refreshFocus));
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

  function paintVisit(now: number) {
    tradedGood.visible = false;
    for (const coin of coins) coin.visible = false;
    const state = props().campaign.state;
    const index = playback?.index ?? state.pendingNegotiation?.customerIndex;
    const canHurry = playback && !playback.revealed && panel === null;
    visitor.eventMode = canHurry ? 'static' : 'none';
    visitor.cursor = canHurry ? 'pointer' : 'default';
    if (index === undefined) {
      visitor.visible = false;
      return;
    }
    const layout = roomLayout(w, h);
    const body = layout.visitor;
    const key = `${state.seed}:${state.day}:${index}:${w}:${h}`;
    if (key !== visitorKey) {
      visitor.removeChildren().forEach(child => child.destroy());
      visitor.addChild(customerPortrait(textures, state.seed, index, body));
      visitor.hitArea = new Rectangle(body.x, body.y, body.w, body.h * 1.08);
      visitorKey = key;
    }
    visitor.visible = true;
    visitor.position.set(0);
    visitor.alpha = 1;
    const start = playback?.start ?? offerArrival;
    if (start === undefined || reducedMotion.matches) return;

    const elapsed = Math.max(0, now - start);
    const arrival = playback?.negotiated ? 1 : Math.min(1, elapsed / 420);
    const exit = playback ? Math.max(0, Math.min(1, 1 - (visitDuration - elapsed) / visitExitDuration)) : 0;
    const doorway = layout.door.x + layout.door.w * .77 - (body.x + body.w / 2);
    const doorDepth = layout.door.y + layout.door.h - (body.y + body.h);
    const step = Math.max((1 - arrival) ** 2, exit ** 2);
    const thinking = playback && !playback.revealed && arrival === 1 ? Math.sin(elapsed / 210) * 2 : 0;
    visitor.position.set(doorway * step, doorDepth * step - Math.sin(step * Math.PI * 2) * 4 + thinking);
    visitor.alpha = Math.min(1, .28 + arrival * 3, 1 - exit ** 2);

    if (!playback?.revealed) return;
    const result = state.customerResults.find(entry => entry.customerIndex === index);
    if (result?.price == null) return;
    const slot = state.shelves.findIndex(shelf => shelf.goodId === result.goodId);
    const display = layout.shelves[slot];
    const progress = Math.min(1, (elapsed - visitReveal) / 790);
    const animateArc = (from: number, to: number, t: number) => from + (to - from) * t;
    const customerX = body.x + body.w * .62 + visitor.x;
    const customerY = body.y + body.h * .64 + visitor.y;
    if (display && progress < .91) {
      const t = Math.min(1, progress / .75);
      const fromX = display.x + display.w * .18;
      const fromY = display.y + display.h * (slot === WINDOW_SLOT_INDEX ? .80 : .57);
      setGood(tradedGood, textures, result.goodId, animateArc(fromX, customerX, t), animateArc(fromY, customerY, t) -
        Math.sin(Math.PI * t) * 24, 18);
    }
    const coinX = layout.bell.x + layout.bell.w * .5;
    const coinY = layout.bell.y + layout.bell.h * .53;
    for (let i = 0; i < 3; i++) {
      const t = Math.max(0, Math.min(1, (progress - i * .12) / .73));
      if (t > 0 && t < 1) setCoin(coins[i], animateArc(customerX, coinX, t), animateArc(customerY, coinY, t) -
        Math.sin(Math.PI * t) * (32 + i * 12), 7, .44 + Math.abs(Math.cos(t * Math.PI * 3)) * .56);
    }
  }

  function animateVisit(now: number) {
    visitFrame = 0;
    if ((!playback && offerArrival === undefined) || disposed || document.hidden || reducedMotion.matches) return;
    const arrivalFinished = offerArrival !== undefined && now - offerArrival >= 420;
    if (arrivalFinished || now - lastVisitFrame >= 1000 / 30) {
      paintVisit(now);
      app.render();
      lastVisitFrame = now;
    }
    if (arrivalFinished) offerArrival = undefined;
    if (playback || offerArrival !== undefined) visitFrame = requestAnimationFrame(animateVisit);
  }

  function render() {
    if (disposed) return;
    scene.removeChildren().forEach(child => child.destroy({ children: true }));
    readingLayer = undefined;
    const p = props();
    const state = p.campaign.state;
    const phase = playback ? 'open' : state.phase;
    const served = playback ? playback.index + Number(playback.revealed) : state.served;
    // The server has saved the batch. Show the shop balances at the last revealed visitor.
    const remainingSales = playback ? state.customerResults.filter(result => result.customerIndex >= served && result.price !== null) : [];
    const laterRevenue = remainingSales.reduce((value, result) => value + (result.price ?? 0), 0);
    const visibleStock = (goodId: GoodId) => quantity(state, goodId) + remainingSales.filter(result => result.goodId === goodId).length;
    const receipts = state.revenue - laterRevenue;
    const cash = state.gold - laterRevenue;
    const latest = state.customerResults.find(result => result.customerIndex === served - 1);
    const latestOutcome = latest ? outcome(latest) : undefined;
    const request = playback ? state.customers[playback.index]?.goodId : undefined;
    const activeResult = playback?.revealed ? latestOutcome : undefined;
    const requestText = request ? `Looking for ${nameOf(request)}` : 'Arriving at the shop';
    const offer = state.pendingNegotiation;
    const nextPresentation = phase !== 'open' ? null : {
      served,
      announcement: playback
        ? `Customer ${playback.index + 1} of ${CUSTOMERS_PER_DAY}. ${activeResult?.line ?? `${requestText}.`}`
        : offer ? `Customer ${offer.customerIndex + 1} offers ${money(offer.offer)} for ${nameOf(offer.goodId)}, listed at ${money(offer.shelfPrice)}.`
          : `${served} of ${CUSTOMERS_PER_DAY} customer visits. ${latestOutcome?.line ?? state.log[served - 1] ?? 'The shop is open.'}`,
    };
    if (nextPresentation?.announcement !== lastPresentation?.announcement || nextPresentation?.served !== lastPresentation?.served) {
      presentBusiness(nextPresentation);
      lastPresentation = nextPresentation;
    }
    const theme = panel === 'journal' ? journalTheme : phaseBooks[phase];
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
      const item = new Container();
      const border = options.paper ? 0xa87958 : options.active || options.primary ? gold : 0xa77a59;
      const base = options.primary ? (options.paper ? theme.cover : 0xe4ac69)
        : options.active ? (options.paper ? 0xd4b88d : 0x755143) : options.paper ? 0xf4e4c4 : 0x382a33;
      const drawnSkin = options.paper || options.primary;
      const shape = options.hide
        ? new Graphics().roundRect(bounds.x, bounds.y, bounds.w, bounds.h, 6).stroke({ color: border, width: 2 })
        : drawnSkin
          ? skin(textures[options.primary ? 'button-primary' : 'button-secondary'], bounds, 22, 16)
          : box(item, bounds, base, border);
      if (options.hide || drawnSkin) item.addChild(shape);
      const alpha = options.hide ? 0 : options.disabled ? .62 : 1;
      shape.alpha = alpha;
      if (drawnSkin && !options.hide && options.active) {
        item.addChild(new Graphics().roundRect(bounds.x + 3, bounds.y + 3, bounds.w - 6, bounds.h - 6, 7)
          .stroke({ color: 0xaf6529, width: 2 }));
      }
      if (!options.hide) text(item, options.copy ?? title, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, {
        align: 'center', max: Math.max(26, bounds.w - 10), size: narrow ? 13 : 15,
        color: options.primary ? cream : options.paper ? paperInk : options.disabled ? muted : cream,
      });
      if (!modal || layer !== scene) {
        actions.push({ id, label: title, box: bounds, run, disabled: options.disabled, active: options.active });
        if (!options.disabled) {
          item.eventMode = 'static';
          item.hitArea = new Rectangle(bounds.x, bounds.y, bounds.w, bounds.h);
          item.cursor = 'pointer';
          item.on('pointertap', run);
          item.on('pointerover', () => { shape.alpha = options.hide ? .58 : .82; app.render(); });
          item.on('pointerout', () => { shape.alpha = alpha; app.render(); });
        }
      }
      layer.addChild(item);
    }

    const townId = phase === 'travel' ? preview?.id : undefined;
    const artShelf = panel === 'shelf' || panel === 'price' ? selectedShelf : undefined;
    const displayState = state.shelves.map(shelf => [shelf.goodId, shelf.goodId ? Math.min(5, visibleStock(shelf.goodId)) : 0]);
    const key = JSON.stringify([w, h, phase, townId ?? state.townId, artShelf, displayState]);
    if (key !== artKey) {
      art.removeChildren().forEach(child => child.destroy({ children: true }));
      foreground.removeChildren().forEach(child => child.destroy({ children: true }));
      drawRoom(art, foreground, textures, w, h, { ...state, phase }, { townId, selectedShelf: artShelf, stock: visibleStock });
      artKey = key;
    }

    box(scene, rect(margin, 10, w - 2 * margin, 48), ink, 0x946c50, .94);
    const navW = narrow ? 59 : 131;
    control(scene, 'back', 'All campaigns', rect(margin + 3, 12, navW, 44), p.back,
      { copy: narrow ? '‹ Menu' : '‹ All campaigns', disabled: p.busy || !p.online });
    control(scene, 'stock', 'Inventory and gold', rect(w - margin - (narrow ? 67 : 114), 12, narrow ? 64 : 111, 44),
      () => show('stock', 'stock'), { copy: money(cash) });
    text(scene, narrow ? `Day ${state.day} · ${town?.name ?? 'Travel'}` : `${p.campaign.name.slice(0, 36)}  /  Day ${state.day} · ${town?.name ?? 'Between towns'}`,
      w / 2, 34, { align: 'center', max: w - (narrow ? 155 : 308), serif: !narrow, size: narrow ? 13 : 17 });

    function openBook() {
      show('book', 'book');
    }

    if (town && phase !== 'travel') {
      const journalName = `${town.name} Journal`;
      const journalW = Math.min(155, layout.bay.x + layout.bay.w * .20 - margin - 13);
      control(scene, 'town-journal', `Open ${journalName}`, rect(margin + 3, 67, journalW, 44), () => {
        journalArticle = null;
        show('journal', 'town-journal');
      }, { copy: journalName });
    }

    const bookName = { travel: 'Open destination book', prepare: 'Open wholesale book', open: 'Open business book', report: 'Day’s takings' }[phase];
    control(scene, 'book', bookName, layout.book, openBook, { hide: true });
    if (!modal) {
      const { x, y, w: width, h: height } = layout.book;
      const nameplate = skin(textures['button-primary'], rect(x, y + height - 24, width, 29), 21, 12);
      scene.addChild(nameplate);
      text(scene, phaseBooks[phase].title, x + width / 2, y + height - 10,
        { serif: true, size: narrow ? 13 : 16, align: 'center', max: width - 12 });
    }
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
        const count = shelf.goodId ? visibleStock(shelf.goodId) : 0;
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

    const focusOutcome = activeResult ?? (phase === 'report' ? latestOutcome : undefined);
    if (playback && !playback.revealed && !modal) {
      const body = layout.visitor;
      control(scene, 'hurry-visitor', 'Hurry this visitor', rect(body.x, body.y, body.w, body.h * 1.08), hurryVisitor, { hide: true });
    }
    if (!modal && (playback || focusOutcome)) {
      const rightEdge = layout.portrait ? w - margin : layout.bay.x - 13;
      const cardW = Math.min(narrow ? 298 : 370, rightEdge - margin - 6);
      const cardX = Math.max(margin + 6, Math.min(rightEdge - cardW, layout.visitor.x - cardW * .35));
      const cardY = layout.portrait ? layout.page.y + 26 : Math.max(116, layout.visitor.y - 112);
      const sale = focusOutcome && latest && latest.price !== null ? latest : undefined;
      const cardAccent = sale ? gold : focusOutcome ? 0xca9986 : 0x9ba99c;
      const index = playback?.index ?? latest?.customerIndex ?? served - 1;
      box(scene, rect(cardX, cardY, cardW, 103), sale ? 0x382a2d : ink, cardAccent, .97, 10);
      box(scene, rect(cardX + 1, cardY + 15, 4, 73), cardAccent, undefined, 1, 2);
      text(scene, `Customer ${index + 1} of ${CUSTOMERS_PER_DAY}`, cardX + 14, cardY + 17, { size: 12, color: cardAccent });
      const detail = focusOutcome ? `${focusOutcome.good} · ${focusOutcome.detail}` : 'Considering… Tap or click the visitor to hurry.';
      text(scene, focusOutcome?.title ?? requestText, cardX + 14, cardY + 45,
        { size: narrow ? 21 : 24, serif: true, max: cardW - (sale ? 121 : 28) });
      text(scene, detail, cardX + 14, cardY + 79, { size: narrow ? 13 : 14, max: cardW - (sale ? 115 : 28) });
      if (sale) {
        const good = new Sprite();
        const coin = new Sprite(textures.coin);
        setGood(good, textures, sale.goodId, cardX + cardW - 52, cardY + 48, 27);
        setCoin(coin, cardX + cardW - 79, cardY + 77, 9);
        scene.addChild(good, coin);
        text(scene, `+${money(sale.price!)}`, cardX + cardW - 65, cardY + 77, { size: 19, color: gold });
      }
    }

    const tip = !p.online ? 'You’re offline. Reconnect to continue trading.' : p.error || (
      p.busy ? 'Saving…' : p.pending ? 'Confirm your last action.' :
      phase === 'travel' ? 'Turn the door dial or open the atlas to choose a town.' :
      phase === 'prepare' ? state.buyingComplete ? 'Set up your displays and open the shop.' : 'Open the supplier ledger to compare vendors.' :
      phase === 'open' ? latestOutcome?.line ?? state.log[served - 1] ?? 'The shop is open. Customers are on their way.' :
      'The shop is closed. Review your accounts when ready.');
    if (!modal || !layout.portrait) {
      box(scene, rect(margin, h - 43, w - margin * 2, 35), ink, 0x76574b, .94);
      text(scene, tip, w / 2, h - 25, { align: 'center', max: w - margin * 2 - 14, size: narrow ? 11 : 13, color: p.error ? 0xffbcb0 : muted });
    }
    if (!modal && p.pending && p.online && !p.busy) {
      control(scene, 'retry', 'Confirm last action', rect(w / 2 - 88, h - 102, 176, 44), () => p.send(), { primary: true });
    }

    if (panel) {
      const overlay = new Container();
      readingLayer = overlay;
      if (transition?.kind === 'open') overlay.alpha = Math.max(0, (performance.now() - transition.start - 103) / 167);
      scene.addChild(overlay);
      const { page: reading, bay } = layout;
      const shade = new Graphics();
      const right = bay.x + bay.w + 12;
      const bottom = bay.y + bay.h + 13;
      shade.rect(0, 0, w, bay.y - 9).rect(0, bay.y - 9, bay.x - 10, bottom - bay.y + 9)
        .rect(right, bay.y - 9, w - right, bottom - bay.y + 9).rect(0, bottom, w, h - bottom)
        .fill({ color: 0x14111d, alpha: .18 });
      shade.eventMode = 'static';
      shade.on('pointertap', close);
      overlay.addChild(shade);
      const { x, y } = reading;
      const rw = reading.w, rh = reading.h;
      box(overlay, rect(x - 4, y + 4, rw + 8, rh + 6), 0x1a1720, undefined, .55, 12);
      const parchment = skin(textures['panel-large'], reading, 32, 28);
      parchment.eventMode = 'static';
      parchment.hitArea = new Rectangle(0, 0, rw, rh);
      overlay.addChild(parchment);
      const grain = placeSprite(textures.parchment, rect(x + 13, y + 51, rw - 26, rh - 70));
      grain.alpha = .28;
      overlay.addChild(grain);
      const left = x + 20;
      const inner = rw - 40;
      const foot = rh - 64;
      const title = (copy: string, max = inner - 43) => {
        readingTitle = copy;
        overlay.addChild(skin(textures['button-primary'], rect(left - 2, y + 9, max + 1, 40), 22, 15));
        text(overlay, copy, left + 15, y + 29, { serif: true, size: narrow ? 19 : 21, max: max - 31 });
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
      if (panel === 'journal' && town) {
        const goodId = journalGoods[town.id];
        const listedPrice = (day: number) => Math.min(...Object.values(vendorOffersForTown({
          seed: state.seed, day, vendorReputation: {},
        }, town.id)).flat().filter(offer => offer.kind === 'regular' && offer.goodId === goodId).map(offer => offer.unitCost));
        const days = Math.min(state.day, 5);
        const prices = Array.from({ length: days }, (_, index) => {
          const day = state.day - days + index + 1;
          return { day, price: listedPrice(day) };
        });
        const offers = state.marketDay === state.day && state.townId === town.id
          ? state.vendorOffers : vendorOffersForTown(state, town.id);
        const news = vendorsInTown(town.id).flatMap(vendor => {
          const deal = offers[vendor.id]?.find(offer => offer.kind === 'dailyDeal');
          if (!deal) return [];
          return [{
            title: `${vendor.name} · ${nameOf(deal.goodId)} ${money(deal.unitCost)}`,
            source: vendor.name,
            detail: deal.quantity === 0 ? 'Today’s deal is sold out.'
              : `${deal.quantity} ${nameOf(deal.goodId).toLowerCase()} available at ${money(deal.unitCost)} per unit today.`,
          }];
        });
        title(`${town.name} Journal`);
        const article = journalArticle === null ? undefined : news[journalArticle];
        if (article) {
          button('journal-overview', 'Back to journal', 0, 55, inner, () => {
            const index = journalArticle;
            journalArticle = null;
            focus(`journal-news-${index}`);
            animate('turn');
            render();
          }, { copy: '‹ Journal' });
          words(article.source, 0, 131, { serif: true, size: 19, max: inner });
          rule(154);
          note(article.detail, 184);
        } else {
          const split = Math.round(inner * .40);
          words('Town report', 0, 75, { serif: true, size: 16, max: split - 5 });
          words('Local specialty', 0, 104, { size: 12, color: paperMuted, max: split - 8 });
          words(town.specialty, 0, 133, { serif: true, size: 16, max: split - 8 });
          words('Market history', split + 12, 75, { serif: true, size: 16, max: inner - split - 13 });
          words(`${nameOf(goodId)} · regular price`, split + 12, 99, { size: 12, color: paperMuted, max: inner - split - 13 });
          const plot = rect(left + split + 34, y + 118, inner - split - 42, 65);
          const min = Math.max(0, Math.min(...prices.map(point => point.price)) - 1);
          const max = Math.max(...prices.map(point => point.price)) + 1;
          const chart = new Graphics();
          chart.moveTo(left + split, y + 62).lineTo(left + split, y + 202).stroke({ color: 0xb28d70, width: 1 });
          for (const fraction of [0, .5, 1]) {
            const row = plot.y + fraction * plot.h;
            chart.moveTo(plot.x, row).lineTo(plot.x + plot.w, row).stroke({ color: 0xba9575, alpha: .65, width: 1 });
          }
          words(money(max), split + 29, 118, { align: 'right', size: 10, color: paperMuted });
          words(money(min), split + 29, 183, { align: 'right', size: 10, color: paperMuted });
          const points = prices.map(({ price }, index) => ({
            x: plot.x + plot.w * (days === 1 ? .5 : index / (days - 1)),
            y: plot.y + plot.h * ((max - price) / (max - min)),
          }));
          if (points.length > 1) {
            chart.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach(point => chart.lineTo(point.x, point.y));
            chart.stroke({ color: 0x843a59, width: 2.5 });
          }
          points.forEach(point => chart.circle(point.x, point.y, 3).fill(0x843a59));
          overlay.addChild(chart);
          prices.forEach(({ day, price }, index) => {
            text(overlay, `D${day}`, points[index].x, plot.y + plot.h + 13, { align: 'center', color: paperMuted, size: 10 });
            readingLines.push(`Day ${day}, ${money(price)}`);
          });
          rule(213);
          words('Market news', 0, 228, { serif: true, size: 16 });
          if (!news.length) note('There are no market notices today.', 265);
          news.forEach((notice, index) => button(`journal-news-${index}`, notice.title, 0, 242 + index * 46, inner, () => {
            journalArticle = index;
            focus('journal-overview');
            animate('turn');
            render();
          }, { copy: `${notice.title}  ›` }));
        }
      }
      if (panel === 'stock') {
        title('Stock chest');
        GOODS.forEach((good, i) => line(good.name, String(visibleStock(good.id)), 65 + i * 32));
        rule(249);
        if (!playback) line('Stock value at cost', money(inventoryValue(state)), 269);
        line('Cash remaining', money(cash), 299);
      }
      if (panel === 'book' && phase === 'travel') {
        title('Route Atlas');
        const cell = (inner - 12) / 3;
        TOWNS.forEach((destination, i) => button(`preview-${destination.id}`, `Preview ${destination.name}`,
          i * (cell + 6), 56, cell, () => {
            selectedTown = i;
            animate('turn');
            render();
          }, { copy: destination.name, active: i === selectedTown }));
        const destination = preview ?? TOWNS[0];
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
        button('retry', 'Confirm last action', 0, foot, inner, () => p.send(), { primary: true });
      }
      if (layout.portrait && (p.error || !p.online || p.busy)) {
        text(overlay, tip, x + rw / 2, y + rh - 12, { align: 'center', color: paperInk, size: 10, max: inner });
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
    paintFocus();
    paintVisit(performance.now());
    if ((playback || offerArrival !== undefined) && !visitFrame && !reducedMotion.matches && !document.hidden) {
      visitFrame = requestAnimationFrame(animateVisit);
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
    }, reducedMotion.matches ? 0 : 260);
  }

  function showOutcome() {
    const { state } = props().campaign;
    if (state.pendingNegotiation) {
      if (panel !== 'book') animate('open');
      else animate('turn');
      panel = 'book';
      returnFocus = 'book';
      focus('accept-offer', true);
      if (!reducedMotion.matches && !document.hidden) offerArrival = performance.now();
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

  function startVisit(index: number, until: number, negotiated: boolean) {
    offerArrival = undefined;
    playback = { index, until, start: performance.now(), revealAfter: visitReveal, revealed: false, negotiated };
    render();
    // Count the visit from the first rendered frame, even when drawing the room takes time.
    playback.start = performance.now();
    visitPausedAt = document.hidden ? playback.start : undefined;
    scheduleVisit();
  }

  function scheduleVisit() {
    clearTimeout(animationClock);
    if (!playback || document.hidden) return;
    const deadline = playback.revealed ? visitDuration : playback.revealAfter;
    animationClock = setTimeout(advanceVisit, Math.max(0, playback.start + deadline - performance.now()));
  }

  function hurryVisitor() {
    if (!playback || playback.revealed || panel !== null || document.hidden) return;
    playback.revealAfter = Math.min(playback.revealAfter, performance.now() - playback.start + 120);
    scheduleVisit();
  }

  function advanceVisit() {
    if (!playback || disposed || document.hidden) return;
    if (!playback.revealed) {
      // A slow frame must still give the revealed result its full time on screen.
      playback.start = performance.now() - visitReveal;
      playback.revealed = true;
      render();
      playback.start = performance.now() - visitReveal;
      scheduleVisit();
      return;
    }
    const next = playback.index + 1;
    if (next < playback.until) startVisit(next, playback.until, false);
    else {
      playback = undefined;
      showOutcome();
    }
  }

  function visitVisibility() {
    if (document.hidden) {
      if (playback) visitPausedAt = performance.now();
      clearTimeout(animationClock);
    } else if (playback && visitPausedAt !== undefined) {
      playback.start += performance.now() - visitPausedAt;
      visitPausedAt = undefined;
      render();
      scheduleVisit();
    }
  }

  function update() {
    const campaign = props().campaign;
    const current = campaign.state;
    const prior = previous.state;
    let renderOutcome = false;
    let firstVisit: number | undefined;
    if (campaign.revision !== previous.revision) {
      if (prior.phase === 'open' && current.day === prior.day && current.served > prior.served) {
        if (playback) playback.until = current.served;
        else firstVisit = prior.served;
        if (prior.pendingNegotiation) {
          focus('book');
          panel = null;
          transition = undefined;
          motion.clear();
        }
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
    if (firstVisit !== undefined) startVisit(firstVisit, current.served, !!prior.pendingNegotiation);
    else if (renderOutcome) showOutcome();
    else {
      render();
      scheduleService();
    }
  }

  function resize() {
    if (disposed) return;
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    const nextScale = shopScale(width, height, visualViewport?.scale);
    if (width === backingWidth && height === backingHeight && nextScale === scale) return;
    backingWidth = width;
    backingHeight = height;
    scale = nextScale;
    w = width / scale;
    h = height / scale;
    transition = undefined;
    motion.clear();
    art.scale.set(scale);
    visitArt.scale.set(scale);
    scene.scale.set(scale);
    focusRing.scale.set(scale);
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
      offerArrival = undefined;
      cancelAnimationFrame(visitFrame);
      visitFrame = 0;
    }
    render();
    scheduleService();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  visualViewport?.addEventListener('resize', resize);
  keyboard.addEventListener('keydown', onKey);
  reducedMotion.addEventListener('change', motionPreference);
  document.addEventListener('visibilitychange', visitVisibility);
  if (previous.state.pendingNegotiation) focus('accept-offer', true);
  resize();
  scheduleService();
  return {
    update,
    destroy() {
      disposed = true;
      observer.disconnect();
      visualViewport?.removeEventListener('resize', resize);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(visitFrame);
      clearTimeout(timer);
      clearTimeout(animationClock);
      reducedMotion.removeEventListener('change', motionPreference);
      document.removeEventListener('visibilitychange', visitVisibility);
      keyboard.removeEventListener('keydown', onKey);
      for (const button of semantic.values()) button.remove();
      reading.replaceChildren();
      reading.hidden = true;
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
