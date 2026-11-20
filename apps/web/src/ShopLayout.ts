export type Bounds = { x: number; y: number; w: number; h: number };

export function shopScale(width: number, height: number, pageScale = 1) {
  // Mobile desktop mode can fit a wide CSS viewport into a narrower display.
  // At larger zoom levels, keep fitting the visible area so the controls stay in reach.
  const fit = Math.min(1, pageScale);
  const visibleWidth = width * fit;
  const visibleHeight = height * fit;
  const minHeight = isPortrait(visibleWidth, visibleHeight) ? 600 : 505;
  return Math.min(1, visibleHeight / minHeight, visibleWidth / 320) / fit;
}

const isPortrait = (width: number, height: number) => width < 740 && width < height;

export function roomLayout(width: number, height: number) {
  const portrait = isPortrait(width, height);
  const narrow = width < 660;
  const bayY = portrait ? 72 : Math.max(82, height * .115);
  const bookHeight = Math.max(402, height * .49);
  const deskPageHeight = Math.min(505, bookHeight);
  const bookTop = height - bookHeight - 13;
  const horizon = portrait ? bookTop - 24 : Math.round(height * .65);
  const doorW = Math.min(width * .20, horizon * .52);
  const doorH = Math.min(horizon - 68, Math.max(height * .33, doorW * 1.7));
  const door = { x: width * .045, y: horizon - doorH, w: doorW, h: doorH };
  const dialSize = Math.max(44, Math.min(doorW * .54, 88));
  const dial = { x: door.x + (door.w - dialSize) / 2, y: door.y + door.h * .43, w: dialSize, h: dialSize };
  const bayX = portrait ? width * .34 : Math.max(width * .34, 380);
  const bay = { x: bayX, y: bayY, w: width * .95 - bayX, h: horizon - bayY - (portrait ? 8 : height * .105) };
  const shelfW = Math.min(width * (narrow ? .25 : .19), height * .29);
  const shelfH = portrait ? 46 : Math.min(85, height * .12);
  const shelves = [0, 1, 2].map(i => ({
    x: width * (narrow ? .13 + i * .255 : .31 + i * .208), y: horizon + (portrait ? 4 : height * .026),
    w: shelfW, h: shelfH,
  }));
  const windowDisplayHeight = portrait ? 44 : Math.max(44, height * .102);
  shelves.push({ x: bay.x + bay.w * .12, y: bay.y + bay.h - windowDisplayHeight * .78,
    w: bay.w * .76, h: windowDisplayHeight });
  const counterW = Math.min(width * (narrow ? .83 : .53), height * 1.1);
  const counter = { x: width * (narrow ? .09 : .07), y: height * .865, w: counterW, h: height * .13 };
  const bell = { x: counter.x + counter.w * .70, y: counter.y - 32, w: 48, h: 49 };
  const bookW = Math.max(104, Math.min(196, counterW * (narrow ? .45 : .54)));
  const book = { x: counter.x + counter.w * .12, y: counter.y - 39, w: bookW, h: 63 };
  const visitorH = portrait ? 74 : height * .18;
  const visitor = { x: width * (portrait ? .16 : .22), y: horizon - visitorH * .84, w: Math.min(58, width * .15), h: visitorH };
  const page = portrait
    ? { x: 0, y: bookTop, w: width, h: height - bookTop }
    : { x: Math.max(15, bay.x - 590), y: Math.max(70, (height - deskPageHeight) / 2),
      w: Math.min(570, bay.x - 35), h: deskPageHeight };
  return { portrait, door, dial, bay, shelves, counter, bell, book, visitor, horizon, page };
}
