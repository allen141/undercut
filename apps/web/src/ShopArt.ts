import { Container, Graphics, Sprite } from 'pixi.js';
import { TOWNS, WINDOW_SLOT_INDEX, quantity, type GoodId, type State } from '@undercut/game-core';
import { fitSprite, placeSprite, type ShopTextures } from './ShopAssets.js';
import { roomLayout, type Bounds } from './ShopLayout.js';

type ArtOptions = { townId?: string; selectedShelf?: number; stock?: (goodId: GoodId) => number };

export const phaseBooks = {
  travel: { title: 'Route Atlas', cover: 0x315965, edge: 0x76b7b5, page: 0xe8dcb5 },
  prepare: { title: 'Supplier Ledger', cover: 0x6a3c49, edge: 0xda9b87, page: 0xf0d8b6 },
  open: { title: 'Shop Journal', cover: 0x486344, edge: 0xb4bd7a, page: 0xe5dbb0 },
  report: { title: 'Accounts Book', cover: 0x574163, edge: 0xc8a5cf, page: 0xebe0c9 },
} as const;

function glow(x: number, y: number, radius: number, color: number) {
  const light = new Graphics();
  for (let ring = 9; ring > 0; ring--) {
    light.circle(x, y, ring * radius / 9).fill({ color, alpha: .023 });
  }
  return light;
}

function drawRoomBackground(layer: Container, art: ShopTextures, width: number, height: number, horizon: number, portrait: boolean) {
  const floorBounds = { x: 0, y: horizon, w: width, h: height - horizon };
  const floor = portrait ? fitSprite(art['room-floor-portrait'], floorBounds, 'cover', 0)
    : placeSprite(art['room-floor'], floorBounds);
  layer.addChild(placeSprite(art['room-wall'], { x: 0, y: 52, w: width, h: horizon - 52 }), floor);
  if (portrait) {
    const mask = new Graphics().rect(0, horizon, width, floorBounds.h).fill(0xffffff);
    floor.mask = mask;
    layer.addChild(mask);
  }
  layer.addChild(new Graphics().rect(0, 0, width, 54).fill(0x2f2031));
  layer.addChild(new Graphics().rect(0, horizon, width, floorBounds.h).fill({ color: 0x522c26, alpha: .18 }));
}

function drawFrontWall(layer: Container, art: ShopTextures, door: Bounds, window: Bounds,
  townId: string | null, open: boolean) {
  // The openings share one projection so the wall and its frames occlude a continuous street.
  const wx = (u: number) => window.x + window.w * u;
  const wy = (v: number) => window.y + window.h * v;
  const dx = (u: number) => door.x + door.w * u;
  const dy = (v: number) => door.y + door.h * v;
  const doorViewBottom = dy(open ? 1 : .65);
  const openings = new Graphics()
    .moveTo(wx(.09), wy(.909)).lineTo(wx(.09), wy(.297))
    .quadraticCurveTo(wx(.27), wy(.096), wx(.50), wy(.065))
    .quadraticCurveTo(wx(.71), wy(.096), wx(.92), wy(.297))
    .lineTo(wx(.92), wy(.909)).closePath().fill(0xffffff)
    .moveTo(dx(.20), doorViewBottom).lineTo(dx(.20), dy(.47))
    .bezierCurveTo(dx(.20), dy(.31), dx(.33), dy(.21), dx(.50), dy(.21))
    .bezierCurveTo(dx(.68), dy(.21), dx(.805), dy(.31), dx(.805), dy(.47))
    .lineTo(dx(.805), doorViewBottom).closePath().fill(0xffffff);
  const vista = new Container();
  const top = Math.min(window.y, door.y);
  const outside = { x: window.x, y: top, w: door.x + door.w - window.x, h: door.y + door.h - top };
  if (townId === 'harbor' || townId === 'forge' || townId === 'meadow') {
    vista.addChild(fitSprite(art[`town-${townId}`], outside, 'cover', .54));
  } else {
    vista.addChild(new Graphics().rect(outside.x, outside.y, outside.w, outside.h).fill(0x35263b));
  }
  vista.mask = openings;
  layer.addChild(vista, openings, placeSprite(art['window-frame'], window),
    placeSprite(art[open ? 'door-open' : 'door-closed'], door));
}

export function dialTargets(dial: Bounds) {
  const target = (x: number, y: number, w: number, h: number): Bounds => ({
    x: dial.x + dial.w * x - w / 2, y: dial.y + dial.h * y - h / 2, w, h,
  });
  const town = (x: number, y: number) => target(x, y, dial.w * .27, Math.max(24, dial.h * .47));
  return { towns: { meadow: town(.238, .61), forge: town(.50, .43), harbor: town(.763, .61) },
    confirm: target(.50, .85, Math.max(30, dial.w * .24), Math.max(24, dial.h * .29)) };
}

