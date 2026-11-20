import { Container, Graphics } from 'pixi.js';
import { GOODS, TOWNS, quantity, type GoodId, type State } from '@undercut/game-core';
import { roomLayout, type Bounds } from './ShopLayout.js';

const brass = 0xc99557;
const ink = 0x211723;
const warm = 0xffcc84;
const mutedGold = 0x895c4c;
type ArtOptions = { townId?: string; selectedShelf?: number; bookOpen?: boolean; stock?: (goodId: GoodId) => number };
type Point = [number, number];

export const phaseBooks = {
  travel: { title: 'Route Atlas', cover: 0x315965, edge: 0x76b7b5, page: 0xe8dcb5 },
  prepare: { title: 'Supplier Ledger', cover: 0x6a3c49, edge: 0xda9b87, page: 0xf0d8b6 },
  open: { title: 'Shop Journal', cover: 0x486344, edge: 0xb4bd7a, page: 0xe5dbb0 },
  report: { title: 'Accounts Book', cover: 0x574163, edge: 0xc8a5cf, page: 0xebe0c9 },
} as const;

function polygon(g: Graphics, points: Point[], color: number, alpha = 1) {
  g.poly(points.flat()).fill({ color, alpha });
}
function line(g: Graphics, a: Point, b: Point, color: number, width = 1, alpha = 1) {
  g.moveTo(...a).lineTo(...b).stroke({ color, width, alpha });
}
function arch(g: Graphics, b: Bounds) {
  const crown = b.y + b.w * .5;
  return g.moveTo(b.x, b.y + b.h).lineTo(b.x, crown)
    .quadraticCurveTo(b.x, b.y, b.x + b.w * .5, b.y)
    .quadraticCurveTo(b.x + b.w, b.y, b.x + b.w, crown)
    .lineTo(b.x + b.w, b.y + b.h).closePath();
}
function seeded(seed: number) {
  let next = seed;
  return () => {
    next = Math.imul(next, 1664525) + 1013904223 | 0;
    return (next >>> 0) / 4294967296;
  };
}

function drawRoomBackground(g: Graphics, width: number, height: number, horizon: number) {
  const random = seeded(54207);
  // Draw the wall with inexpensive geometry so rebuilding a scene does not
  // allocate a new GPU texture for a one-use gradient.
  const swatches = [[34, 26, 44], [112, 70, 76], [67, 45, 59]];
  const bands = 50;
  for (let i = 0; i < bands; i++) {
    const ratio = i / (bands - 1);
    const section = ratio < .61 ? 0 : 1;
    const t = section === 0 ? ratio / .61 : (ratio - .61) / .39;
    const color = swatches[section].reduce((rgb, value, channel) =>
      rgb * 256 + Math.round(value + (swatches[section + 1][channel] - value) * t), 0);
    const top = Math.floor(i * horizon / bands);
    const bottom = Math.floor((i + 1) * horizon / bands);
    g.rect(0, top, width, bottom - top).fill(color);
  }
  g.rect(0, horizon, width, height - horizon).fill(0x483240);
  const plankCount = 12;
  for (let i = 0; i < plankCount; i++) {
    const a = (i - plankCount / 2) * width / 6;
    const b = a + width / 6;
    polygon(g, [[width * .48 + a * .44, horizon], [width * .48 + b * .44, horizon],
      [width * .48 + b * 1.7, height], [width * .48 + a * 1.7, height]],
    i % 2 ? 0x66443f : 0x744b43);
    line(g, [width * .48 + a * .44, horizon], [width * .48 + a * 1.7, height], 0x3b2939, 2);
  }
  for (const f of [.12, .27, .49, .79]) line(g, [0, horizon + (height - horizon) * f],
    [width, horizon + (height - horizon) * f], 0x302333, 2, .4);
  const brickH = 37, brickW = 113;
  for (let y = 62, row = 0; y < horizon - 15; y += brickH, row++) {
    line(g, [0, y], [width, y], 0x2d2334, 2, .36);
    for (let x = -brickW + row % 2 * brickW / 2; x < width; x += brickW) {
      const tint = random() < .6 ? 0xeabf94 : 0x211626;
      g.rect(x + 2, y + 3, brickW - 4, brickH - 5).fill({ color: tint, alpha: random() * .055 });
      line(g, [x, y], [x, y + brickH], 0x2e2233, 2, .32);
    }
  }
  g.rect(0, horizon - 12, width, 13).fill(0x302331);
  g.rect(0, horizon - 12, width, 3).fill(0x9e6a5b);
  g.rect(0, 0, width * .043, horizon).fill(0x302333);
  g.rect(width * .957, 0, width * .043, horizon).fill(0x302333);
  line(g, [width * .043, 0], [width * .043, horizon], 0xa77158, 3, .54);
  line(g, [width * .957, 0], [width * .957, horizon], 0xa77158, 3, .54);
  for (const x of [width * .291]) {
    const y = Math.max(85, horizon - height * .41);
    for (let i = 10; i > 0; i--) {
      g.ellipse(x, y, i * 8, i * 10).fill({ color: 0xffae66, alpha: .013 });
    }
    line(g, [x, y - 36], [x, y - 12], 0x341f28, 4);
    g.roundRect(x - 10, y - 13, 20, 25, 4).fill(0x5a3b36)
      .roundRect(x - 7, y - 9, 14, 18, 3).fill(0xffb658)
      .ellipse(x, y + 1, 4, 8).fill(0xffe4a4)
      .rect(x - 11, y + 9, 22, 4).fill(0x422d34);
  }
}

