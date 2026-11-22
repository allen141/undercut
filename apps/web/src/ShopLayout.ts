export type Bounds = { x: number; y: number; w: number; h: number };

// Authored in the 1448×1086 harbor-room coordinate space and shared by both renderers.
export const SHOP_WINDOW_EXTERIOR: [number, number, number, number] = [410, 17, 690, 290];
export const SHOP_WINDOW_FRAME: [number, number, number, number] = [380, 0, 770, 310];

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
  const bookBelowWall = portrait || (width < 1240 && height >= 660);
  const bookHeight = bookBelowWall ? Math.max(376, height * .43) : Math.max(402, height * .49);
  const bookTop = height - bookHeight - 13;
  const horizon = bookBelowWall ? bookTop - 8 : Math.round(height * .745);
  const wallTop = 63;
  const sidePageHeight = Math.min(505, bookHeight);
  const page = bookBelowWall
    ? { x: 0, y: bookTop, w: width, h: height - bookTop }
    : { x: 15, y: Math.max(70, (height - sidePageHeight) / 2),
      w: Math.min(320, Math.max(280, width * .23)), h: sidePageHeight };

  const sceneArea = bookBelowWall
    ? { x: 0, y: 54, w: width, h: Math.max(260, horizon - 54) }
    : { x: 0, y: 0, w: width, h: height };
  const sceneScale = Math.min(sceneArea.w / 1448, sceneArea.h / 1086);
  const sceneWidth = 1448 * sceneScale;
  const sceneHeight = 1086 * sceneScale;
  const scene = {
    x: (width - sceneWidth) / 2,
    y: sceneArea.y + sceneArea.h - sceneHeight,
    w: sceneWidth,
    h: sceneHeight,
  };
  const mapScene = ([x, y, w, h]: [number, number, number, number]): Bounds => ({
    x: scene.x + x * sceneScale,
    y: scene.y + y * sceneScale,
    w: w * sceneScale,
    h: h * sceneScale,
  });

  const wallGap = Math.min(25, width * .036);
  const doorAreaLeft = bookBelowWall ? Math.max(10, width * .035) : page.x + page.w + 12;
  const sideDoorRoom = Math.max(106, Math.min(250, width * .47 - doorAreaLeft - wallGap));
  const windowX = bookBelowWall ? width * .365 : Math.max(width * .43, doorAreaLeft + wallGap + sideDoorRoom);
  const window = { x: windowX, y: wallTop, w: width * .98 - windowX, h: horizon - wallTop };
  const bayX = bookBelowWall ? doorAreaLeft : doorAreaLeft - 5;
  const bay = { x: bayX, y: wallTop, w: window.x + window.w - bayX, h: window.h };

  const doorAreaRight = window.x - wallGap;
  const doorAreaWidth = doorAreaRight - doorAreaLeft;
  const doorCenter = doorAreaLeft + doorAreaWidth / 2;
  const doorTop = Math.max(bookBelowWall ? 123 : 83, wallTop + doorAreaWidth * .38);
  const doorHeight = Math.min(window.h * .83, horizon - doorTop, doorAreaWidth * 1.60);
  const doorWidth = Math.min(doorAreaWidth * .94, doorHeight * .76, width * (bookBelowWall ? .28 : .20));
  const door = { x: doorCenter - doorWidth / 2, y: horizon - doorHeight, w: doorWidth, h: doorHeight };
  const dialAboveDoor = (w: number): Bounds => {
    const h = w / dialAspect;
    return { x: doorCenter - w / 2, y: door.y - h + 4, w, h };
  };
  const journalX = width < 710 ? 11 : 22;
  const journal = { x: journalX, y: 65, w: Math.min(155, window.x - journalX - 8), h: 44 };
  const compactDialWidth = Math.max(38, Math.min(104, door.w * .60));
  const dialRoom = bookBelowWall ? (door.y - journal.y - journal.h + 4) * dialAspect : compactDialWidth;
  const dial = dialAboveDoor(Math.min(compactDialWidth, dialRoom));
  const travelDial = dialAboveDoor(Math.min(288, door.w * 1.65,
    (doorCenter - (bookBelowWall ? 7 : page.x + page.w + 5)) * 2,
    (window.x - doorCenter - 8) * 2, (door.y - wallTop + 4) * dialAspect));
  const shelfW = Math.min(width * (narrow ? .25 : .19), height * .29);
  const shelfH = portrait ? 46 : Math.min(105, height * .14);
  // Keep the aisle from the door to the counter clear at either aspect ratio.
  const shelves = bookBelowWall
    ? [
      { x: width * .045, y: horizon + 5, w: shelfW, h: shelfH },
      { x: width * .70, y: horizon + 12, w: shelfW, h: shelfH },
      { x: width * .065, y: horizon + 60, w: shelfW, h: shelfH },
    ]
    : [
      { x: width * .035, y: horizon - shelfH * .84, w: Math.min(shelfW, width * .15), h: shelfH * 1.55 },
      { x: width * .89, y: horizon + 10, w: Math.min(shelfW, width * .102), h: shelfH * 1.14 },
      { x: width * .195, y: horizon + shelfH * .05, w: Math.min(shelfW, width * .13), h: shelfH * .74 },
    ];
  const windowDisplayHeight = Math.min(46, window.h * .16);
  const windowDisplayWidth = Math.min(250, window.w * .62);
  shelves.push({ x: window.x + (window.w - windowDisplayWidth) / 2,
    y: window.y + window.h * .918 - windowDisplayHeight * .80,
    w: windowDisplayWidth, h: windowDisplayHeight });
  const counterW = width * (narrow ? .90 : .86);
  const counter = { x: (width - counterW) / 2, y: height * .835, w: counterW, h: height * .165 };
  const bell = { x: counter.x + counter.w * .70, y: counter.y - 32, w: 48, h: 49 };
  const bookW = Math.max(104, Math.min(196, counterW * (narrow ? .45 : .54)));
  const book = { x: counter.x + counter.w * (narrow ? .11 : .44), y: counter.y - 39, w: bookW, h: 63 };
  const visitorH = portrait ? 100 : Math.min(225, height * .24);
  const visitorW = Math.min(visitorH * .90, width * .24);
  const visitor = { x: width * (portrait ? .12 : .34), y: counter.y - visitorH + 6, w: visitorW, h: visitorH };
  const sceneDoor = mapScene([1148, 140, 270, 420]);
  const sceneWindow = mapScene([410, 12, 650, 270]);
  // Three floor displays and the window display: two angled wall shelves, the center table, and the counter.
  const sceneShelves = [
    mapScene([115, 177, 235, 114]),
    mapScene([115, 278, 235, 132]),
    mapScene([640, 610, 380, 105]),
    mapScene([660, 365, 440, 100]),
  ];
  const sceneCounter = mapScene([628, 351, 568, 250]);
  const sceneBell = mapScene([1090, 305, 75, 124]);
  const sceneVisitor = mapScene([545, 348, 320, 320]);
  return {
    portrait, narrow, bookBelowWall, scene, sceneDoor, sceneWindow, sceneShelves, sceneCounter, sceneBell, sceneVisitor,
    door, window, dial, travelDial, journal, bay, shelves, counter, bell, book, visitor, horizon, page,
  };
}
