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
  const bayX = portrait ? width * .17 : Math.max(width * .32, 380);
  const bayW = portrait ? width * .80 : Math.min(width * .55, width * .97 - bayX);
  const bay = { x: bayX, y: bayY, w: bayW, h: horizon - bayY - (portrait ? 8 : 0) };
  const door = { x: bay.x + bay.w * .228, y: bay.y + bay.h * .245, w: bay.w * .48, h: bay.h * .735 };
  const dialSize = Math.max(34, Math.min(132, bay.w * .25, bay.h * .36));
  const dial = { x: bay.x + bay.w * .46 - dialSize / 2, y: bay.y + bay.h * .11 - dialSize / 2,
    w: dialSize, h: dialSize };
  const shelfW = Math.min(width * (narrow ? .25 : .19), height * .29);
  const shelfH = portrait ? 46 : Math.min(105, height * .14);
  // Keep the center aisle open from the portal to the counter at either aspect ratio.
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
  const windowDisplayHeight = portrait ? 44 : Math.max(44, height * .102);
  shelves.push({ x: door.x, y: bay.y + bay.h * .982 - windowDisplayHeight * .80,
    w: door.w, h: windowDisplayHeight });
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
  const travelDialLeft = portrait ? 8 : page.x + page.w + 8;
  const travelDialSize = Math.max(88, Math.min(200, door.x - travelDialLeft - 8,
    portrait ? page.y - 63 : height * .35));
  const travelDial = { x: Math.max(travelDialLeft, door.x - travelDialSize - 8),
    y: portrait ? Math.max(59, door.y + door.h / 2 - travelDialSize / 2)
      : Math.max(68, door.y + door.h * .25 - travelDialSize / 2), w: travelDialSize, h: travelDialSize };
  return { portrait, door, dial, travelDial, bay, shelves, counter, bell, book, visitor, horizon, page };
}