function drawDoor(g: Graphics, door: Bounds, dial: Bounds, town: string | null, visiting: boolean) {
  const { x, y, w, h } = door;
  arch(g, { x: x - 5, y: y - 5, w: w + 10, h: h + 9 }).fill(ink);
  arch(g, door).fill(0x754d45).stroke({ color: mutedGold, width: 9 });
  arch(g, { x: x + 5, y: y + 5, w: w - 10, h: h - 5 }).stroke({ color: brass, width: 2 });
  for (let i = 1; i <= 4; i++) {
    const px = x + w * i / 5;
    const top = y + w * (Math.abs(i / 5 - .5) + .15);
    line(g, [px, top], [px, y + h], 0x4d3339, 2);
    line(g, [px + 3, top + 9], [px + 3, y + h - 6], 0xa57354, 1, .62);
  }
  if (visiting) {
    polygon(g, [[x + w * .58, y + h * .11], [x + w * .91, y + h * .22],
      [x + w * .94, y + h - 5], [x + w * .58, y + h - 5]], 0x69505c);
    polygon(g, [[x + w * .66, y + h * .18], [x + w * .90, y + h * .25],
      [x + w * .91, y + h - 5], [x + w * .66, y + h - 5]], 0xc6855d);
    polygon(g, [[x + w * .64, y + h - 5], [x + w * .91, y + h - 5],
      [x + w * 1.35, y + h * 1.27], [x + w * .46, y + h * 1.27]], 0xe3ae75, .14);
  }
  line(g, [x + 5, y + h * .74], [x + w - 5, y + h * .74], 0x4a313a, 7);
  g.roundRect(x - 7, y + h - 4, w + 14, 12, 2).fill(0x9d6d52);
  g.circle(x + w * .84, y + h * .66, Math.min(9, w * .12)).fill(0x442e36)
    .circle(x + w * .84, y + h * .66, Math.min(5, w * .07)).fill(brass);
  const cx = dial.x + dial.w / 2, cy = dial.y + dial.h / 2, radius = dial.w * .39;
  g.circle(cx, cy, radius + 4).fill(ink).circle(cx, cy, radius).fill(brass)
    .circle(cx, cy, radius - 4).fill(0x432938);
  const idx = TOWNS.findIndex(t => t.id === town);
  TOWNS.forEach((destination, i) => {
    const angle = (-90 + i * 120) * Math.PI / 180;
    g.circle(cx + Math.cos(angle) * radius * .66, cy + Math.sin(angle) * radius * .66, radius * .12)
      .fill(idx === i ? Number.parseInt(destination.color.slice(1), 16) : 0x9d7867);
  });
  const angle = (idx < 0 ? 90 : -90 + idx * 120) * Math.PI / 180;
  line(g, [cx, cy], [cx + Math.cos(angle) * radius * .57, cy + Math.sin(angle) * radius * .57], warm, 3);
  g.circle(cx, cy, 3.7).fill(warm);
}

