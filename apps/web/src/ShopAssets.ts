import { Assets, NineSliceSprite, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Bounds } from './ShopLayout.js';
import harborSceneData from './demo-assets/harbor/scene/harbor_shop.scene.json';
import travelerIdleSheet from './demo-assets/traveler/idle_read_map_sheet.png';
import travelerWalkSheet from './demo-assets/traveler/walk_sheet.png';

const harborArtUrls = import.meta.glob('./demo-assets/harbor/art/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

type HarborManifest = {
  background: string;
  assets: Record<string, { file: string }>;
  objects: Array<{ asset?: string; sprite_animation?: string }>;
  animations: { shopkeeper: Record<string, { frames: string[] }> };
};
const harborManifest = harborSceneData as unknown as HarborManifest;

const names = [
  'room-wall', 'room-floor', 'room-floor-portrait', 'door-open', 'door-closed', 'window-frame-tall', 'destination-dial',
  'town-meadow', 'town-forge', 'town-harbor', 'shelf-empty',
  'counter', 'ledger', 'bell', 'wholesale-crate', 'lantern', 'plant-hanging',
  'good-grain', 'good-herbs', 'good-cloth', 'good-tea', 'good-iron', 'good-crystal',
  'customer-01', 'customer-02', 'customer-03', 'customer-05',
  'button-primary', 'button-secondary', 'panel-large', 'parchment', 'coin',
] as const;

type AssetName = typeof names[number];
export type CustomerMotion = 'idle' | 'walk';
export type ShopTextures = Record<AssetName, Texture> & {
  harbor: Record<string, Texture>;
  visitor: Record<CustomerMotion, Texture[]>;
};

function splitSheet(sheet: Texture): Texture[] {
  const frameWidth = sheet.width / 3;
  const frameHeight = sheet.height / 2;
  return Array.from({ length: 6 }, (_, index) => {
    const frame = new Rectangle((index % 3) * frameWidth, Math.floor(index / 3) * frameHeight, frameWidth, frameHeight);
    return new Texture({ source: sheet.source, frame });
  });
}

export async function loadShopTextures(): Promise<ShopTextures> {
  // Pixi's worker capability check fetches a data URL, which the site's CSP blocks.
  Assets.setPreferences({ preferWorkers: false });
  const urls = names.map(name => `${import.meta.env.BASE_URL}shop-art/${name}.webp`);
  const harborPathToUrl = new Map(Object.entries(harborArtUrls).map(([key, url]) => [
    key.slice('./demo-assets/harbor/'.length), url,
  ]));
  const harborPaths = Array.from(new Set([
    harborManifest.background,
    ...harborManifest.objects.flatMap(object => object.asset
      ? [harborManifest.assets[object.asset]?.file].filter((path): path is string => !!path) : []),
    ...harborManifest.animations.shopkeeper.idle.frames.slice(0, 1),
  ]));
  const harborUrls = harborPaths.map(path => {
    const url = harborPathToUrl.get(path);
    if (!url) throw new Error('Missing harbor art: ' + path);
    return url;
  });
  const visitorUrls = [travelerIdleSheet, travelerWalkSheet];
  const loaded = await Assets.load<Texture>([...urls, ...harborUrls, ...visitorUrls]);
  const harbor = Object.fromEntries(harborPaths.map((path, index) => [path, loaded[harborUrls[index]]]));
  return {
    ...Object.fromEntries(names.map((name, index) => [name, loaded[urls[index]]])),
    harbor,
    visitor: {
      idle: splitSheet(loaded[travelerIdleSheet]),
      walk: splitSheet(loaded[travelerWalkSheet]),
    },
  } as ShopTextures;
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
