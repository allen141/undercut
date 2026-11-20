import { Container, Graphics, Sprite } from 'pixi.js';
import { TOWNS, quantity, type GoodId, type State } from '@undercut/game-core';
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

function drawRoomBackground(layer: Container, art: ShopTextures, width: number, height: number, horizon: number) {
  layer.addChild(
    placeSprite(art['room-wall'], { x: 0, y: 52, w: width, h: horizon - 52 }),
    placeSprite(art['room-floor'], { x: 0, y: horizon, w: width, h: height - horizon }),
  );
  layer.addChild(new Graphics().rect(0, 0, width, 54).fill(0x2f2031));
  const floor = new Graphics();
  floor.rect(0, horizon, width, height - horizon).fill({ color: 0x522c26, alpha: .18 });
  layer.addChild(floor);
}

function drawPortal(layer: Container, art: ShopTextures, bay: Bounds, townId: string | null) {
  const { x, y, w, h } = bay;
  const wx = (u: number) => x + w * u;
  const wy = (v: number) => y + h * v;
  const opening = new Graphics()
    .moveTo(wx(.229), wy(.982)).lineTo(wx(.229), wy(.548))
    .bezierCurveTo(wx(.229), wy(.392), wx(.33), wy(.239), wx(.47), wy(.245))
    .bezierCurveTo(wx(.604), wy(.237), wx(.709), wy(.40), wx(.709), wy(.55))
    .lineTo(wx(.709), wy(.982)).closePath().fill(0xffffff);
  const vista = new Container();
  const town = townId === 'harbor' || townId === 'forge' || townId === 'meadow' ? art[`town-${townId}`] : null;
  if (town) {
    vista.addChild(fitSprite(town, { x: wx(.22), y: wy(.237), w: w * .50, h: h * .77 }, 'cover', .4));
  } else {
    const voidArt = new Graphics().rect(x, y, w, h).fill(0x32254e);
    for (let i = 0; i < 22; i++) {
      const px = wx(.245 + (i * .103) % .44);
      const py = wy(.27 + (i * .161) % .69);
      voidArt.circle(px, py, 1 + (i % 3) * .45).fill({ color: 0xe9c9ff, alpha: .45 + (i % 4) * .12 });
    }
    vista.addChild(voidArt);
  }
  vista.mask = opening;
  layer.addChild(glow(wx(.47), wy(.54), Math.min(w, h) * .55, 0xac60ef), vista, opening, placeSprite(art['portal-frame'], bay));
}

function drawDial(layer: Container, art: ShopTextures, dial: Bounds, town: string | null) {
  layer.addChild(fitSprite(art['portal-dial'], dial));
  const index = TOWNS.findIndex(destination => destination.id === town);
  if (index < 0) return;
  const position = [[.494, .24], [.26, .51], [.71, .51]][index];
  const x = dial.x + dial.w * position[0], y = dial.y + dial.h * position[1];
  layer.addChild(new Graphics().circle(x, y, Math.max(6, dial.w * .107))
    .stroke({ color: 0xffe2a6, width: 1.6, alpha: .9 }));
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
  } else {
    const sill = new Graphics().roundRect(x, platform, w, 8, 3).fill(0x7c4e3a)
      .roundRect(x + 2, platform - 2, w - 4, 5, 3).fill(selected ? 0xf0bf78 : 0xc28c60);
    layer.addChild(sill);
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
  const { portrait, dial, bay, shelves, bell, book, counter, horizon } = roomLayout(width, height);
  drawRoomBackground(layer, art, width, height, horizon);
  const townId = options.townId ?? state.townId;
  drawPortal(layer, art, bay, townId);
  drawDial(layer, art, dial, townId);

  const lantern = { x: Math.max(10, bay.x - 49), y: bay.y + 38, w: 39, h: 59 };
  layer.addChild(glow(lantern.x + lantern.w / 2, lantern.y + lantern.h * .6, 64, 0xffbb62),
    fitSprite(art.lantern, lantern));
  const plantW = Math.min(portrait ? 58 : 113, width * .15);
  layer.addChild(fitSprite(art['plant-hanging'], { x: width * .98 - plantW, y: 57, w: plantW, h: plantW * 1.35 }));
  shelves.forEach((bounds, index) => {
    const shelf = state.shelves[index];
    const stock = shelf?.goodId ? options.stock?.(shelf.goodId) ?? quantity(state, shelf.goodId) : 0;
    drawShelf(layer, art, bounds, shelf, stock, options.selectedShelf === index, index === 3);
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