function drawVista(exterior: Graphics, { x, y, w, h }: Bounds, town: string | null) {
  exterior.rect(x, y, w, h).fill(town === 'harbor' ? 0x427a9d : town === 'forge' ? 0x8d555b : town === 'meadow' ? 0x668e91 : 0x303758);
  exterior.circle(x + w * .67, y + h * .30, Math.min(h * .135, w * .12)).fill(town === 'harbor' ? 0xffca9d : 0xffd49b);
  if (town === 'harbor') {
    exterior.rect(x, y + h * .62, w, h * .38).fill(0x386078);
    for (let i = 0; i < 5; i++) {
      const waveY = y + h * (.64 + i * .069);
      line(exterior, [x + w * (i % 2 ? .13 : .36), waveY], [x + w * .92, waveY], 0xabc3ba, 2, .5);
    }
    for (const [px, py, size] of [[.25, .83, 1], [.66, .70, .6]]) {
      polygon(exterior, [[x + w * px, y + h * py], [x + w * (px + .02), y + h * (py - .37 * size)],
        [x + w * (px + .13 * size), y + h * py]], 0xe9cbab);
      polygon(exterior, [[x + w * (px - .02), y + h * py], [x + w * (px + .17 * size), y + h * py],
        [x + w * (px + .13 * size), y + h * (py + .07 * size)], [x + w * px, y + h * (py + .07 * size)]], 0x4d3744);
    }
  } else if (town) {
    polygon(exterior, [[x, y + h * .62], [x + w * .22, y + h * .43], [x + w * .43, y + h * .62],
      [x + w * .74, y + h * .51], [x + w, y + h * .65], [x + w, y + h], [x, y + h]],
    town === 'forge' ? 0x54394c : 0x557259);
    polygon(exterior, [[x, y + h * .82], [x + w * .29, y + h * .64], [x + w * .63, y + h * .75],
      [x + w, y + h * .66], [x + w, y + h], [x, y + h]], town === 'forge' ? 0x8b594c : 0x778153);
    for (let i = 0; i < 4; i++) {
      const px = x + w * (.21 + i * .19), py = y + h * (.79 + i % 2 * .06);
      exterior.rect(px, py, w * .123, h * .085).fill(town === 'forge' ? 0x4e3844 : 0x75534d);
      polygon(exterior, [[px - w * .023, py], [px + w * .063, py - h * .052], [px + w * .15, py]], 0x55353d);
      exterior.rect(px + w * .044, py + h * .025, w * .034, h * .039).fill(0xffc888);
      if (town === 'forge') {
        exterior.rect(px + w * .087, py - h * .16, w * .028, h * .17).fill(0x4e3844);
        for (let j = 0; j < 4; j++) exterior.ellipse(px + w * (.10 + j * .014), py - h * (.17 + j * .044),
          w * (.018 + j * .010), h * (.025 + j * .017)).fill({ color: 0x5a4657, alpha: .45 });
      }
    }
  } else {
    const random = seeded(91);
    for (let i = 0; i < 24; i++) {
      const px = x + w * random(), py = y + h * random();
      exterior.circle(px, py, .65 + random() * 1.8).fill({ color: 0xe6d8b2, alpha: .28 + random() * .5 });
    }
  }
}

function drawBay(layer: Container, g: Graphics, bay: Bounds, town: string | null) {
  const { x, y, w, h } = bay;
  const outline: Point[] = [[x, y + h * .14], [x + w * .2, y], [x + w * .8, y],
    [x + w, y + h * .14], [x + w, y + h * .90], [x + w * .8, y + h],
    [x + w * .2, y + h], [x, y + h * .90]];
  const exterior = new Graphics();
  const mask = new Graphics().poly(outline.flat()).fill(0xffffff);
  exterior.mask = mask;
  layer.addChild(exterior, mask);
  drawVista(exterior, bay, town);
  polygon(exterior, [outline[0], outline[1], outline[6], outline[7]], 0x223541, .21);
  polygon(exterior, [outline[2], outline[3], outline[4], outline[5]], 0x223541, .21);
  for (const f of [.20, .50, .80]) {
    line(g, [x + w * f, y], [x + w * f, y + h], 0x624248, f === .5 ? 4 : 7);
    line(g, [x + w * f + 2, y], [x + w * f + 2, y + h], 0xc28c62, 1, .8);
  }
  line(g, [x, y + h * .49], [x + w * .20, y + h * .43], 0x624248, 5);
  line(g, [x + w * .20, y + h * .43], [x + w * .80, y + h * .43], 0x624248, 5);
  line(g, [x + w * .80, y + h * .43], [x + w, y + h * .49], 0x624248, 5);
  g.poly(outline.flat()).stroke({ color: ink, width: 14 });
  g.poly(outline.flat()).stroke({ color: 0x9b6b52, width: 8 });
  g.poly(outline.flat()).stroke({ color: brass, width: 1.5 });
  polygon(g, [[x - 5, y + h * .89], [x + w * .2, y + h - 2], [x + w * .8, y + h - 2],
    [x + w + 5, y + h * .89], [x + w + 7, y + h * .94], [x + w * .81, y + h + 10],
    [x + w * .19, y + h + 10], [x - 7, y + h * .94]], 0xb58159);
}

