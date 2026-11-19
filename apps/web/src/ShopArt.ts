import { Container, Graphics } from 'pixi.js';
import { GOODS, TOWNS, quantity, type GoodId, type State } from '@undercut/game-core';

export type Bounds = { x: number; y: number; w: number; h: number };
export function roomLayout(width: number, height: number) {
  const narrow = width < 660;
  const horizon = Math.round(height * .68);
  const doorW = Math.min(width * (narrow ? .34 : .23), height * .37);
  const dialSize = Math.max(46, Math.min(doorW * .46, 92));
  const doorH = Math.min(height * .51, doorW * 1.87, Math.max(doorW * .56, horizon - 71 - dialSize * .73));
  const door = { x: width * (narrow ? .085 : .175), y: horizon - doorH, w: doorW, h: doorH };
  const dial = { x: door.x + door.w / 2 - dialSize / 2, y: door.y - dialSize * .73, w: dialSize, h: dialSize };
  const sx = width * (narrow ? .505 : .52);
  const shelfW = width * (narrow ? .425 : .30);
  const shelfH = Math.min(78, height * .12);
  const shelves = [0, 1, 2].map(i => ({
    x: sx, y: horizon - height * (.43 - i * .132), w: shelfW, h: shelfH,
  }));
  const counterW = Math.min(width * .77, height * 1.2);
  const counter = { x: (width - counterW) / 2, y: height * .78, w: counterW, h: height * .129 };
  const crateW = Math.max(50, Math.min(counterW * .21, 122));
  const crate = { x: counter.x + counter.w * .10, y: counter.y - 33, w: crateW, h: 53 };
  const bell = { x: counter.x + counter.w * .51 - 24, y: counter.y - 29, w: 48, h: 49 };
  const ledger = { x: counter.x + counter.w * .76, y: counter.y - 25, w: Math.max(50, counterW * .16), h: 47 };
  const visitor = { x: counter.x + counter.w * .50 - 29, y: counter.y - height * .19, w: 58, h: height * .18 };
  return { door, dial, shelves, crate, counter, bell, ledger, visitor, horizon };
}

