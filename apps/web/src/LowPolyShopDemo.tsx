import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import idleReadMapSheet from './demo-assets/traveler/idle_read_map_sheet.png';
import walkReadMapSheet from './demo-assets/traveler/walk_read_map_sheet.png';
import walkSheet from './demo-assets/traveler/walk_sheet.png';
import harborSceneData from './demo-assets/harbor/scene/harbor_shop.scene.json';
import './low-poly-shop.css';

type HarborObject = {
  id: string;
  asset?: string;
  sprite_animation?: string;
  rect: [number, number, number, number];
  z_order: number;
  visible: boolean;
  opacity?: number;
  interaction?: { action: string; label: string; cursor?: string };
};

type HarborManifest = {
  authored_size: [number, number];
  background: string;
  assets: Record<string, { file: string }>;
  objects: HarborObject[];
  animations: {
    shopkeeper: Record<string, { frames: string[]; fps: number; loop: boolean }>;
  };
};

type ShopkeeperAnimation = keyof HarborManifest['animations']['shopkeeper'];
type TravelerAnimation = 'idle_read_map' | 'walk_read_map' | 'walk';
type TravelerClip = { texture: THREE.Texture; fps: number };

type SceneRig = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  nodes: Map<string, THREE.Mesh>;
  customer: THREE.Mesh;
  setDoorOpen: (open: boolean) => void;
  setLanternGlow: (enabled: boolean) => void;
  setShopkeeperAnimation: (name: ShopkeeperAnimation, elapsed: number) => void;
  setTravelerAnimation: (name: TravelerAnimation, elapsed: number) => void;
  setTravelerX: (x: number) => void;
  dispose: () => void;
};