const goodsColors = Object.fromEntries(GOODS.map(good => [good.id, good.color])) as Record<GoodId, number>;

export function drawGood(g: Graphics, id: GoodId, x: number, y: number, s: number) {
  const color = goodsColors[id];
  g.ellipse(x, y, s * .60, s * .12).fill({ color: ink, alpha: .54 });
  if (id === 'crystal') {
    polygon(g, [[x - s * .50, y - s * .27], [x - s * .22, y - s * .91], [x + s * .17, y - s * .78],
      [x + s * .54, y - s * .32], [x + s * .25, y]], color);
    polygon(g, [[x - s * .22, y - s * .91], [x + s * .13, y - s * .34], [x + s * .25, y], [x + s * .17, y - s * .78]], 0xc6fff0);
  } else if (id === 'iron' || id === 'cloth') {
    polygon(g, [[x - s * .51, y - s * .57], [x + s * .23, y - s * .72], [x + s * .54, y - s * .51],
      [x + s * .40, y - s * .12], [x - s * .51, y]], color);
    line(g, [x - s * .49, y - s * .54], [x + s * .45, y - s * .50], 0xffffff, 2, .40);
    line(g, [x - s * .49, y - s * .17], [x + s * .42, y - s * .29], 0x29203a, 2, .25);
  } else {
    g.roundRect(x - s * .48, y - s * .81, s * .96, s * .81, s * .23).fill(color)
      .roundRect(x - s * .29, y - s * .91, s * .57, s * .23, s * .04).fill(color)
      .roundRect(x - s * .35, y - s * .72, s * .14, s * .53, s * .07).fill({ color: 0xffffff, alpha: .33 })
      .rect(x - s * .35, y - s * .76, s * .70, s * .09).fill(0x675147);
  }
}

function drawShelf(g: Graphics, b: Bounds, shelf: State['shelves'][number] | undefined, stock: number, selected: boolean, window: boolean) {
  const { x, y, w, h } = b;
  const platform = y + h * (window ? .80 : .57);
  if (!window) {
    g.ellipse(x + w / 2, y + h + 8, w * .51, h * .22).fill({ color: ink, alpha: .40 });
    g.roundRect(x + w * .11, platform - 4, w * .78, h * .49, 4).fill(0x50323d);
    g.rect(x + w * .17, platform + 5, w * .66, h * .31).fill(0x65413e);
    for (const f of [.21, .79]) line(g, [x + w * f, platform + 7], [x + w * f, y + h + 7], 0x382631, 5);
  }
  polygon(g, [[x + w * .075, platform - 11], [x + w * .925, platform - 11],
    [x + w, platform + 4], [x, platform + 4]], window ? 0xc38d60 : 0xa57054);
  g.roundRect(x, platform + 3, w, 7, 2).fill(selected ? warm : 0x70493f);
  line(g, [x + 4, platform + 3], [x + w - 4, platform + 3], 0xd5a377, 1, .8);
  const s = Math.min(h * .53, w * .15, 42);
  if (shelf?.goodId) for (let i = 0; i < Math.min(stock, 5); i++) {
    drawGood(g, shelf.goodId, x + w * (.18 + .16 * i), platform - 4, s);
  }
}

export function drawCustomer(g: Graphics, b: Bounds, seed: number, index: number) {
  const { x, y, w, h } = b;
  const random = seeded(seed + index * 491);
  const jackets = [0x5b8a83, 0x8e688d, 0x736d9a, 0x9b654b, 0x668156];
  const skin = [0xc6916c, 0xb37b59, 0x936454, 0xd29a78];
  const coat = jackets[Math.floor(random() * jackets.length)], face = skin[Math.floor(random() * skin.length)];
  g.ellipse(x + w * .5, y + h * 1.08, w * .58, h * .075).fill({ color: ink, alpha: .35 });
  g.roundRect(x, y + h * .42, w, h * .66, w * .26).fill(coat)
    .circle(x + w * .5, y + h * .30, w * .33).fill(face)
    .roundRect(x + w * .16, y + h * .04, w * .69, h * .16, 7).fill(0x373140);
  if (index % 2) g.roundRect(x + w * .06, y + h * .17, w * .90, 6, 2).fill(0x373140);
  g.circle(x + w * .39, y + h * .29, 1.5).fill(ink).circle(x + w * .61, y + h * .29, 1.5).fill(ink);
  line(g, [x + w * .36, y + h * .48], [x + w * .63, y + h * .57], 0xe0aa74, 4);
}

