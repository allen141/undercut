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
  const bookBelowWall = portrait || (width < 1240 && height >= 660);
  const bookHeight = bookBelowWall ? Math.max(376, height * .43) : Math.max(402, height * .49);
  const bookTop = height - bookHeight - 13;
  const horizon = bookBelowWall ? bookTop - 8 : height;
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
  const map = ([x, y, w, h]: [number, number, number, number]): Bounds => ({
    x: scene.x + x * sceneScale,
    y: scene.y + y * sceneScale,
    w: w * sceneScale,
    h: h * sceneScale,
  });

  const door = map([1148, 140, 270, 420]);
  const window = map([410, 12, 650, 270]);
  const shelves = [
    map([270, 184, 178, 126]),
    map([194, 309, 178, 118]),
    map([118, 420, 280, 120]),
    map([632, 558, 420, 112]),
  ];
  const dial = map([20, 22, 300, 147]);
  const travelDial = map([20, 22, 320, 157]);
  const journal = map([104, 862, 178, 126]);
  const bay = map([16, 20, 485, 655]);
  const counter = map([628, 351, 568, 250]);
  const bell = map([1090, 305, 75, 124]);
  const book = map([118, 863, 166, 126]);
  const visitor = map([545, 348, 320, 320]);
  return {
    portrait, narrow, bookBelowWall, scene, door, window, dial, travelDial, journal, bay, shelves,
    counter, bell, book, visitor, horizon: scene.y + scene.h, page,
  };
}