const brass = 0xc99557;
const ink = 0x211723;
const warm = 0xffcc84;
const mutedGold = 0x895c4c;
type ArtOptions = { townId?: string; selectedShelf?: number; time?: number };
type Point = [number, number];

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
  for (const x of [width * .43, width * .91]) {
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

function drawPortal(layer: Container, g: Graphics, door: Bounds, dial: Bounds, town: string | null, open: boolean, time: number) {
  const { x, y, w, h } = door;
  const bounds = { x: x + 9, y: y + 9, w: w - 18, h: h - 9 };
  const exterior = new Graphics();
  const mask = arch(new Graphics(), bounds).fill(0xffffff);
  exterior.mask = mask;
  layer.addChild(exterior, mask);
  arch(g, { x: x - 8, y: y - 7, w: w + 16, h: h + 13 }).stroke({ color: ink, width: 14 });
  arch(g, door).stroke({ color: mutedGold, width: 12 });
  arch(g, { x: x + 4, y: y + 4, w: w - 8, h: h - 2 }).stroke({ color: brass, width: 2 });
  exterior.rect(x, y, w, h).fill(town === 'harbor' ? 0x427a9d : town === 'forge' ? 0x8d555b : town === 'meadow' ? 0x668e91 : 0x303758);
  exterior.circle(x + w * .67, y + h * .30, w * .135).fill(town === 'harbor' ? 0xffca9d : 0xffd49b);
  if (town === 'harbor') {
    exterior.rect(x, y + h * .62, w, h * .38).fill(0x386078);
    for (let i = 0; i < 5; i++) {
      const waveY = y + h * (.64 + i * .069);
      line(exterior, [x + w * (i % 2 ? .13 : .36), waveY], [x + w * .92, waveY], 0xabc3ba, 2, .5);
    }
    polygon(exterior, [[x + w * .26, y + h * .76], [x + w * .29, y + h * .44],
      [x + w * .53, y + h * .76]], 0xe9cbab);
    polygon(exterior, [[x + w * .19, y + h * .77], [x + w * .60, y + h * .77],
      [x + w * .50, y + h * .83], [x + w * .25, y + h * .83]], 0x4d3744);
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
      if (town === 'forge') exterior.rect(px + w * .087, py - h * .08, w * .028, h * .085).fill(0x4e3844);
    }
  } else {
    const random = seeded(91);
    for (let i = 0; i < 24; i++) {
      const px = x + w * random(), py = y + h * random();
      exterior.circle(px, py, .65 + random() * 1.8).fill({ color: 0xe6d8b2, alpha: .28 + random() * .5 });
    }
  }
  if (!open && town) {
    line(exterior, [x + w * .5, y], [x + w * .5, y + h], 0x593947, 3);
    line(exterior, [x, y + h * .54], [x + w, y + h * .54], 0x593947, 3);
  }
  g.roundRect(x - 13, y + h - 5, w + 26, 12, 2).fill(0x805646);
  const cx = dial.x + dial.w / 2, cy = dial.y + dial.h / 2, radius = dial.w * .39;
  g.circle(cx, cy, radius + 4).fill(ink).circle(cx, cy, radius).fill(brass)
    .circle(cx, cy, radius - 4).fill(0x432938);
  const idx = TOWNS.findIndex(t => t.id === town);
  for (let i = 0; i < 3; i++) {
    const angle = (-90 + i * 120) * Math.PI / 180;
    g.circle(cx + Math.cos(angle) * radius * .62, cy + Math.sin(angle) * radius * .62, radius * .11)
      .fill(i === idx ? 0xffefb4 : 0x9d7867);
  }
  const angle = (idx < 0 ? 90 : -90 + idx * 120) * Math.PI / 180 + time;
  line(g, [cx, cy], [cx + Math.cos(angle) * radius * .52, cy + Math.sin(angle) * radius * .52], warm, 3);
  g.circle(cx, cy, 3.7).fill(warm);
}

const goodsColors = Object.fromEntries(GOODS.map(good => [good.id, good.color])) as Record<GoodId, number>;

