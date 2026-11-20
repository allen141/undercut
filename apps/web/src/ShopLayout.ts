export type Bounds = { x: number; y: number; w: number; h: number };

const dialAspect = 317 / 155;

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
  const bookHeight = portrait ? Math.max(376, height * .43) : Math.max(402, height * .49);
  const deskPageHeight = Math.min(505, bookHeight);
  const bookTop = height - bookHeight - 13;
  const horizon = portrait ? bookTop - 8 : Math.round(height * .745);
  const bayX = portrait ? width * .035 : Math.min(Math.max(width * .29, 365), width * .55);
  const bay = { x: bayX, y: 63, w: width * (portrait ? .96 : .91) - bayX, h: horizon - 63 };
  const doorHeight = Math.min(bay.h * .66, bay.w * .56);
  const doorWidth = Math.min(bay.w * .38, doorHeight * .9);
  const doorCenter = bay.x + bay.w * .775;
  const door = { x: doorCenter - doorWidth / 2, y: horizon - doorHeight, w: doorWidth, h: doorHeight };
  const windowWidth = bay.w * (portrait ? .54 : .52);
  const windowBottom = horizon - Math.min(doorHeight * .19, portrait ? 36 : 72);
  const windowHeight = Math.min(windowWidth * .91, windowBottom - (portrait ? 113 : bay.y + 16));
  const window = { x: bay.x + bay.w * .016, y: windowBottom - windowHeight, w: windowWidth, h: windowHeight };
  const dialAboveDoor = (w: number): Bounds => {
    const h = w / dialAspect;
    return { x: doorCenter - w / 2, y: door.y - h + 4, w, h };
  };
  const dial = dialAboveDoor(Math.max(46, Math.min(132, door.w * .60)));
  const travelDial = dialAboveDoor(Math.min(288, Math.max(110, door.w * 1.36),
    (width - doorCenter) * 2 - 12, (door.y - bay.y + 4) * dialAspect));
  const shelfW = Math.min(width * (narrow ? .25 : .19), height * .29);
  const shelfH = portrait ? 46 : Math.min(105, height * .14);
  // Keep the aisle from the door to the counter clear at either aspect ratio.
  const shelves = portrait
    ? [
      { x: width * .045, y: horizon + 5, w: shelfW, h: shelfH },
      { x: width * .70, y: horizon + 12, w: shelfW, h: shelfH },
      { x: width * .065, y: horizon + 60, w: shelfW, h: shelfH },
    ]
    : [
      { x: width * .035, y: horizon - shelfH * .84, w: Math.min(shelfW, width * .15), h: shelfH * 1.55 },
      { x: width * .89, y: horizon - shelfH * .54, w: Math.min(shelfW, width * .102), h: shelfH * 1.14 },
      { x: width * .195, y: horizon + shelfH * .05, w: Math.min(shelfW, width * .13), h: shelfH * .74 },
    ];
  const windowDisplayHeight = Math.min(window.h, portrait ? 55 : Math.max(44, height * .102));
  shelves.push({ x: window.x + window.w * .04, y: window.y + window.h * .89 - windowDisplayHeight * .80,
    w: window.w * .92, h: windowDisplayHeight });
  const counterW = width * (narrow ? .90 : .86);
  const counter = { x: (width - counterW) / 2, y: height * .835, w: counterW, h: height * .165 };
  const bell = { x: counter.x + counter.w * .70, y: counter.y - 32, w: 48, h: 49 };
  const bookW = Math.max(104, Math.min(196, counterW * (narrow ? .45 : .54)));
  const book = { x: counter.x + counter.w * (narrow ? .11 : .44), y: counter.y - 39, w: bookW, h: 63 };
  const visitorH = portrait ? 100 : Math.min(225, height * .24);
  const visitorW = Math.min(visitorH * .90, width * .24);
  const visitor = { x: width * (portrait ? .12 : .34), y: counter.y - visitorH + 6, w: visitorW, h: visitorH };
  const page = portrait
    ? { x: 0, y: bookTop, w: width, h: height - bookTop }
    : { x: Math.max(15, bay.x - 590), y: Math.max(70, (height - deskPageHeight) / 2),
      w: Math.min(570, bay.x - 18), h: deskPageHeight };
  return { portrait, door, window, dial, travelDial, bay, shelves, counter, bell, book, visitor, horizon, page };
}
