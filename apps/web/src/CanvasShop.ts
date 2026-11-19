import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import { GOODS, TOWNS, inventoryValue, priceRange, quantity, type GoodId } from '@undercut/game-core';
import type { GameProps } from './Game.js';
import { drawRoom, roomLayout } from './ShopArt.js';

type Rect = { x: number; y: number; w: number; h: number };
type Action = { id: string; label: string; box: Rect; run: () => void; disabled?: boolean };
type Panel = 'market' | 'wholesale' | 'shelf' | 'price' | 'ledger' | 'stock';
export type ShopController = { update(): void; destroy(): void };

const cream = 0xffe7bb;
const muted = 0xdebb98;
const gold = 0xf0bd73;
const ink = 0x281f2a;
const money = (n: number) => `${n}g`;
const nameOf = (id: GoodId) => GOODS.find(item => item.id === id)!.name;
const rectangle = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export async function mountShop(host: HTMLElement, keyboard: HTMLElement, props: () => GameProps): Promise<ShopController> {
  const app = new Application();
  await app.init({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight),
    preference: 'webgl', autoDensity: true, antialias: true, autoStart: false,
    resolution: Math.min(devicePixelRatio || 1, 2), background: 0x171b25 });
  host.append(app.canvas);
  app.canvas.setAttribute('aria-hidden', 'true');

  let panel: Panel | null = null;
  let selectedTown = 0;
  let selectedShelf = 0;
  let draftGood: GoodId | null = null;
  let draftPrice = 1;
  let digits = '';
  let selectedSupply: GoodId | null = null;
  let buyCount = 1;
  let carriedGood: GoodId | null = null;
  let returnFocus = '';
  let nextFocus = '';
  let previous = props().campaign;
  let width = 1, height = 1, scale = 1;
  let frame = 0;
  let disposed = false;
  let effect: { start: number; from: Rect; to: Rect; color: number; kind: 'stock' | 'sale' | 'dial'; itemFrom?: Rect } | undefined;
  const semantic = new Map<string, HTMLButtonElement>();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const art = new Container();
  let artKey = '';
  const scene = new Container();
  const feedback = new Graphics();
  const motes = new Graphics();
  let ambientFrame = 0;
  let lastAmbient = -1000;
  app.stage.addChild(art, motes, scene, feedback);

  function animateAmbient(now: number) {
    if (disposed || reducedMotion.matches || document.hidden) { ambientFrame = 0; return; }
    ambientFrame = requestAnimationFrame(animateAmbient);
    if (now - lastAmbient < 1000 / 24) return;
    lastAmbient = now;
    const portal = roomLayout(width, height).door;
    const clock = now / 1000;
    motes.clear();
    for (let i = 0; i < 8; i++) {
      const travel = ((clock * (.13 + i * .008) + i * .23) % 1);
      const x = portal.x + portal.w * (.23 + (i % 4) * .17) + Math.sin(clock + i) * 8;
      const y = portal.y + portal.h * (.88 - travel * .54);
      const alpha = Math.sin(travel * Math.PI) * (.19 + (i % 3) * .055);
      motes.circle(x, y, i % 3 === 0 ? 2.2 : 1.35).fill({ color: 0xfcd18c, alpha });
    }
    app.render();
  }

  function refreshAmbient() {
    cancelAnimationFrame(ambientFrame);
    ambientFrame = 0;
    motes.clear();
    if (disposed || document.hidden) return;
    app.render();
    if (!reducedMotion.matches) ambientFrame = requestAnimationFrame(animateAmbient);
  }

  function paintBox(layer: Container, box: Rect, fill: number, stroke?: number, alpha = 1, radius = 8) {
    const shape = new Graphics().roundRect(box.x, box.y, box.w, box.h, radius).fill({ color: fill, alpha });
    if (stroke !== undefined) shape.stroke({ color: stroke, width: 1.5 });
    layer.addChild(shape);
    return shape;
  }

  function label(layer: Container, value: string, x: number, y: number, options: {
    size?: number; color?: number; center?: boolean; max?: number; serif?: boolean;
  } = {}) {
    const text = new Text({ text: value, style: {
      fontFamily: options.serif ? 'Georgia, serif' : 'system-ui, sans-serif',
      fontSize: options.size ?? 15, fill: options.color ?? cream,
      wordWrap: !!options.max, wordWrapWidth: options.max ?? width,
      breakWords: true, align: options.center ? 'center' : 'left', fontWeight: options.serif ? 'bold' : '500',
    } });
    text.anchor.set(options.center ? .5 : 0, .5);
    text.position.set(x, y);
    layer.addChild(text);
    return text;
  }

  function focus(id: string) {
    if (document.activeElement instanceof HTMLElement && keyboard.contains(document.activeElement)) {
      nextFocus = id;
    }
  }

  function open(next: Panel, origin: string) {
    focus('dismiss');
    panel = next;
    returnFocus = origin;
    render();
  }

  function close() {
    focus(returnFocus);
    panel = null;
    render();
  }

  function sync(actions: Action[]) {
    const ids = new Set(actions.map(action => action.id));
    for (const [id, button] of semantic) {
      if (!ids.has(id)) { button.remove(); semantic.delete(id); }
    }
    for (const action of actions) {
      let button = semantic.get(action.id);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.canvasAction = action.id;
        semantic.set(action.id, button);
        button.addEventListener('focus', () => requestAnimationFrame(render));
        button.addEventListener('blur', () => requestAnimationFrame(render));
        keyboard.append(button);
      }
      const { x, y, w, h } = action.box;
      Object.assign(button.style, { left: `${x * scale}px`, top: `${y * scale}px`, width: `${w * scale}px`, height: `${h * scale}px` });
      button.textContent = action.label;
      button.setAttribute('aria-disabled', String(!!action.disabled));
      button.onclick = () => { if (!action.disabled) action.run(); };
    }
  }

  function render() {
    if (disposed) return;
    scene.removeChildren().forEach(child => child.destroy({ children: true }));
    const p = props();
    const { state } = p.campaign;
    const town = TOWNS.find(t => t.id === state.townId);
    const blocked = p.busy || p.pending || !p.online;
    const narrow = width < 690;
    const layout = roomLayout(width, height);
    const actions: Action[] = [];

    function control(id: string, title: string, box: Rect, run: () => void, options: {
      text?: string; primary?: boolean; invisible?: boolean; disabled?: boolean; active?: boolean;
    } = {}, layer = scene) {
      const action: Action = { id, label: title, box, run, disabled: options.disabled };
      if (!panel || layer !== scene) actions.push(action);
      const item = new Container();
      const focused = document.activeElement === semantic.get(id);
      const border = options.primary || options.active || focused ? gold : 0xa98362;
      const base = options.primary ? 0xe9af62 : options.active ? 0x624454 : 0x302534;
      const shape = options.invisible
        ? new Graphics().roundRect(box.x, box.y, box.w, box.h, 9).stroke({ color: gold, width: focused ? 3 : 2 })
        : paintBox(item, box, base, border, options.disabled ? .62 : .94);
      if (options.invisible) {
        shape.alpha = focused ? 1 : 0;
        shape.eventMode = 'none';
        item.addChild(shape);
      }
      if (!options.invisible) label(item, options.text ?? title, box.x + box.w / 2, box.y + box.h / 2, {
        center: true, max: Math.max(25, box.w - 12), size: narrow ? 14 : 15,
        color: options.primary ? ink : options.disabled ? muted : cream,
      });
      if (!options.disabled && (!panel || layer !== scene)) {
        item.eventMode = 'static';
        item.hitArea = new Rectangle(box.x, box.y, box.w, box.h);
        item.cursor = 'pointer';
        item.on('pointertap', action.run);
        item.on('pointerover', () => { shape.alpha = options.invisible ? focused ? 1 : .55 : .78; app.render(); });
        item.on('pointerout', () => { shape.alpha = options.invisible && !focused ? 0 : 1; app.render(); });
      }
      layer.addChild(item);
    }

    const townId = panel === 'market' ? TOWNS[selectedTown].id : undefined;
    const artShelf = panel === 'shelf' || panel === 'price' ? selectedShelf : undefined;
    const nextArtKey = JSON.stringify([width, height, p.campaign.revision, townId, artShelf]);
    if (nextArtKey !== artKey) {
      art.removeChildren().forEach(child => child.destroy({ children: true }));
      drawRoom(art, width, height, state, { townId, selectedShelf: artShelf });
      artKey = nextArtKey;
    }

    const margin = narrow ? 10 : 22;
    paintBox(scene, rectangle(margin, 12, width - 2 * margin, 48), ink, 0x946c50, .94);
    control('back', 'All campaigns', rectangle(margin + 3, 14, narrow ? 62 : 142, 44), p.back,
      { text: narrow ? '‹ Menu' : '‹ All campaigns', disabled: p.busy || !p.online });
    const heading = narrow ? `Day ${state.day} · ${town?.name ?? 'Between towns'}` :
      `${p.campaign.name.slice(0, 32)}   /   Day ${state.day} · ${town?.name ?? 'Between towns'}`;
    label(scene, heading, width / 2, 36, { center: true, size: narrow ? 13 : 17, max: width - (narrow ? 142 : 305), serif: !narrow });
    control('stock', 'Inventory and gold', rectangle(width - margin - (narrow ? 64 : 120), 14, narrow ? 61 : 117, 44),
      () => open('stock', 'stock'), { text: `◈ ${money(state.gold)}` });

    const object = (id: string, title: string, box: Rect, run: () => void, caption: string) => {
      control(id, title, box, run, { invisible: true });
      const tagW = Math.min(Math.max(76, box.w), Math.max(90, width / 3));
      const tx = Math.max(6, Math.min(width - tagW - 6, box.x + (box.w - tagW) / 2));
      const ty = Math.max(66, box.y + box.h - 26);
      const tag = rectangle(tx, ty, tagW, 28);
      paintBox(scene, tag, ink, 0x815e4b, .94, 4).eventMode = 'none';
      label(scene, caption, tx + tagW / 2, ty + 14, { center: true, size: 13, max: tagW - 7 }).eventMode = 'none';
    };

    if (state.phase === 'travel') {
      control('door', 'Open door dial', layout.door, () => open('market', 'door'), { invisible: true });
      control('dial', 'Turn the door dial', layout.dial, () => open('market', 'dial'),
        { invisible: true });
      const dialTag = rectangle(Math.max(margin, layout.door.x + (layout.door.w - 128) / 2), layout.door.y + layout.door.h - 31, 128, 40);
      control('dial-tag', 'Choose destination', dialTag, () => open('market', 'dial-tag'), { text:'Turn the dial', primary: true });
    }
    if (state.phase === 'prepare') {
      state.shelves.forEach((shelf, i) => object(`shelf-${i}`, `Shelf ${i + 1}`, layout.shelves[i], () => {
        selectedShelf = i;
        const canPlace = carriedGood && !state.shelves.some((other, slot) => other.goodId === carriedGood && slot !== i);
        draftGood = canPlace ? carriedGood : shelf.goodId;
        draftPrice = draftGood && draftGood !== shelf.goodId ? priceRange(town!, draftGood).min : shelf.price;
        open('shelf', `shelf-${i}`);
      }, shelf.goodId ? `${nameOf(shelf.goodId)} · ${money(shelf.price)}` : 'Empty shelf'));
      object('wholesale', 'Wholesaler', layout.crate, () => {
        selectedSupply = Object.keys(town!.supply)[0] as GoodId;
        buyCount = 1;
        open('wholesale', 'wholesale');
      }, 'Wholesaler');
    }

    const customer = state.phase === 'open' ? state.customers[state.served] : undefined;
    if (customer) {
      const speechW = Math.min(250, width - 2 * margin);
      const speechX = Math.max(margin, Math.min(width - speechW - margin, layout.visitor.x + (layout.visitor.w - speechW) / 2));
      const speechY = Math.max(72, layout.visitor.y - 58);
      paintBox(scene, rectangle(speechX, speechY, speechW, 47), ink, 0xc99767);
      label(scene, `${state.served + 1}/8 · Looking for ${nameOf(customer.goodId)}`, speechX + speechW / 2, speechY + 23,
        { center: true, max: speechW - 18, size: 15 });
      control('customer', 'Serve waiting customer', layout.visitor, () => p.send({ type: 'serve' }), { invisible: true, disabled: blocked });
    }
    const primary = state.phase === 'prepare' ? ['open', 'Open the shop'] :
      state.phase === 'open' ? customer ? ['serve', 'Serve customer'] : ['close', 'Close & review day'] :
      state.phase === 'report' ? ['report', 'Day’s takings'] : null;
    if (primary) {
      const [id, title] = primary;
      const w = narrow ? 164 : 205;
      const bx = Math.max(margin, Math.min(width - w - margin, layout.bell.x + (layout.bell.w - w) / 2));
      const by = Math.min(height - 103, Math.max(114, layout.bell.y + layout.bell.h - 10));
      control(id, title, rectangle(bx, by, w, 44), () => {
        if (id === 'report') open('ledger', 'report');
        else p.send({ type: id as 'open' | 'serve' | 'close' });
      }, { primary: true, disabled: id !== 'report' && blocked });
    }
    if (state.phase !== 'travel') object('ledger', 'Open ledger', layout.ledger, () => open('ledger', 'ledger'), 'Ledger');

    const tip = !p.online ? 'You’re offline. Reconnect to continue trading.' : p.error || (
      p.busy ? 'Saving…' : p.pending ? 'Confirm your last action to keep trading.' :
      state.phase === 'travel' ? 'A new day. Turn the dial to pick a town.' :
      state.phase === 'prepare' ? carriedGood ? `Carrying ${nameOf(carriedGood)}. Tap a shelf to display it.` : 'Buy stock at the crate. Tap a shelf to display it.' :
      state.phase === 'open' ? state.log.at(-1) ?? 'Your first customer is waiting.' :
      'Open the ledger to read your takings.');
    paintBox(scene, rectangle(margin, height - 50, width - margin * 2, 40), ink, 0x76574b, .94);
    label(scene, tip, width / 2, height - 30, { center: true, size: narrow ? 12 : 14, max: width - margin * 2 - 14, color: p.error ? 0xffbcb0 : muted });
    if (!panel && p.pending && p.online && !p.busy) control('retry', 'Confirm last action',
      rectangle(width / 2 - 88, height - 103, 176, 44), () => p.send(), { primary: true });

    if (panel) {
      const overlay = new Container();
      scene.addChild(overlay);
      const shade = new Graphics().rect(0, 61, width, height - 61).fill({ color: 0x14111d, alpha: .38 });
      shade.eventMode = 'static';
      shade.on('pointertap', close);
      overlay.addChild(shade);

      const w = Math.min(width - margin * 2, panel === 'market' ? 390 : 358);
      const h = panel === 'market' ? 349 : panel === 'price' ? 320 :
        panel === 'shelf' ? 314 : panel === 'wholesale' ? 315 : panel === 'stock' ? 261 : 324;
      const anchor = panel === 'market' ? layout.door : panel === 'stock' ? layout.ledger :
        panel === 'shelf' || panel === 'price' ? layout.shelves[selectedShelf] :
        panel === 'wholesale' ? layout.crate : layout.ledger;
      const x = narrow ? (width - w) / 2 : Math.max(margin, Math.min(width - w - margin,
        anchor.x + anchor.w / 2 < width / 2 ? anchor.x + anchor.w + 14 : anchor.x - w - 14));
      const y = narrow ? height - h - 53 : Math.max(67, Math.min(height - h - 55, anchor.y - 22));
      const pin = { x: anchor.x + anchor.w / 2, y: anchor.y + anchor.h / 2 };
      const attachX = Math.max(x + 18, Math.min(x + w - 18, pin.x));
      const attachY = Math.max(y + 10, Math.min(y + h - 10, pin.y));
      if (pin.y < y || pin.y > y + h || pin.x < x || pin.x > x + w) overlay.addChild(new Graphics()
        .moveTo(pin.x, pin.y).lineTo(attachX, attachY).stroke({ color: 0xd1a97a, width: 2, alpha: .85 })
        .circle(pin.x, pin.y, 4).fill(gold));
      paintBox(overlay, rectangle(x, y, w, h), 0x1d1824, 0xc59a70, .98, 13).eventMode = 'static';
      const inner = x + 13;
      const innerW = w - 26;
      const button = (id: string, title: string, box: Rect, run: () => void, options?: Parameters<typeof control>[4]) =>
        control(id, title, box, run, options, overlay);
      const row = (offset: number, h = 44) => rectangle(inner, y + offset, innerW, h);
      const heading = { market: 'Door dial', wholesale: 'Wholesaler', shelf: `Shelf ${selectedShelf + 1}`, price: 'Price per item',
        stock: 'Stock chest', ledger: state.phase === 'report' ? 'Daily report' : 'Counter ledger' }[panel];
      label(overlay, heading, inner + 2, y + 27, { serif: true, size: 23 });
      button('dismiss', 'Close panel', rectangle(x + w - 50, y + 6, 44, 44), close, { text: '×' });

      if (panel === 'market') {
        const preview = TOWNS[selectedTown];
        const cell = (innerW - 12) / 3;
        TOWNS.forEach((t, i) => button(`preview-${t.id}`, `Preview ${t.name}`, rectangle(inner + i * (cell + 6), y + 56, cell, 44),
          () => {
            if (selectedTown !== i && !reducedMotion.matches) startFeedback({
              start: performance.now(), from: layout.dial, to: layout.dial, color: Number.parseInt(t.color.slice(1), 16), kind: 'dial',
            });
            selectedTown = i;
            render();
          }, { text: t.name, active: i === selectedTown }));
        label(overlay, 'Good', inner + 6, y + 117, { color: muted, size: 13 });
        label(overlay, 'Buy', inner + innerW * .53, y + 117, { color: muted, size: 13, center: true });
        label(overlay, 'Buyer range', inner + innerW * .80, y + 117, { color: muted, size: 13, center: true });
        GOODS.forEach((g, i) => {
          const yy = y + 138 + 24 * i;
          const supply = (preview.supply as Partial<Record<GoodId, number>>)[g.id];
          const range = priceRange(preview, g.id);
          if (i % 2 === 0) paintBox(overlay, rectangle(inner, yy - 11, innerW, 23), 0x382936, undefined, .8, 3);
          label(overlay, g.name, inner + 6, yy);
          label(overlay, supply === undefined ? '—' : money(supply), inner + innerW * .53, yy, { center: true });
          label(overlay, `${range.min}–${range.max}g`, inner + innerW * .80, yy, { center: true, color: gold });
        });
        button('choose-town', `Choose ${preview.name}`, row(290), () => p.send({ type: 'chooseTown', townId: preview.id }), { primary: true, disabled: blocked });
      }

      if (panel === 'wholesale' && town && selectedSupply) {
        const supply = town.supply as Partial<Record<GoodId, number>>;
        const goods = GOODS.filter(g => supply[g.id] !== undefined);
        const itemW = (innerW - 8) / 2;
        goods.forEach((g, i) => button(`supply-${g.id}`, `Select ${g.name}`,
          rectangle(inner + (i % 2) * (itemW + 8), y + 56 + Math.floor(i / 2) * 49, itemW, 44), () => {
            selectedSupply = g.id; buyCount = 1; render();
          }, { text: `${g.name} · ${money(supply[g.id]!)}`, active: g.id === selectedSupply }));
        const good = selectedSupply;
        const unit = supply[good]!;
        const limit = Math.min(99, Math.floor(state.gold / unit));
        const count = Math.max(1, Math.min(buyCount, limit));
        label(overlay, `${quantity(state, good)} in stock`, inner + 3, y + 174, { color: muted });
        button('decrease-quantity', 'Decrease quantity', rectangle(inner + innerW - 133, y + 155, 44, 44),
          () => { buyCount = count - 1; render(); }, { text: '−', disabled: blocked || count <= 1 });
        label(overlay, String(count), inner + innerW - 67, y + 177, { center: true, color: gold });
        button('increase-quantity', 'Increase quantity', rectangle(inner + innerW - 44, y + 155, 44, 44),
          () => { buyCount = count + 1; render(); }, { text: '+', disabled: blocked || count >= limit });
        button('buy', `Buy ${nameOf(good)}`, row(211), () => p.send({ type: 'buy', goodId: good, quantity: count }),
          { text: `Buy ${nameOf(good)} · ${money(unit * count)}`, primary: true, disabled: blocked || limit < 1 });
        button('carry-stock', `Place ${nameOf(good)} on a shelf`, row(261), () => {
          carriedGood = good;
          focus('shelf-0');
          panel = null;
          render();
        }, { text: 'Carry to shelf', disabled: blocked || quantity(state, good) < 1 ||
          state.shelves.some(s => s.goodId === good) });
      }

      if (panel === 'shelf' && town) {
        const goods = GOODS.filter(g => state.shelves[selectedShelf].goodId === g.id ||
          (quantity(state, g.id) > 0 && !state.shelves.some(s => s.goodId === g.id)));
        const options: { id: GoodId | null; name: string }[] = [{ id: null, name: 'Empty' }, ...goods];
        const cell = (innerW - 10) / 3;
        options.forEach((g, i) => button(`display-${g.id ?? 'empty'}`, g.id ? `Display ${g.name}` : 'Display empty shelf',
          rectangle(inner + (i % 3) * (cell + 5), y + 55 + Math.floor(i / 3) * 46, cell, 43), () => {
            draftGood = g.id;
            draftPrice = g.id ? g.id === state.shelves[selectedShelf].goodId ? state.shelves[selectedShelf].price : priceRange(town, g.id).min : 1;
            render();
          }, { text: g.name, active: draftGood === g.id, disabled: blocked }));
        if (draftGood) {
          const range = priceRange(town, draftGood);
          label(overlay, `Buyers pay ${range.min}–${range.max}g · ${quantity(state, draftGood)} in stock`,
            inner + innerW / 2, y + 190, { center: true, size: 13, color: muted });
          button('decrease-price', 'Decrease price', rectangle(inner, y + 205, 44, 44), () => { draftPrice--; render(); },
            { text: '−', disabled: blocked || draftPrice <= 1 });
          button('price', 'Price per item', rectangle(inner + 49, y + 205, innerW - 98, 44), () => {
            digits = String(draftPrice); focus('digit-1'); panel = 'price'; render();
          }, { text: money(draftPrice), disabled: blocked });
          button('increase-price', 'Increase price', rectangle(inner + innerW - 44, y + 205, 44, 44), () => { draftPrice++; render(); },
            { text: '+', disabled: blocked || draftPrice >= 10000 });
        } else if (!goods.length) label(overlay, 'Buy stock from the crate first.', inner + 5, y + 125, { color: muted });
        button('save-shelf', `Save shelf ${selectedShelf + 1}`, row(259), () =>
          p.send({ type: 'shelf', slot: selectedShelf, goodId: draftGood, price: draftGood ? draftPrice : 1 }),
        { primary: true, disabled: blocked || (!!draftGood && quantity(state, draftGood) === 0) });
      }

      if (panel === 'price') {
        label(overlay, digits ? money(Number(digits)) : '—', inner + 6, y + 65, { size: 24, color: gold });
        const cell = (innerW - 10) / 3;
        [1,2,3,4,5,6,7,8,9,0].forEach((digit, i) => button(`digit-${digit}`, `Digit ${digit}`,
          rectangle(inner + i % 3 * (cell + 5), y + 86 + Math.floor(i / 3) * 47, cell, 44), () => {
            const next = Number(digits + digit);
            if (next <= 10000) digits = String(next);
            render();
          }, { text: String(digit) }));
        button('clear-price','Clear price', rectangle(inner + cell + 5, y + 227, cell, 44), () => { digits = ''; render(); }, { text: 'Clear' });
        button('done-price','Done', rectangle(inner + 2 * (cell + 5), y + 227, cell, 44), () => {
          draftPrice = Number(digits); focus('price'); panel = 'shelf'; render();
        }, { primary: true, disabled: Number(digits) < 1 || Number(digits) > 10000 });
      }

      if (panel === 'stock') {
        GOODS.forEach((g, i) => {
          const yy = y + 63 + i * 25;
          overlay.addChild(new Graphics().circle(inner + 7, yy, 5).fill(g.color));
          label(overlay, g.name, inner + 20, yy);
          label(overlay, String(quantity(state, g.id)), inner + innerW - 16, yy, { center: true, color: gold });
        });
        label(overlay, `Stock value · ${money(inventoryValue(state))}`, inner + 2, y + 226, { color: muted });
      }

      if (panel === 'ledger') {
        if (state.phase === 'report') {
          const rows = [['Sales revenue', state.revenue], ['Cost of goods sold', state.costOfSales],
            ['Trading profit', state.revenue - state.costOfSales], ['Stock purchased today', state.purchases],
            ['Cash remaining', state.gold], ['Unsold stock at cost', inventoryValue(state)]] as const;
          rows.forEach(([title, value], i) => {
            const yy = y + 82 + i * 30;
            label(overlay, title, inner + 3, yy, { color: i === 2 ? gold : cream });
            label(overlay, money(value), inner + innerW - 27, yy, { center: true, color: gold });
          });
          label(overlay, `${state.sold} of ${state.served} customers bought something`, inner + 3, y + 58, { color: muted, size: 13 });
          button('next-day', `Begin day ${state.day + 1}`, row(268), () => p.send({ type: 'nextDay' }), { primary: true, disabled: blocked });
        } else if (!state.log.length) {
          label(overlay, 'Sales will appear here after opening.', inner + 5, y + 78, { max: innerW - 10, color: muted });
        } else state.log.slice(-8).forEach((entry, i) => label(overlay, entry, inner + 5, y + 66 + i * 30, { max: innerW - 10, size: 12 }));
      }

      if (p.pending && p.online && !p.busy) button('retry', 'Confirm last action',
        rectangle(x + (w - 176) / 2, y + h + 2, 176, 43), () => p.send(), { primary: true });
    }
    sync(actions);
    if (nextFocus) {
      semantic.get(nextFocus)?.focus({ preventScroll: true });
      nextFocus = '';
    }
    app.render();
  }

  function startFeedback(next: NonNullable<typeof effect>) {
    effect = next;
    if (!frame) frame = requestAnimationFrame(moveFeedback);
  }

  function moveFeedback() {
    frame = 0;
    if (disposed || !effect) return;
    const t = Math.min(1, (performance.now() - effect.start) / 520);
    feedback.clear();
    if (t === 1) {
      effect = undefined;
      app.render();
      return;
    }
    function arc(from: Rect, to: Rect, portion: number) {
      const progress = 1 - Math.pow(1 - portion, 2);
      return {
        x: from.x + from.w / 2 + (to.x + to.w / 2 - from.x - from.w / 2) * progress,
        y: from.y + from.h / 2 + (to.y + to.h / 2 - from.y - from.h / 2) * progress - Math.sin(Math.PI * portion) * 30,
      };
    }
    const opacity = 1 - t * .55;
    if (effect.kind === 'dial') {
      const dial = effect.from;
      const x = dial.x + dial.w / 2, y = dial.y + dial.h / 2;
      feedback.circle(x, y, dial.w / 2 + t * 25).stroke({ color: effect.color, width: 3, alpha: 1 - t });
    } else if (effect.kind === 'sale' && t > .42) {
      const { x, y } = arc(effect.from, effect.to, (t - .42) / .58);
      for (const i of [0, 1, 2]) {
        const r = 7 - i;
        feedback.ellipse(x - i * 8, y + i * 5, r * (.5 + Math.abs(Math.sin(t * 17))), r)
          .fill({ color: gold, alpha: opacity }).stroke({ color: 0x734642, width: 1 });
      }
    } else {
      const { x, y } = effect.kind === 'sale'
        ? arc(effect.itemFrom ?? effect.from, effect.from, t / .42) : arc(effect.from, effect.to, t);
      feedback.roundRect(x - 9, y - 8, 18, 17, 3).fill({ color: effect.color, alpha: opacity })
        .stroke({ color: cream, width: 1, alpha: opacity });
      feedback.rect(x - 2, y - 7, 4, 15).fill({ color: ink, alpha: opacity * .5 });
    }
    app.render();
    frame = requestAnimationFrame(moveFeedback);
  }

  function update() {
    const campaign = props().campaign;
    const current = campaign.state;
    const prior = previous.state;
    if (campaign.revision !== previous.revision) {
      const geometry = roomLayout(width, height);
      if (current.phase !== prior.phase) {
        focus(current.phase === 'report' ? 'next-day' : current.phase === 'prepare' ? 'wholesale' :
          current.phase === 'open' ? 'serve' : 'dial');
        carriedGood = null;
        panel = current.phase === 'report' ? 'ledger' : null;
        if (current.phase === 'travel') selectedTown = 0;
      } else if (panel === 'shelf' && current.shelves[selectedShelf] &&
        (current.shelves[selectedShelf].goodId !== prior.shelves[selectedShelf].goodId ||
          current.shelves[selectedShelf].price !== prior.shelves[selectedShelf].price)) {
        focus(`shelf-${selectedShelf}`);
        carriedGood = null;
        panel = null;
        if (!reducedMotion.matches && current.shelves[selectedShelf].goodId) startFeedback({
          start: performance.now(), from: geometry.crate, to: geometry.shelves[selectedShelf],
          color: GOODS.find(g => g.id === current.shelves[selectedShelf].goodId)?.color ?? gold, kind: 'stock',
        });
      } else if (current.sold > prior.sold && !reducedMotion.matches) {
        const purchased = prior.customers[prior.served]?.goodId;
        const slot = prior.shelves.findIndex(shelf => shelf.goodId === purchased);
        startFeedback({ start: performance.now(), from: geometry.visitor, to: geometry.bell,
          itemFrom: geometry.shelves[slot], color: GOODS.find(g => g.id === purchased)?.color ?? gold, kind: 'sale' });
      }
    }
    previous = campaign;
    render();
  }

  function resize() {
    if (disposed) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    effect = undefined;
    feedback.clear();
    scale = Math.min(1, h / 505);
    width = w / scale;
    height = h / scale;
    art.scale.set(scale);
    scene.scale.set(scale);
    feedback.scale.set(scale);
    motes.scale.set(scale);
    app.renderer.resize(w, h);
    render();
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && panel) { event.preventDefault(); close(); }
    if (panel === 'price' && /^\d$/.test(event.key)) {
      const next = Number(digits + event.key);
      if (next <= 10000) digits = String(next);
      render();
    }
    if (panel === 'price' && ['Backspace','Delete'].includes(event.key)) {
      event.preventDefault();
      digits = digits.slice(0, -1);
      render();
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  keyboard.addEventListener('keydown', onKey);
  resize();
  document.addEventListener('visibilitychange', refreshAmbient);
  reducedMotion.addEventListener('change', refreshAmbient);
  refreshAmbient();
  return { update, destroy() {
    disposed = true;
    observer.disconnect();
    cancelAnimationFrame(frame);
    cancelAnimationFrame(ambientFrame);
    document.removeEventListener('visibilitychange', refreshAmbient);
    reducedMotion.removeEventListener('change', refreshAmbient);
    keyboard.removeEventListener('keydown', onKey);
    for (const button of semantic.values()) button.remove();
    app.destroy({ removeView: true }, { children: true });
  } };
}