export function drawDial(layer: Container, art: ShopTextures, dial: Bounds, town: string | null, expanded = false) {
  layer.addChild(placeSprite(art['destination-dial'], dial));
  const destination = TOWNS.find(destination => destination.id === town);
  if (!destination || !expanded) return;
  const { x, y, w, h } = dialTargets(dial).towns[destination.id];
  layer.addChild(new Graphics().ellipse(x + w / 2, y + h / 2, w * .43, h * .46)
    .stroke({ color: 0xffe2a6, width: 2, alpha: .9 }));
}

export function setGood(sprite: Sprite, art: ShopTextures, id: GoodId, x: number, y: number, size: number) {
  sprite.texture = art[`good-${id}`];
  const scale = size / Math.max(sprite.texture.width, sprite.texture.height);
  sprite.scale.set(scale);
  sprite.anchor.set(.5, 1);
  sprite.position.set(x, y);
  sprite.visible = true;
}

function drawShelf(layer: Container, art: ShopTextures, b: Bounds, shelf: State['shelves'][number] | undefined,
  stock: number, selected: boolean, window: boolean) {
  const { x, y, w, h } = b;
  const platform = y + h * (window ? .80 : .57);
  if (!window) {
    const shadow = new Graphics().ellipse(x + w / 2, y + h + 6, w * .50, h * .16)
      .fill({ color: 0x281c26, alpha: .36 });
    layer.addChild(shadow);
    const frame = placeSprite(art['shelf-empty'], { x, y: y - h * .08, w, h: h * 1.18 });
    if (selected) frame.tint = 0xffdf99;
    layer.addChild(frame);
  } else if (selected) {
    layer.addChild(new Graphics().roundRect(x + 4, platform, w - 8, 3, 1).fill({ color: 0xf0bf78, alpha: .7 }));
  }
  if (!shelf?.goodId) return;
  const size = Math.min(h * .46, w * .17, 44);
  for (let i = 0; i < Math.min(stock, 5); i++) {
    const sprite = new Sprite();
    setGood(sprite, art, shelf.goodId, x + w * (.18 + .16 * i), platform - 2, size);
    layer.addChild(sprite);
  }
}

export function customerPortrait(art: ShopTextures, seed: number, index: number, bounds: Bounds) {
  const portraits = [art['customer-01'], art['customer-02'], art['customer-03'], art['customer-05']];
  return fitSprite(portraits[((seed + index) % portraits.length + portraits.length) % portraits.length], bounds, 'contain', 1);
}

export function setCoin(sprite: Sprite, x: number, y: number, radius: number, stretch = 1) {
  sprite.anchor.set(.5);
  sprite.position.set(x, y);
  sprite.width = radius * 2 * stretch;
  sprite.height = radius * 2;
  sprite.visible = true;
}

export function drawRoom(layer: Container, foreground: Container, art: ShopTextures, width: number, height: number,
  state: State, options: ArtOptions = {}) {
  const { portrait, dial, bay, door, window, shelves, bell, book, counter, horizon } = roomLayout(width, height);
  drawRoomBackground(layer, art, width, height, horizon, portrait);
  const townId = options.townId ?? state.townId;
  drawFrontWall(layer, art, door, window, townId, state.phase === 'open');
  if (state.phase !== 'travel') drawDial(layer, art, dial, townId);

  const lanternW = Math.min(39, (door.x - window.x - window.w) * .82);
  const lantern = { x: (window.x + window.w + door.x - lanternW) / 2, y: bay.y + 12,
    w: lanternW, h: lanternW * 1.5 };
  layer.addChild(glow(lantern.x + lantern.w / 2, lantern.y + lantern.h * .6, 64, 0xffbb62),
    fitSprite(art.lantern, lantern));
  const plantW = Math.min(portrait ? 48 : 113, width * .15);
  const plantX = portrait ? width * .20 - plantW / 2 : width * .98 - plantW;
  layer.addChild(fitSprite(art['plant-hanging'], { x: plantX, y: 57, w: plantW, h: plantW * 1.35 }));
  shelves.forEach((bounds, index) => {
    const shelf = state.shelves[index];
    const stock = shelf?.goodId ? options.stock?.(shelf.goodId) ?? quantity(state, shelf.goodId) : 0;
    drawShelf(layer, art, bounds, shelf, stock, options.selectedShelf === index, index === WINDOW_SLOT_INDEX);
  });

  foreground.addChild(placeSprite(art.counter, counter));
  if (!portrait) {
    const crateW = Math.min(counter.w * .15, 100);
    foreground.addChild(fitSprite(art['wholesale-crate'], { x: counter.x + 15, y: counter.y - crateW * .55, w: crateW, h: crateW }, 'contain', 1));
  }
  foreground.addChild(fitSprite(art.bell, { ...bell, y: bell.y - 3, h: 43 }, 'contain', 1));
  const ledger = fitSprite(art.ledger, book);
  foreground.addChild(ledger);
}