export function drawCoin(g: Graphics, x: number, y: number, radius: number, stretch = 1) {
  const rx = radius * stretch;
  g.ellipse(x, y + 1, rx, radius).fill(0x90512f)
    .ellipse(x, y - 1, rx, radius).fill(0xf5bf58)
    .ellipse(x, y - 1, rx * .66, radius * .68).stroke({ color: 0xffe095, width: 1.5 });
  line(g, [x, y - radius * .43], [x, y + radius * .27], 0x996239, 1.5);
}

function drawCounter(g: Graphics, c: Bounds, bell: Bounds) {
  g.roundRect(c.x + 7, c.y + 11, c.w - 14, c.h + 4, 10).fill(0x372630);
  g.roundRect(c.x, c.y, c.w, c.h, 9).fill(0x815145)
    .roundRect(c.x + 8, c.y + 26, c.w - 16, Math.max(4, c.h - 33), 4).fill(0x57363c);
  for (let i = 1; i < 6; i++) line(g, [c.x + c.w * i / 6, c.y + 22], [c.x + c.w * i / 6, c.y + c.h - 4], 0x422b37, 2);
  g.roundRect(c.x - 7, c.y, c.w + 14, 23, 5).fill(0xa16c52).roundRect(c.x - 5, c.y + 1, c.w + 10, 4, 2).fill(0xca9667);
  const bx = bell.x + bell.w / 2, by = bell.y + 34;
  g.ellipse(bx, by + 5, 21, 6).fill(0x603c36)
    .ellipse(bx, by + 2, 19, 5).fill(brass)
    .roundRect(bx - 13, by - 16, 26, 17, 9).fill(0xd9a557)
    .ellipse(bx - 4, by - 10, 4, 7).fill(0xffd993)
    .circle(bx, by - 18, 3).fill(0xffda97);
}

function drawDeskBook(g: Graphics, b: Bounds, phase: State['phase'], open: boolean) {
  const theme = phaseBooks[phase];
  const { x, y, w, h } = b;
  g.ellipse(x + w * .51, y + h * .87, w * .51, h * .20).fill({ color: ink, alpha: .62 });
  if (open) {
    polygon(g, [[x + 6, y + h * .30], [x + w * .50, y + h * .39], [x + w - 6, y + h * .30],
      [x + w, y + h * .86], [x + w * .51, y + h * .94], [x, y + h * .87]], theme.cover);
    polygon(g, [[x + 9, y + h * .27], [x + w * .50, y + h * .37], [x + w - 9, y + h * .27],
      [x + w - 5, y + h * .77], [x + w * .50, y + h * .87], [x + 5, y + h * .77]], theme.page);
    line(g, [x + w * .50, y + h * .37], [x + w * .50, y + h * .87], 0xab8170, 2);
    return;
  }
  polygon(g, [[x + 5, y + h * .30], [x + w * .86, y + h * .14], [x + w, y + h * .73],
    [x + w, y + h * .84], [x + w * .14, y + h * .99], [x, y + h * .42]], theme.page);
  polygon(g, [[x + 3, y + h * .25], [x + w * .86, y + h * .10], [x + w, y + h * .72],
    [x + w * .14, y + h * .88]], theme.cover);
  g.poly([x + 11, y + h * .31, x + w * .82, y + h * .17, x + w - 11, y + h * .67,
    x + w * .18, y + h * .79]).stroke({ color: theme.edge, width: 1.5 });
  line(g, [x + 1, y + h * .28], [x + w * .14, y + h * .95], theme.edge, 4);
}

export function drawRoom(layer: Container, width: number, height: number, state: State, options: ArtOptions = {}) {
  const layout = roomLayout(width, height);
  const { door, dial, bay, shelves, bell, book, counter, horizon } = layout;
  const background = new Graphics();
  drawRoomBackground(background, width, height, horizon);
  layer.addChild(background);
  const furniture = new Graphics();
  drawDoor(furniture, door, dial, options.townId ?? state.townId, state.phase === 'open');
  drawBay(layer, furniture, bay, options.townId ?? state.townId);
  layer.addChild(furniture);
  shelves.forEach((b, i) => {
    const shelf = state.shelves[i];
    const stock = shelf?.goodId ? options.stock?.(shelf.goodId) ?? quantity(state, shelf.goodId) : 0;
    drawShelf(furniture, b, shelf, stock, options.selectedShelf === i, i === 3);
  });
  if (state.phase === 'report') furniture.rect(0, 0, width, horizon).fill({ color: 0x292041, alpha: .15 });
  drawCounter(furniture, counter, bell);
  drawDeskBook(furniture, book, state.phase, options.bookOpen ?? false);
  return layout;
}
