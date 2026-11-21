import { Assets, NineSliceSprite, Sprite, type Texture } from 'pixi.js';
import type { Bounds } from './ShopLayout.js';

const names = [
  'room-wall', 'room-floor', 'room-floor-portrait', 'door-open', 'door-closed', 'window-frame-tall', 'destination-dial',
  'town-meadow', 'town-forge', 'town-harbor', 'shelf-empty',
  'counter', 'ledger', 'bell', 'wholesale-crate', 'lantern', 'plant-hanging',
  'good-grain', 'good-herbs', 'good-cloth', 'good-tea', 'good-iron', 'good-crystal',
  'customer-01', 'customer-02', 'customer-03', 'customer-05',
  'button-primary', 'button-secondary', 'panel-large', 'parchment', 'coin',
] as const;

type AssetName = typeof names[number];
export type ShopTextures = Record<AssetName, Texture>;

export async function loadShopTextures(): Promise<ShopTextures> {
  // Pixi's worker capability check fetches a data URL, which the site's CSP blocks.
  Assets.setPreferences({ preferWorkers: false });
  const urls = names.map(name => `${import.meta.env.BASE_URL}shop-art/${name}.webp`);
  const textures = await Assets.load<Texture>(urls);
  return Object.fromEntries(names.map((name, index) => [name, textures[urls[index]]])) as ShopTextures;
}

export function placeSprite(texture: Texture, { x, y, w, h }: Bounds) {
  const sprite = new Sprite(texture);
  sprite.position.set(x, y);
  sprite.width = w;
  sprite.height = h;
  return sprite;
}

export function fitSprite(texture: Texture, bounds: Bounds, fit: 'contain' | 'cover' = 'contain', alignY = .5) {
  const scale = Math[fit === 'contain' ? 'min' : 'max'](bounds.w / texture.width, bounds.h / texture.height);
  const w = texture.width * scale;
  const h = texture.height * scale;
  return placeSprite(texture, { x: bounds.x + (bounds.w - w) / 2, y: bounds.y + (bounds.h - h) * alignY, w, h });
}

export function skin(texture: Texture, bounds: Bounds, edgeWidth: number, edgeHeight: number) {
  const sprite = new NineSliceSprite({
    texture, width: bounds.w, height: bounds.h,
    leftWidth: edgeWidth, rightWidth: edgeWidth, topHeight: edgeHeight, bottomHeight: edgeHeight,
  });
  sprite.position.set(bounds.x, bounds.y);
  return sprite;
}