function drawGood(g: Graphics, id: GoodId, x: number, y: number, s: number) {
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

function drawShelf(g: Graphics, b: Bounds, shelf: State['shelves'][number], stock: number, selected: boolean) {
  const { x, y, w, h } = b;
  g.roundRect(x + 2, y, w - 4, h, 5).fill(0x2a2130)
    .roundRect(x + 3, y + 4, w - 6, h - 6, 3).fill(0x4b3441);
  line(g, [x + 3, y + 4], [x + w - 5, y + 4], 0x946359, 3, .85);
  const s = Math.min(h * .54, w * .14, 37);
  if (shelf.goodId) for (let i = 0; i < Math.min(stock, 5); i++) {
    drawGood(g, shelf.goodId, x + w * (.13 + .155 * i), y + h - 10, s);
  }
  polygon(g, [[x, y + h - 9], [x + w, y + h - 9], [x + w - 5, y + h + 5], [x + 5, y + h + 5]], 0xa57054);
  g.rect(x + 7, y + h - 4, w - 14, 4).fill(selected ? 0xffce80 : 0x624139);
  if (selected) g.roundRect(x, y, w, h + 4, 4).stroke({ color: warm, width: 2 });
}

function drawCustomer(g: Graphics, b: Bounds, seed: number, index: number) {
  const { x, y, w, h } = b;
  const random = seeded(seed + index * 491);
  const jackets = [0x5b8a83, 0x8e688d, 0x736d9a, 0x9b654b, 0x668156];
  const skin = [0xc6916c, 0xb37b59, 0x936454, 0xd29a78];
  const coat = jackets[Math.floor(random() * jackets.length)], face = skin[Math.floor(random() * skin.length)];
  g.roundRect(x, y + h * .42, w, h * .66, w * .26).fill(coat)
    .circle(x + w * .5, y + h * .30, w * .33).fill(face)
    .roundRect(x + w * .16, y + h * .04, w * .69, h * .16, 7).fill(0x373140);
  if (index % 2) g.roundRect(x + w * .06, y + h * .17, w * .90, 6, 2).fill(0x373140);
  g.circle(x + w * .39, y + h * .29, 1.5).fill(ink).circle(x + w * .61, y + h * .29, 1.5).fill(ink);
  line(g, [x + w * .36, y + h * .48], [x + w * .63, y + h * .57], 0xe0aa74, 4);
}

function drawCounter(g: Graphics, c: Bounds, crate: Bounds, bell: Bounds, ledger: Bounds) {
  g.roundRect(c.x + 7, c.y + 11, c.w - 14, c.h + 4, 10).fill(0x372630);
  g.roundRect(c.x, c.y, c.w, c.h, 9).fill(0x815145)
    .roundRect(c.x + 8, c.y + 26, c.w - 16, Math.max(4, c.h - 33), 4).fill(0x57363c);
  for (let i = 1; i < 6; i++) line(g, [c.x + c.w * i / 6, c.y + 22], [c.x + c.w * i / 6, c.y + c.h - 4], 0x422b37, 2);
  g.roundRect(c.x - 7, c.y, c.w + 14, 23, 5).fill(0xa16c52).roundRect(c.x - 5, c.y + 1, c.w + 10, 4, 2).fill(0xca9667);
  g.roundRect(crate.x, crate.y + 9, crate.w, crate.h - 10, 5).fill(0x68473e)
    .rect(crate.x + 5, crate.y + 16, crate.w - 10, crate.h - 23).fill(0x9e6b51)
    .rect(crate.x + 8, crate.y + 24, crate.w - 16, 4).fill(0x674437)
    .rect(crate.x + 8, crate.y + 37, crate.w - 16, 4).fill(0x674437);
  line(g, [crate.x + 9, crate.y + 41], [crate.x + crate.w - 7, crate.y + 17], 0xbc8c61, 5);
  const bx = bell.x + bell.w / 2, by = bell.y + 34;
  g.ellipse(bx, by + 5, 21, 6).fill(0x603c36)
    .ellipse(bx, by + 2, 19, 5).fill(brass)
    .roundRect(bx - 13, by - 16, 26, 17, 9).fill(0xd9a557)
    .ellipse(bx - 4, by - 10, 4, 7).fill(0xffd993)
    .circle(bx, by - 18, 3).fill(0xffda97);
  polygon(g, [[ledger.x, ledger.y + 16], [ledger.x + ledger.w * .79, ledger.y + 9],
    [ledger.x + ledger.w, ledger.y + 32], [ledger.x + ledger.w * .19, ledger.y + 40]], 0x542b44);
  polygon(g, [[ledger.x + 3, ledger.y + 16], [ledger.x + ledger.w * .78, ledger.y + 11],
    [ledger.x + ledger.w * .96, ledger.y + 29], [ledger.x + ledger.w * .20, ledger.y + 36]], 0xbb986f);
  line(g, [ledger.x + ledger.w * .41, ledger.y + 14], [ledger.x + ledger.w * .59, ledger.y + 34], 0x72564f, 2);
}

export function drawRoom(layer: Container, width: number, height: number, state: State, options: ArtOptions = {}) {
  const layout = roomLayout(width, height);
  const { door, dial, shelves, crate, bell, ledger, counter, visitor, horizon } = layout;
  const background = new Graphics();
  drawRoomBackground(background, width, height, horizon);
  layer.addChild(background);
  const furniture = new Graphics();
  drawPortal(layer, furniture, door, dial, options.townId ?? state.townId, state.phase === 'open', options.time ?? 0);
  layer.addChild(furniture);
  shelves.forEach((b, i) => {
    const shelf = state.shelves[i];
    drawShelf(furniture, b, shelf, shelf.goodId ? quantity(state, shelf.goodId) : 0, options.selectedShelf === i);
  });
  if (state.phase === 'open' && state.customers[state.served]) drawCustomer(furniture, visitor, state.seed, state.served);
  drawCounter(furniture, counter, crate, bell, ledger);
  return layout;
}