const manifest = harborSceneData as unknown as HarborManifest;
const harborArtUrls = import.meta.glob('./demo-assets/harbor/art/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const travelerFrame = { x: 545, y: 348, width: 246, height: 246 } as const;

async function createShopScene(): Promise<SceneRig> {
  const [width, height] = manifest.authored_size;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .1, 2400);
  camera.position.set(0, 0, 1500);
  camera.lookAt(0, 0, 0);

  const loader = new THREE.TextureLoader();
  const textures = new Map<string, THREE.Texture>();
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const nodes = new Map<string, THREE.Mesh>();
  const textureByPath = new Map<string, Promise<THREE.Texture>>();
  const textureUrl = (path: string) => {
    const url = harborArtUrls['./demo-assets/harbor/' + path];
    if (!url) throw new Error('Missing harbor art: ' + path);
    return url;
  };
  const loadTexture = (path: string) => {
    const existing = textureByPath.get(path);
    if (existing) return existing;
    const pending = loader.loadAsync(textureUrl(path)).then(texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      textures.set(path, texture);
      return texture;
    });
    textureByPath.set(path, pending);
    return pending;
  };

  const shopkeeperClips = Object.values(manifest.animations.shopkeeper);
  const shopkeeperPaths = shopkeeperClips.flatMap(clip => clip.frames);
  const travelerUrls = [idleReadMapSheet, walkReadMapSheet, walkSheet];
  const travelerPromises = travelerUrls.map(async url => {
    const texture = await loader.loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.repeat.set(1 / 3, 1 / 2);
    textures.set(url, texture);
    return texture;
  });
  const kitPaths = new Set<string>([
    manifest.background,
    ...Object.values(manifest.assets).map(asset => asset.file),
    ...shopkeeperPaths,
  ]);
  const [kitTextures, travelerTextures] = await Promise.all([
    Promise.all([...kitPaths].map(async path => [path, await loadTexture(path)] as const)),
    Promise.all(travelerPromises),
  ]);
  const textureMap = new Map<string, THREE.Texture>(kitTextures);
  const travelerClips: Record<TravelerAnimation, TravelerClip> = {
    idle_read_map: { texture: travelerTextures[0], fps: 1000 / 240 },
    walk_read_map: { texture: travelerTextures[1], fps: 1000 / 160 },
    walk: { texture: travelerTextures[2], fps: 1000 / 150 },
  };

  const plane = (
    id: string,
    texture: THREE.Texture,
    rect: [number, number, number, number],
    zOrder: number,
    opacity = 1,
    additive = false,
  ) => {
    const [x, y, w, h] = rect;
    const geometry = new THREE.PlaneGeometry(w, h);
    geometries.push(geometry);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      ...(additive ? { blending: THREE.AdditiveBlending } : {}),
    });
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x + w / 2 - width / 2, height / 2 - y - h / 2, 0);
    mesh.renderOrder = zOrder;
    mesh.frustumCulled = false;
    mesh.name = id;
    mesh.userData.authoredRect = rect;
    scene.add(mesh);
    nodes.set(id, mesh);
    return mesh;
  };

  plane('background', textureMap.get(manifest.background)!, [0, 0, width, height], 0);
  const orderedObjects = [...manifest.objects].sort((a, b) => a.z_order - b.z_order);
  let shopkeeperObject: HarborObject | undefined;
  for (const object of orderedObjects) {
    if (object.sprite_animation) {
      shopkeeperObject = object;
      continue;
    }
    if (!object.asset) continue;
    const asset = manifest.assets[object.asset];
    if (!asset) continue;
    const mesh = plane(
      object.id,
      textureMap.get(asset.file)!,
      object.rect,
      object.z_order,
      object.opacity ?? 1,
    );
    mesh.visible = object.visible;
  }

  if (!shopkeeperObject) throw new Error('The harbor scene manifest has no shopkeeper placement.');
  const idleAnimation = manifest.animations.shopkeeper.idle;
  const shopkeeperMaterial = new THREE.MeshBasicMaterial({
    map: textureMap.get(idleAnimation.frames[0]),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  materials.push(shopkeeperMaterial);
  const [sx, sy, sw, sh] = shopkeeperObject.rect;
  const shopkeeperGeometry = new THREE.PlaneGeometry(sw, sh);
  geometries.push(shopkeeperGeometry);
  const shopkeeper = new THREE.Mesh(shopkeeperGeometry, shopkeeperMaterial);
  shopkeeper.position.set(sx + sw / 2 - width / 2, height / 2 - sy - sh / 2, 0);
  shopkeeper.renderOrder = shopkeeperObject.z_order;
  shopkeeper.frustumCulled = false;
  shopkeeper.name = 'shopkeeper';
  shopkeeper.userData.authoredRect = shopkeeperObject.rect;
  shopkeeper.visible = shopkeeperObject.visible;
  scene.add(shopkeeper);
  nodes.set(shopkeeperObject.id, shopkeeper);

  const glowPlanes = [
    plane('wall_lantern_glow', textureMap.get('art/effects/glow_large.png')!, [95, 205, 230, 220], 31, .20, true),
    plane('counter_lantern_glow', textureMap.get('art/effects/glow_small.png')!, [1064, 302, 120, 138], 31, .24, true),
    plane('foreground_lantern_glow', textureMap.get('art/effects/glow_large.png')!, [266, 754, 240, 210], 93, .22, true),
  ];
  const lanternGlow = new THREE.Group();
  // Keep each supplied glow as an independent plane so the kit's light switch can control it.
  for (const glow of glowPlanes) {
    scene.remove(glow);
    lanternGlow.add(glow);
  }
  scene.add(lanternGlow);

  const travelerMaterial = new THREE.MeshBasicMaterial({
    map: travelerClips.idle_read_map.texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  materials.push(travelerMaterial);
  const travelerGeometry = new THREE.PlaneGeometry(travelerFrame.width, travelerFrame.height);
  geometries.push(travelerGeometry);
  const customer = new THREE.Mesh(travelerGeometry, travelerMaterial);
  customer.name = 'traveler';
  customer.renderOrder = 32;
  customer.frustumCulled = false;
  scene.add(customer);
  const setTravelerX = (x: number) => {
    const { y, width: w, height: h } = travelerFrame;
    customer.position.set(x + w / 2 - width / 2, height / 2 - y - h / 2, 0);
    customer.userData.authoredRect = [x, y, w, h];
  };
  setTravelerX(travelerFrame.x);

  let activeTravelerAnimation: TravelerAnimation = 'idle_read_map';
  const setTravelerAnimation = (name: TravelerAnimation, elapsed: number) => {
    const clip = travelerClips[name];
    if (name !== activeTravelerAnimation) {
      activeTravelerAnimation = name;
      travelerMaterial.map = clip.texture;
      travelerMaterial.needsUpdate = true;
    }
    const frame = Math.floor(Math.max(0, elapsed) * clip.fps) % 6;
    const column = frame % 3;
    const row = Math.floor(frame / 3);
    clip.texture.offset.set(column / 3, 1 - (row + 1) / 2);
  };
  setTravelerAnimation('idle_read_map', 0);

  let activeShopkeeperAnimation: ShopkeeperAnimation = 'idle';
  let shopkeeperAnimationStartedAt = 0;
  const setShopkeeperAnimation = (name: ShopkeeperAnimation, elapsed: number) => {
    const clip = manifest.animations.shopkeeper[name];
    if (!clip) return;
    if (name !== activeShopkeeperAnimation) {
      activeShopkeeperAnimation = name;
      shopkeeperAnimationStartedAt = elapsed;
    }
    const localTime = Math.max(0, elapsed - shopkeeperAnimationStartedAt);
    const rawFrame = Math.floor(localTime * clip.fps);
    const frame = clip.loop ? rawFrame % clip.frames.length : Math.min(rawFrame, clip.frames.length - 1);
    shopkeeperMaterial.map = textureMap.get(clip.frames[frame]) ?? null;
    shopkeeperMaterial.needsUpdate = true;
  };
  setShopkeeperAnimation('idle', 0);

  const setDoorOpen = (open: boolean) => {
    const closedDoor = nodes.get('closed_door');
    const openDoor = nodes.get('open_door');
    if (closedDoor) closedDoor.visible = !open;
    if (openDoor) openDoor.visible = open;
  };
  setDoorOpen(false);
  const setLanternGlow = (enabled: boolean) => { lanternGlow.visible = enabled; };

  return {
    scene,
    camera,
    nodes,
    customer,
    setDoorOpen,
    setLanternGlow,
    setShopkeeperAnimation,
    setTravelerAnimation,
    setTravelerX,
    dispose: () => {
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
    },
  };
}

const smooth = (from: number, to: number, t: number) => {
  const u = THREE.MathUtils.clamp((t - from) / (to - from), 0, 1);
  return u * u * (3 - 2 * u);
};

export function LowPolyShopDemo() {
  const host = useRef<HTMLDivElement>(null);
  const rigRef = useRef<SceneRig | null>(null);
  const playback = useRef<number | null>(null);
  const completed = useRef(false);
  const doorOpenRef = useRef(false);
  const lanternsOnRef = useRef(true);
  const manualAnimation = useRef<ShopkeeperAnimation>('idle');
  const [status, setStatus] = useState('Traveler waits at the counter');
  const [playing, setPlaying] = useState(false);
  const [doorOpen, setDoorOpenState] = useState(false);
  const [lanternsOn, setLanternsOnState] = useState(true);
  const [shopkeeperAnimation, setShopkeeperAnimationState] = useState<ShopkeeperAnimation>('idle');

  const setDoorOpen = (open: boolean) => {
    doorOpenRef.current = open;
    rigRef.current?.setDoorOpen(open);
    setDoorOpenState(open);
  };
  const setLanternsOn = (enabled: boolean) => {
    lanternsOnRef.current = enabled;
    rigRef.current?.setLanternGlow(enabled);
    setLanternsOnState(enabled);
  };
  const selectShopkeeperAnimation = (animation: ShopkeeperAnimation) => {
    manualAnimation.current = animation;
    setShopkeeperAnimationState(animation);
  };

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let frame = 0;
    let teardown: (() => void) | undefined;

    const initialize = async () => {
      let rig: SceneRig | undefined;
      try {
        rig = await createShopScene();
        if (disposed || !host.current) {
          rig!.dispose();
          return;
        }
        const element = host.current;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x18252a, 1);
        renderer.domElement.setAttribute('aria-label', 'Interactive harbor shop assembled from 2.5D artwork with Three.js WebGL');
        element.appendChild(renderer.domElement);
        rigRef.current = rig;
        rig.setLanternGlow(lanternsOnRef.current);
        rig.setDoorOpen(doorOpenRef.current);

        const resize = () => {
          const viewportWidth = Math.max(1, element.clientWidth);
          const viewportHeight = Math.max(1, element.clientHeight);
          const scale = Math.min(viewportWidth / manifest.authored_size[0], viewportHeight / manifest.authored_size[1]);
          const viewWidth = viewportWidth / scale;
          const viewHeight = viewportHeight / scale;
          rig!.camera.left = -viewWidth / 2;
          rig!.camera.right = viewWidth / 2;
          rig!.camera.top = viewHeight / 2;
          rig!.camera.bottom = -viewHeight / 2;
          rig!.camera.updateProjectionMatrix();
          renderer.setSize(viewportWidth, viewportHeight, false);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        resize();

        let previousStatus = '';
        const animate = (now: number) => {
          const seconds = now / 1000;
          const t = playback.current === null ? -1 : seconds - playback.current;
          const arrival = smooth(0, 2.3, t);
          const departure = smooth(7.7, 9.4, t);
          rig!.customer.visible = playback.current === null ? !completed.current : t < 9.4;
          const customerX = t < 0 ? travelerFrame.x
            : t < 7.7 ? THREE.MathUtils.lerp(310, travelerFrame.x, arrival)
              : THREE.MathUtils.lerp(travelerFrame.x, 1128, departure);
          rig!.setTravelerX(customerX);
          const entering = t >= 0 && t < 2.3;
          const leaving = t >= 7.7 && t < 9.4;
          rig!.setTravelerAnimation(entering ? 'walk_read_map' : leaving ? 'walk' : 'idle_read_map',
            entering ? t : leaving ? t - 7.7 : t < 0 ? seconds : t - 2.3);

          let activeShopkeeper = manualAnimation.current;
          if (t >= 0 && t < 2.3) activeShopkeeper = t >= 1.3 ? 'greet' : 'idle';
          else if (t >= 4.4 && t < 6.0) activeShopkeeper = 'talk';
          else if (t >= 6.0 && t < 7.7) activeShopkeeper = 'trade';
          else if (t >= 7.7) activeShopkeeper = 'idle';
          rig!.setShopkeeperAnimation(activeShopkeeper, t >= 0 ? t : seconds);

          const shouldOpenDoor = t >= 7.7 && t < 9.4;
          if (doorOpenRef.current !== shouldOpenDoor && t >= 0) setDoorOpen(shouldOpenDoor);

          let nextStatus = completed.current && playback.current === null
            ? previousStatus || 'Visit complete'
            : 'Traveler waits at the counter';
          if (t >= 0 && t < 2.3) nextStatus = 'Traveler approaches the counter';
          else if (t < 4.4 && t >= 0) nextStatus = 'Traveler inspects the harbor goods';
          else if (t < 6.0 && t >= 0) nextStatus = 'Shopkeeper welcomes the traveler';
          else if (t < 7.7 && t >= 0) nextStatus = 'Shopkeeper trades the compass';
          else if (t < 9.4 && t >= 0) nextStatus = 'Traveler leaves through the harbor door';
          else if (t >= 9.4) nextStatus = 'Visit complete';
          if (nextStatus !== previousStatus) {
            previousStatus = nextStatus;
            setStatus(nextStatus);
          }
          if (t >= 10 && playback.current !== null) {
            playback.current = null;
            completed.current = true;
            manualAnimation.current = 'idle';
            setShopkeeperAnimationState('idle');
            setPlaying(false);
          }
          renderer.render(rig!.scene, rig!.camera);
          frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
        const pointToScene = (event: PointerEvent) => {
          const bounds = renderer.domElement.getBoundingClientRect();
          const scale = Math.min(bounds.width / manifest.authored_size[0], bounds.height / manifest.authored_size[1]);
          const offsetX = (bounds.width - manifest.authored_size[0] * scale) / 2;
          const offsetY = (bounds.height - manifest.authored_size[1] * scale) / 2;
          return [
            (event.clientX - bounds.left - offsetX) / scale,
            (event.clientY - bounds.top - offsetY) / scale,
          ];
        };
        const activeObject = (object: HarborObject) => {
          if (object.id === 'closed_door') return !doorOpenRef.current;
          if (object.id === 'open_door') return doorOpenRef.current;
          return object.visible;
        };
        const hitTest = (event: PointerEvent) => {
          const [x, y] = pointToScene(event);
          return [...manifest.objects].sort((a, b) => b.z_order - a.z_order).find(object => {
            if (!object.interaction || !activeObject(object)) return false;
            const [left, top, w, h] = object.rect;
            return x >= left && x <= left + w && y >= top && y <= top + h;
          });
        };
        const onPointerMove = (event: PointerEvent) => {
          const object = hitTest(event);
          renderer.domElement.style.cursor = object ? 'pointer' : 'default';
          renderer.domElement.title = object?.interaction?.label ?? '';
        };
        const onClick = (event: PointerEvent) => {
          const object = hitTest(event);
          const action = object?.interaction?.action;
          if (!object || !action) return;
          if (action === 'toggle:door') setDoorOpen(!doorOpenRef.current);
          else if (action === 'toggle:lantern') setLanternsOn(!lanternsOnRef.current);
          else if (action === 'dialogue:shopkeeper') {
            selectShopkeeperAnimation('talk');
            setStatus('Shopkeeper dialogue started');
          } else setStatus('Selected ' + object.interaction!.label);
        };
        renderer.domElement.addEventListener('pointermove', onPointerMove);
        renderer.domElement.addEventListener('click', onClick);
        teardown = () => {
          observer.disconnect();
          renderer.domElement.removeEventListener('pointermove', onPointerMove);
          renderer.domElement.removeEventListener('click', onClick);
          renderer.dispose();
          renderer.domElement.remove();
          rig!.dispose();
          rigRef.current = null;
        };
      } catch {
        rig?.dispose();
        if (!disposed) setStatus('WebGL is unavailable in this browser.');
      }
    };
    void initialize();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      teardown?.();
    };
  }, []);

  const playVisit = () => {
    completed.current = false;
    playback.current = performance.now() / 1000;
    setDoorOpen(false);
    setPlaying(true);
    setStatus('Traveler approaches the counter');
  };
  const animationNames = Object.keys(manifest.animations.shopkeeper) as ShopkeeperAnimation[];
  const nextAnimation = () => {
    const index = animationNames.indexOf(shopkeeperAnimation);
    const next = animationNames[(index + 1) % animationNames.length];
    selectShopkeeperAnimation(next);
    setStatus('Shopkeeper animation: ' + next);
  };

  return <main className="low-poly-demo" aria-label="Harbor shop 2.5D WebGL demonstration">
    <div ref={host} className="low-poly-scene" />
    <header className="low-poly-header">
      <div>
        <span className="low-poly-kicker">Undercut · WebGL study</span>
        <h1>Harbor shop</h1>
        <p>Camera-locked 2.5D art · animated traveler and shopkeeper</p>
      </div>
      <nav className="low-poly-controls" aria-label="Scene controls">
        <button className="low-poly-play" type="button" onClick={playVisit} disabled={playing}>
          {playing ? 'Visit in progress…' : 'Play customer visit'}
        </button>
        <button type="button" onClick={() => setDoorOpen(!doorOpen)}>{doorOpen ? 'Close door' : 'Open door'}</button>
        <button type="button" onClick={() => setLanternsOn(!lanternsOn)}>{lanternsOn ? 'Dim lanterns' : 'Light lanterns'}</button>
        <button type="button" onClick={nextAnimation}>Shopkeeper: {shopkeeperAnimation}</button>
      </nav>
    </header>
    <div className="low-poly-status" role="status" aria-live="polite">
      <span className="low-poly-status-light" />{status}
    </div>
    <aside className="low-poly-rig-note">
      <strong>Harbor scene kit</strong>
      <span>44 environment cutouts · orthographic layout</span>
      <span>6 shopkeeper animation sequences</span>
    </aside>
    <footer className="low-poly-footer">2.5D asset planes · native 4:3 composition · Three.js WebGL</footer>
  </main>;
}
