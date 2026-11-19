import { useEffect, useRef, useState } from 'react';
import type { Application, Container } from 'pixi.js';
import { GOODS, TOWNS, quantity, type State } from '@undercut/game-core';

type SceneProps = { state: State; onShelf?: (slot: number) => void };
type Pixi = Pick<typeof import('pixi.js'), 'Container' | 'Graphics' | 'Text'>;

function drawShop({ Container, Graphics, Text }: Pixi, { state, onShelf }: SceneProps) {
  const town = TOWNS.find(t => t.id === state.townId);
  const accent = town ? Number.parseInt(town.color.slice(1), 16) : 0xd4b678;
  const root = new Container();

  const room = new Graphics()
    .rect(0, 0, 720, 380).fill(0x202b35)
    .rect(0, 276, 720, 104).fill(0x26313a)
    .rect(0, 270, 720, 6).fill(0x36444d);
  for (const y of [305, 341, 374]) room.moveTo(0, y).lineTo(720, y).stroke({ color: 0x35414a, width: 1 });
  for (const x of [74, 194, 280, 440, 526, 646]) {
    room.moveTo(360 + (x - 360) * .72, 276).lineTo(x, 380).stroke({ color: 0x35414a, width: 1 });
  }
  root.addChild(room);

  function label(value: string, x: number, y: number, size = 16, color = 0xc3cdd2) {
    const text = new Text({ text: value, style: { fontFamily: 'sans-serif', fontSize: size, fill: color } });
    text.anchor.set(.5);
    text.position.set(x, y);
    root.addChild(text);
  }

  const door = new Graphics()
    .roundRect(293, 65, 134, 215, 54).fill(0x111a22)
    .roundRect(306, 76, 108, 193, 46).fill(state.phase === 'open' ? accent : 0x25343d)
    .roundRect(306, 76, 108, 193, 46).stroke({ color: accent, width: 2 })
    .roundRect(322, 99, 76, 76, 35).fill(0x33434b)
    .roundRect(322, 192, 76, 55, 13).fill(0x33434b)
    .circle(394, 185, 5).fill(accent);
  const dial = new Graphics().circle(360, 39, 25).fill(0x151d26).stroke({ color: 0x56616a, width: 2 });
  TOWNS.forEach((stop, i) => {
    const angle = (-90 + i * 120) * Math.PI / 180;
    dial.circle(360 + Math.cos(angle) * 15, 39 + Math.sin(angle) * 15, 4.5)
      .fill(state.townId === stop.id ? accent : 0x829096);
  });
  root.addChild(door, dial);
  label(town?.name.toUpperCase() ?? 'BETWEEN TOWNS', 360, 297, 15, accent);

  state.shelves.forEach((shelf, i) => {
    const x = [34, 478, 256][i];
    const y = i === 2 ? 325 : 154;
    const width = 208;
    const display = new Graphics()
      .roundRect(x, y, width, 46, 6).fill(0x35434e)
      .roundRect(x + 3, y + 36, width - 6, 8, 3).fill(0x967c56);
    const good = GOODS.find(item => item.id === shelf.goodId);
    if (good) {
      const count = quantity(state, good.id);
      for (let j = 0; j < Math.min(count, 5); j++) {
        display.roundRect(x + 17 + j * 34, y + 5, 24, 29, 4).fill(good.color);
      }
      label(`${good.name} · ${count} left · ${shelf.price}g`, x + width / 2, y - 15);
    } else {
      label(`Shelf ${i + 1} · empty`, x + width / 2, y - 15, 16, 0xa3afb7);
    }
    if (onShelf) {
      display.eventMode = 'static';
      display.cursor = 'pointer';
      display.on('pointertap', () => onShelf(i));
    }
    root.addChild(display);
  });

  const customer = state.phase === 'open' ? state.customers[state.served] : undefined;
  if (customer) {
    const visitor = new Graphics().ellipse(542, 339, 42, 10).fill(0x1b2731)
      .roundRect(518, 289, 48, 46, 14).fill(0x7d9d99)
      .circle(542, 276, 17).fill(0xc5b698)
      .roundRect(519, 261, 46, 5, 2).fill(0x657d7c)
      .roundRect(527, 251, 30, 12, 4).fill(0x657d7c);
    root.addChild(visitor);
    label(GOODS.find(item => item.id === customer.goodId)!.name, 542, 358, 16);
  }
  return root;
}

export function ShopScene(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const renderer = useRef<{ app: Application; pixi: Pixi; shop?: Container } | null>(null);
  const [failure, setFailure] = useState(false);

  function paint() {
    const active = renderer.current;
    if (!active) return;
    try {
      if (active.shop) active.app.stage.removeChild(active.shop).destroy({ children: true });
      active.shop = drawShop(active.pixi, latest.current);
      active.app.stage.addChild(active.shop);
      active.app.render();
    } catch {
      setFailure(true);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    void (async () => {
      try {
        const { Application, Container, Graphics, Text } = await import('pixi.js');
        // Pixi's polyfill builds uniform bindings without invoking eval under our CSP.
        await import('pixi.js/unsafe-eval');
        if (cancelled) return;
        const app = new Application();
        await app.init({ width: 720, height: 380, background: 0x202b35, preference: 'webgl',
          resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, autoStart: false, antialias: true });
        destroy = () => app.destroy(true, { children: true });
        if (cancelled) { destroy(); return; }
        renderer.current = { app, pixi: { Container, Graphics, Text } };
        host.current?.appendChild(app.canvas);
        paint();
      } catch {
        if (!cancelled) setFailure(true);
      }
    })();
    return () => {
      cancelled = true;
      renderer.current = null;
      destroy?.();
    };
  }, []);

  useEffect(() => {
    latest.current = props;
    paint();
  }, [props.state, props.onShelf]);

  return <div className={`scene${failure ? ' scene-failed' : ''}`} ref={host} role="img" aria-label="Shop view with three shelves and the magical door">
    {failure && <p className="scene-error">The shop view is unavailable in this browser. You can continue using the shop controls.</p>}
  </div>;
}
