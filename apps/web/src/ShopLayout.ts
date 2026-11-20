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
  const bookHeight = Math.max(402, height * .49);
  const deskPageHeight = Math.min(505, bookHeight);
  const bookTop = height - bookHeight - 13;
  const horizon = portrait ? bookTop - 24 : Math.round(height * .65);
  const bayX = portrait ? width * .045 : Math.min(Math.max(width * .32, 380), width * .56);
  const bay = { x: bayX, y: 63, w: width * (portrait ? .955 : .79) - bayX, h: horizon - 63 };
  const doorHeight = Math.min(bay.h * .76, bay.w * .56);
  const doorWidth = Math.min(bay.w * .47, doorHeight * .9);
  const doorCenter = bay.x + bay.w * .76;
  const door = { x: doorCenter - doorWidth / 2, y: horizon - doorHeight, w: doorWidth, h: doorHeight };
  const windowWidth = Math.min(bay.w * .45, bay.h * .92);
  const window = { x: bay.x + bay.w * .24 - windowWidth / 2, y: door.y + door.h * .09,
    w: windowWidth, h: Math.min(windowWidth * .91, door.h * .80) };
  const dialAboveDoor = (w: number): Bounds => {
    const h = w / dialAspect;
    return { x: doorCenter - w / 2, y: Math.max(bay.y, door.y - h + 4), w, h };
  };
  const dial = dialAboveDoor(Math.max(46, Math.min(132, door.w * .60)));
  const travelDial = dialAboveDoor(Math.min(288, Math.max(110, door.w * 1.36), (width - doorCenter) * 2 - 12));
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
      { x: width * .80, y: horizon - shelfH * .84, w: Math.min(shelfW, width * .18), h: shelfH * 1.55 },
      { x: width * .175, y: horizon + shelfH * .32, w: Math.min(shelfW, width * .13), h: shelfH },
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
      w: Math.min(570, bay.x - 35), h: deskPageHeight };
  return { portrait, door, window, dial, travelDial, bay, shelves, counter, bell, book, visitor, horizon, page };
}
