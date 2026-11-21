import { Container, Graphics, Sprite } from 'pixi.js';
import { TOWNS, quantity, type GoodId, type State } from '@undercut/game-core';
import { fitSprite, placeSprite, type CustomerMotion, type ShopTextures } from './ShopAssets.js';
import harborSceneData from './demo-assets/harbor/scene/harbor_shop.scene.json';
import { roomLayout, type Bounds } from './ShopLayout.js';

type ArtOptions = { townId?: string; selectedShelf?: number; stock?: (goodId: GoodId) => number };
type HarborObject = {
  id: string;
  asset?: string;
  sprite_animation?: string;
  rect: [number, number, number, number];
  z_order: number;
  visible: boolean;
  opacity?: number;
};
type HarborManifest = {
  authored_size: [number, number];
  background: string;
  assets: Record<string, { file: string }>;
  objects: HarborObject[];
  animations: { shopkeeper: Record<string, { frames: string[] }> };
};
const harborScene = harborSceneData as unknown as HarborManifest;

export const phaseBooks = {
  travel: { title: 'Route Atlas', cover: 0x315965, edge: 0x76b7b5, page: 0xe8dcb5 },
  prepare: { title: 'Supplier Ledger', cover: 0x6a3c49, edge: 0xda9b87, page: 0xf0d8b6 },
  open: { title: 'Shop Journal', cover: 0x486344, edge: 0xb4bd7a, page: 0xe5dbb0 },
  report: { title: 'Accounts Book', cover: 0x574163, edge: 0xc8a5cf, page: 0xebe0c9 },
} as const;

function glow(x: number, y: number, radius: number, color: number) {
  const light = new Graphics();
  for (let ring = 9; ring > 0; ring--) light.circle(x, y, ring * radius / 9).fill({ color, alpha: .023 });
  return light;
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

export function customerPortrait(art: ShopTextures, _seed: number, _index: number, bounds: Bounds) {
  return fitSprite(art.visitor.idle[0], bounds, 'contain', 1);
}

export function setCustomerAnimation(sprite: Sprite, art: ShopTextures, motion: CustomerMotion, frame: number) {
  const frames = art.visitor[motion];
  sprite.texture = frames[((frame % frames.length) + frames.length) % frames.length];
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
  const layout = roomLayout(width, height);
  const toScreen = (rect: [number, number, number, number]): Bounds => ({
    x: layout.scene.x + rect[0] * layout.scene.w / harborScene.authored_size[0],
    y: layout.scene.y + rect[1] * layout.scene.h / harborScene.authored_size[1],
    w: rect[2] * layout.scene.w / harborScene.authored_size[0],
    h: rect[3] * layout.scene.h / harborScene.authored_size[1],
  });
  const background = new Graphics().rect(0, 0, width, height).fill(0x1c292d);
  layer.addChild(background, placeSprite(art.harbor[harborScene.background], layout.scene));
  const townId = options.townId ?? state.townId;
  const townWindowTints: Record<string, number> = { meadow: 0x9fbf82, forge: 0xd89b65, harbor: 0x76adbf };
  const townTint = townId ? townWindowTints[townId] : undefined;
  if (townTint !== undefined) {
    const window = layout.sceneWindow;
    layer.addChild(new Graphics().rect(window.x, window.y, window.w, window.h)
      .fill({ color: townTint, alpha: .17 }));
  }

  const lanternLight = (rect: [number, number, number, number], radius: number) => {
    const bounds = toScreen(rect);
    layer.addChild(glow(bounds.x + bounds.w / 2, bounds.y + bounds.h * .62, radius, 0xffba63));
  };
  lanternLight([138, 196, 114, 186], Math.min(72, layout.scene.w * .055));
  lanternLight([1090, 305, 75, 124], Math.min(56, layout.scene.w * .04));

  const replaceableGoods = new Set([
    'shelf_bottle_teal', 'shelf_bottle_amber', 'shelf_gem', 'shelf_chest', 'shelf_jar', 'shelf_rope',
    'shell', 'boat', 'table_bottle',
  ]);
  const objects = [...harborScene.objects].sort((a, b) => a.z_order - b.z_order);
  for (const object of objects) {
    if (!object.visible || replaceableGoods.has(object.id)) continue;
    const assetPath = object.asset
      ? harborScene.assets[object.asset]?.file
      : object.sprite_animation
        ? harborScene.animations.shopkeeper.idle.frames[0]
        : undefined;
    const texture = assetPath ? art.harbor[assetPath] : undefined;
    if (!texture) continue;
    const sprite = placeSprite(texture, toScreen(object.rect));
    sprite.alpha = object.opacity ?? 1;
    if (object.id === 'closed_door') sprite.visible = state.phase !== 'open';
    if (object.id === 'open_door') sprite.visible = state.phase === 'open';
    (object.z_order >= 90 ? foreground : layer).addChild(sprite);
  }

  if (state.phase === 'report') {
    layer.addChild(new Graphics().rect(layout.scene.x, layout.scene.y, layout.scene.w, layout.scene.h)
      .fill({ color: 0x17172d, alpha: .12 }));
  }
  if (state.phase !== 'travel') drawDial(layer, art, layout.dial, options.townId ?? state.townId);

  layout.sceneShelves.forEach((bounds, index) => {
    const shelf = state.shelves[index];
    const selected = options.selectedShelf === index;
    if (selected) {
      layer.addChild(new Graphics().roundRect(bounds.x, bounds.y, bounds.w, bounds.h, 5)
        .stroke({ color: 0xffd98a, width: 2, alpha: .78 }));
    }
    if (!shelf?.goodId) return;
    const stock = options.stock?.(shelf.goodId) ?? quantity(state, shelf.goodId);
    const size = Math.min(bounds.h * .51, bounds.w * .17, 58);
    const platformY = bounds.y + bounds.h * (index === 3 ? .80 : .72);
    for (let item = 0; item < Math.min(stock, 5); item++) {
      const sprite = new Sprite();
      setGood(sprite, art, shelf.goodId,
        bounds.x + bounds.w * (.18 + .16 * item), platformY, size);
      layer.addChild(sprite);
    }
  });

}
