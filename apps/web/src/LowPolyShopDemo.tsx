import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import './low-poly-shop.css';

type CharacterRig = {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  rightArm: THREE.Group;
  leftArm: THREE.Group;
  rightLeg: THREE.Group;
  leftLeg: THREE.Group;
};

type SceneRig = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  customer: CharacterRig;
  merchant: CharacterRig;
  compass: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
};

function createShopScene(): SceneRig {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const material = (color: number, roughness = 1, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const result = new THREE.MeshStandardMaterial({ color, roughness, flatShading: true, ...extra });
    materials.push(result);
    return result;
  };
  const box = (parent: THREE.Object3D, size: [number, number, number], position: [number, number, number],
    surface: THREE.Material, castShadow = true) => {
    const geometry = new THREE.BoxGeometry(...size);
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(...position);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const cylinder = (parent: THREE.Object3D, top: number, bottom: number, height: number,
    position: [number, number, number], surface: THREE.Material, sides = 6) => {
    const geometry = new THREE.CylinderGeometry(top, bottom, height, sides, 1, false);
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const poly = (parent: THREE.Object3D, radius: number, position: [number, number, number], surface: THREE.Material) => {
    const geometry = new THREE.IcosahedronGeometry(radius, 0);
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2b31);
  scene.fog = new THREE.Fog(0x1d2b31, 22, 48);
  const camera = new THREE.PerspectiveCamera(40, 16 / 10, .1, 100);
  camera.position.set(0, 9.5, 14.35);
  camera.lookAt(0, 3.15, -.15);

  const mat = {
    wall: material(0x8d8878), wallLight: material(0xb8ae98),
    wood: material(0x80523e), woodLight: material(0xb37a50), woodDark: material(0x54392f),
    teal: material(0x426c6b), tealLight: material(0x6b9290), rust: material(0x9e6247),
    cream: material(0xd6c9a9), gold: material(0xf0b967, .38, { metalness: .42 }),
    dark: material(0x23383d), glass: material(0x8caeb0, .25, { transparent: true, opacity: .30, side: THREE.DoubleSide }),
    sea: material(0x607f83), leaf: material(0x687d61), stone: material(0x68777a),
    windowSky: material(0x87a7b0), harbor: material(0x526a70), harborRoof: material(0x354c54),
    windowGlow: material(0xf0b96a, .7, { emissive: 0x8c491d, emissiveIntensity: .7 }),
    skin: material(0xc88762), skinLight: material(0xd99d79),
    hair: material(0x3d3432), hairLight: material(0x6d5142), white: material(0xdacbb0),
    black: material(0x252c30), blue: material(0x496e82),
  };

  scene.add(new THREE.HemisphereLight(0xcbd7d0, 0x374147, 2.0));
  const sun = new THREE.DirectionalLight(0xffd39b, 3.1);
  sun.position.set(-5, 10, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.normalBias = .035;
  scene.add(sun);
  const windowFill = new THREE.PointLight(0x96bdc3, 24, 16, 2);
  windowFill.position.set(-1, 4.2, -3.2);
  scene.add(windowFill);

  // Dark subfloor shows through the fine seams in the individually cut boards.
  box(scene, [12, .3, 10.5], [0, -.18, 0], mat.woodDark, false);
  const plankMaterials = [0x8a5c43, 0x9a6747, 0x76513f, 0xa27350].map(color => material(color));
  for (let row = 0; row < 14; row++) {
    const z = -4.8 + row * .75;
    for (let col = 0; col < 7; col++) {
      const x = -5.15 + col * 1.72 + (row % 2) * .86;
      if (x <= 5.7) box(scene, [1.68, .08, .71], [x, .015, z], plankMaterials[(row + col) % 4], false);
    }
  }

  // Back wall with a broad harbor window, framed in timber.
  box(scene, [2.4, 6.2, .32], [-4.8, 3.1, -5.1], mat.wall);
  box(scene, [3.0, 6.2, .32], [4.7, 3.1, -5.1], mat.wall);
  box(scene, [6.6, 1.65, .32], [-.1, .82, -5.1], mat.wallLight);
  box(scene, [6.6, 1.1, .32], [-.1, 5.65, -5.1], mat.wall);
  for (const x of [-5.82, -3.55, 3.18, 5.82]) {
    box(scene, [.22, 6.2, .35], [x, 3.1, -4.88], mat.woodDark);
    box(scene, [.10, 5.8, .38], [x + .08, 3.1, -4.66], mat.woodLight);
  }
  box(scene, [12, .28, .45], [0, 6.05, -4.83], mat.woodDark);

  // Plastered side walls and timber posts enclose the shop, with its front left open to the camera.
  for (const side of [-1, 1]) {
    box(scene, [.30, 5.65, 10.45], [side * 5.86, 2.825, 0], mat.wall);
    box(scene, [.045, 4.28, 9.85], [side * 5.695, 2.78, 0], mat.wallLight, false);
    box(scene, [.065, 1.14, 10.12], [side * 5.68, .61, 0], mat.woodDark);
    box(scene, [.12, .13, 10.10], [side * 5.66, 1.22, 0], mat.woodLight);
    box(scene, [.38, .32, 10.62], [side * 5.66, 5.55, 0], mat.woodDark);
    for (const z of [-4.95, -1.72, 1.72, 4.95]) {
      box(scene, [.22, 5.58, .22], [side * 5.62, 2.79, z], mat.woodDark);
    }
  }

  // Cool coastal sky, distant roofs, lantern-lit windows and water appear only through the window.
  const skyPane = new THREE.Mesh(
    new THREE.PlaneGeometry(6.55, 3.58), mat.windowSky,
  );
  geometries.push(skyPane.geometry);
  skyPane.position.set(-.12, 3.38, -5.55);
  scene.add(skyPane);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6.55, 1.25), mat.sea);
  geometries.push(water.geometry);
  water.position.set(-.12, 2.25, -5.48);
  scene.add(water);
  for (const [y, width] of [[1.82, 6.1], [2.02, 5.5], [2.22, 6.3], [2.43, 5.7]] as const) {
    box(scene, [width, .025, .018], [-.12, y, -5.42], mat.tealLight, false);
  }

  const harborBuildings = [
    { x: -2.82, width: .72, height: .92 }, { x: -2.02, width: .58, height: .62 },
    { x: -1.24, width: .78, height: 1.15 }, { x: -.28, width: .62, height: .72 },
    { x: .58, width: .82, height: 1.34 }, { x: 1.57, width: .67, height: .82 },
    { x: 2.44, width: .82, height: 1.08 }, { x: 3.02, width: .38, height: .72 },
  ];
  for (const [index, building] of harborBuildings.entries()) {
    const base = 2.38;
    box(scene, [building.width, building.height, .08],
      [building.x, base + building.height / 2, -5.36], index % 2 ? mat.harborRoof : mat.harbor, false);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(building.width * .72, .40, 4), mat.harborRoof);
    geometries.push(roof.geometry);
    roof.position.set(building.x, base + building.height + .16, -5.35);
    roof.rotation.y = Math.PI / 4;
    scene.add(roof);
    const windowY = base + Math.min(.38, building.height * .48);
    for (const offset of [-.18, .18]) {
      if (building.width < .48 && offset > 0) continue;
      box(scene, [.09, .13, .025], [building.x + offset, windowY, -5.30], mat.windowGlow, false);
    }
  }
  // A low pier and a small moored boat establish the harbor scale beyond the glass.
  box(scene, [6.4, .07, .055], [-.12, 2.63, -5.34], mat.harborRoof, false);
  for (const x of [-2.45, -1.35, -.25, .85, 1.95, 2.85]) {
    box(scene, [.055, .48, .07], [x, 2.39, -5.34], mat.harborRoof, false);
  }
  box(scene, [.72, .12, .10], [.25, 2.93, -5.27], mat.woodDark, false);
  box(scene, [.045, .70, .04], [.25, 3.30, -5.26], mat.harborRoof, false);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(.31, .45), mat.cream);
  geometries.push(sail.geometry);
  sail.position.set(.08, 3.31, -5.24);
  scene.add(sail);

  const windowPane = box(scene, [6.55, 3.58, .035], [-.12, 3.38, -4.89], mat.glass, false);
  windowPane.renderOrder = 2;
  for (const x of [-3.35, -.12, 3.10]) box(scene, [.12, 3.75, .20], [x, 3.38, -4.76], mat.woodLight);
  for (const y of [1.58, 3.32, 5.18]) box(scene, [6.7, .16, .24], [-.12, y, -4.76], mat.woodLight);

  // The door occupies the remaining section of the back wall and faces the camera.
  box(scene, [1.55, 3.35, .18], [4.65, 1.84, -4.73], mat.woodDark);
  box(scene, [1.30, 3.03, .12], [4.65, 1.83, -4.61], mat.wood);
  box(scene, [.10, 2.72, .10], [4.65, 1.82, -4.53], mat.woodLight);
  for (const x of [3.93, 5.37]) box(scene, [.16, 3.50, .24], [x, 1.82, -4.54], mat.woodLight);
  box(scene, [1.60, .18, .24], [4.65, 3.62, -4.54], mat.woodLight);
  cylinder(scene, .07, .07, .07, [5.05, 1.85, -4.43], mat.gold, 6).rotation.x = Math.PI / 2;

  const shelf = (x: number, z: number, width: number, levels: number) => {
    box(scene, [width, .16, .55], [x, .60, z], mat.woodDark);
    for (let level = 0; level < levels; level++) {
      const y = 1.3 + level * .9;
      box(scene, [width, .12, .62], [x, y, z], mat.woodLight);
      box(scene, [.12, y + .1, .58], [x - width / 2 + .16, y / 2 + .2, z], mat.woodDark);
      box(scene, [.12, y + .1, .58], [x + width / 2 - .16, y / 2 + .2, z], mat.woodDark);
      const jarX = x - width * .27;
      cylinder(scene, .13, .18, .42, [jarX, y + .31, z], level % 2 ? mat.tealLight : mat.rust, 5);
      cylinder(scene, .09, .09, .10, [jarX, y + .57, z], mat.woodDark, 5);
      poly(scene, .24, [x + width * .18, y + .26, z], level % 2 ? mat.leaf : mat.stone);
    }
  };
  shelf(-4.75, -.1, 1.65, 3);
  shelf(3.75, -.5, 1.35, 2);

  const displayTable = (x: number, z: number, width: number, surface: THREE.Material) => {
    box(scene, [width, .15, 1.25], [x, .92, z], surface);
    box(scene, [width * .88, .12, 1.13], [x, 1.05, z], mat.woodLight);
    for (const dx of [-width * .38, width * .38]) for (const dz of [-.42, .42])
      box(scene, [.13, .85, .13], [x + dx, .45, z + dz], mat.woodDark);
  };
  displayTable(-1.9, 1.8, 2.4, mat.woodDark);
  displayTable(2.2, 1.65, 1.8, mat.teal);
  for (const [x, z, item] of [[-2.5, 1.75, 0], [-1.9, 1.82, 1], [-1.3, 1.75, 2], [1.8, 1.65, 3], [2.45, 1.65, 4]] as const) {
    poly(scene, item === 1 ? .32 : .25, [x, 1.34, z],
      [mat.gold, mat.blue, mat.cream, mat.leaf, mat.rust][item]);
  }

  // A sturdy timber counter separates the customer from the merchant.
  box(scene, [5.0, 1.0, .9], [0, .62, -2.35], mat.woodDark);
  box(scene, [5.25, .16, 1.08], [0, 1.18, -2.35], mat.woodLight);
  box(scene, [4.75, .08, .86], [0, 1.30, -2.35], mat.wood);
  for (let i = 0; i < 5; i++) box(scene, [.06, .73, .06], [-2.0 + i, .62, -1.88], mat.woodLight);
  for (const x of [-2.1, 2.15]) {
    const lantern = new THREE.Group();
    lantern.position.set(x, 2.25, -2.05);
    scene.add(lantern);
    cylinder(lantern, .16, .24, .44, [0, 0, 0], mat.woodDark, 5);
    cylinder(lantern, .20, .10, .12, [0, -.24, 0], mat.gold, 5);
    const light = new THREE.PointLight(0xffbd6a, 13, 5, 2);
    light.position.set(x, 2.05, -1.95);
    scene.add(light);
  }

  const makeCharacter = (merchant = false): CharacterRig => {
    const root = new THREE.Group();
    const torso = new THREE.Group();
    const head = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightLeg = new THREE.Group();
    const leftLeg = new THREE.Group();
    const coat = merchant ? mat.rust : mat.teal;
    const skin = merchant ? mat.skinLight : mat.skin;
    scene.add(root);
    root.add(torso, rightLeg, leftLeg);
    torso.position.set(0, .92, 0);
    box(torso, [.72, .92, .46], [0, .40, 0], coat);
    box(torso, [.34, .55, .06], [0, .36, .25], merchant ? mat.cream : mat.blue);
    cylinder(torso, .40, .43, .17, [0, .83, 0], merchant ? mat.woodDark : mat.gold, 6);
    torso.add(head, rightArm, leftArm);
    head.position.set(0, .98, .02);
    poly(head, .34, [0, .05, 0], skin);
    poly(head, .32, [0, .27, -.025], merchant ? mat.white : mat.hair);
    poly(head, .15, [-.22, .16, .08], merchant ? mat.white : mat.hairLight);
    poly(head, .15, [.21, .12, .12], merchant ? mat.white : mat.hair);
    for (const eyeX of [-.115, .115]) {
      const eyeGeometry = new THREE.SphereGeometry(.032, 5, 4);
      geometries.push(eyeGeometry);
      const eye = new THREE.Mesh(eyeGeometry, mat.black);
      eye.position.set(eyeX, .075, .296);
      head.add(eye);
    }
    poly(head, .06, [0, -.045, .32], skin);
    if (merchant) {
      poly(head, .21, [0, -.18, .21], mat.white);
      poly(head, .30, [0, .39, -.02], mat.hairLight);
      box(torso, [.54, .63, .08], [0, -.02, .28], mat.cream);
      box(torso, [.12, .16, .08], [0, .23, .34], mat.woodLight);
    } else {
      // Scarf and satchel separate the customer silhouette from the warm shop palette.
      box(torso, [.18, .48, .11], [-.29, .47, -.15], mat.gold).rotation.z = -.28;
      box(torso, [.40, .45, .24], [-.43, -.03, -.18], mat.woodDark);
      box(torso, [.34, .06, .04], [-.43, -.02, -.045], mat.woodLight);
    }
    const attachArm = (arm: THREE.Group, side: number) => {
      arm.position.set(side * .41, .69, .01);
      torso.add(arm);
      cylinder(arm, .15, .18, .48, [0, -.22, 0], coat, 5);
      const forearm = new THREE.Group();
      forearm.position.set(0, -.43, 0);
      arm.add(forearm);
      cylinder(forearm, .12, .15, .40, [0, -.19, .01], merchant ? mat.cream : coat, 5);
      poly(forearm, .13, [0, -.42, .04], skin);
    };
    attachArm(rightArm, 1);
    attachArm(leftArm, -1);
    const attachLeg = (leg: THREE.Group, side: number) => {
      leg.position.set(side * .20, .80, 0);
      root.add(leg);
      cylinder(leg, .15, .18, .44, [0, -.22, 0], merchant ? mat.woodDark : mat.blue, 5);
      const shin = new THREE.Group();
      shin.position.set(0, -.42, 0);
      leg.add(shin);
      cylinder(shin, .13, .15, .42, [0, -.20, 0], merchant ? mat.woodDark : mat.blue, 5);
      box(shin, [.28, .15, .40], [0, -.42, .09], mat.woodDark);
    };
    attachLeg(rightLeg, 1);
    attachLeg(leftLeg, -1);
    return { root, torso, head, rightArm, leftArm, rightLeg, leftLeg };
  };

  const customer = makeCharacter();
  customer.root.position.set(0, 0, .35);
  customer.root.rotation.y = 1.25;
  const merchant = makeCharacter(true);
  merchant.root.position.set(1.65, .18, -2.65);
  merchant.root.rotation.y = .22;
  merchant.root.scale.setScalar(1.08);

  // The brass compass is the prop that crosses the counter during the handoff.
  const compass = new THREE.Group();
  scene.add(compass);
  cylinder(compass, .33, .40, .15, [0, 0, 0], mat.gold, 8);
  cylinder(compass, .29, .29, .06, [0, .09, 0], mat.dark, 8);
  const needleGeometry = new THREE.ConeGeometry(.10, .34, 4);
  geometries.push(needleGeometry);
  const needle = new THREE.Mesh(needleGeometry, mat.gold);
  needle.position.set(0, .25, 0);
  needle.rotation.z = Math.PI / 2;
  compass.add(needle);
  compass.position.set(.62, 1.48, -2.24);

  return { scene, camera, customer, merchant, compass, geometries, materials };
}

const smooth = (from: number, to: number, t: number) => {
  const u = THREE.MathUtils.clamp((t - from) / (to - from), 0, 1);
  return u * u * (3 - 2 * u);
};

export function LowPolyShopDemo() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Customer waits at the counter');
  const [playing, setPlaying] = useState(false);
  const playback = useRef<number | null>(null);
  const completed = useRef(false);

  useEffect(() => {
    if (!host.current) return;
    let rig: SceneRig;
    let renderer: THREE.WebGLRenderer;
    try {
      rig = createShopScene();
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setStatus('WebGL is unavailable in this browser.');
      return;
    }
    const element = host.current;
    const pixelRatio = Math.min(1.65, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', 'Animated low-poly 3D shop rendered with WebGL');
    element.appendChild(renderer.domElement);
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(pixelRatio);
    composer.addPass(new RenderPass(rig.scene, rig.camera));
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null }, strength: { value: .028 } },
      vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse;
uniform float strength;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r2 = dot(p, p);
  vec2 warpedUv = 0.5 + 0.5 * p * (1.0 + strength * r2);
  gl_FragColor = texture2D(tDiffuse, clamp(warpedUv, vec2(0.001), vec2(0.999)));
}`,
    }));
    composer.addPass(new OutputPass());
    const resize = () => {
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      rig.camera.aspect = width / height;
      rig.camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let frame = 0;
    let previousStatus = '';
    const animate = (now: number) => {
      const seconds = now / 1000;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const t = playback.current === null ? -1 : seconds - playback.current;
      const customer = rig.customer;
      const arrival = smooth(0, 2.3, t);
      const departure = smooth(7.7, 9.4, t);
      customer.root.visible = playback.current === null ? !completed.current : t < 9.4;
      customer.root.position.x = t < 0 ? 0 : t < 7.7
        ? THREE.MathUtils.lerp(-4.15, .02, arrival) : THREE.MathUtils.lerp(.02, 4.8, departure);
      customer.root.position.z = t < 0 ? .35 : t < 7.7
        ? THREE.MathUtils.lerp(1.8, .35, arrival) : THREE.MathUtils.lerp(.35, -3.7, departure);
      customer.root.rotation.y = t >= 0 && t < 2.3 ? 1.05 : t >= 7.7 ? Math.PI * .75 : 1.25;
      const walking = t >= 0 && t < 2.3 ? 1 - smooth(1.7, 2.3, t)
        : t >= 7.7 && t < 9.4 ? 1 - smooth(8.8, 9.4, t) : 0;
      const gait = reduced ? 0 : seconds * 8.5;
      customer.rightLeg.rotation.x = Math.sin(gait) * .48 * walking;
      customer.leftLeg.rotation.x = -Math.sin(gait) * .48 * walking;
      customer.leftArm.rotation.x = -Math.sin(gait) * .26 * walking;
      const inspect = smooth(2.3, 3.2, t) * (1 - smooth(4.4, 5.1, t));
      const ask = smooth(4.25, 4.75, t) * (1 - smooth(5.6, 6.25, t));
      const reach = smooth(5.55, 6.3, t) * (1 - smooth(6.9, 7.6, t));
      customer.torso.rotation.x = -.10 * inspect - .04 * reach;
      customer.head.rotation.x = -.10 * inspect;
      customer.head.rotation.y = reduced ? 0 : Math.sin(seconds * 1.2) * .035;
      customer.rightArm.rotation.x = .12 * inspect - .45 * ask + 1.25 * reach;
      customer.rightArm.rotation.z = -.14 * ask;
      customer.torso.position.y = .92 + (reduced ? 0 : Math.sin(seconds * 2.2) * .025);
      const merchantGreet = smooth(4.5, 5.3, t) * (1 - smooth(6.1, 6.8, t));
      rig.merchant.rightArm.rotation.x = .15 + merchantGreet * .96;
      rig.merchant.torso.position.y = .92 + (reduced ? 0 : Math.sin(seconds * 1.7 + 1) * .02);
      const itemMove = smooth(6.0, 6.8, t);
      rig.compass.position.set(
        THREE.MathUtils.lerp(.62, .48, itemMove),
        THREE.MathUtils.lerp(1.48, 1.84, itemMove),
        THREE.MathUtils.lerp(-2.24, .42, itemMove),
      );
      rig.compass.rotation.y = reduced ? 0 : seconds * .42;
      let nextStatus = playback.current === null && completed.current
        ? previousStatus || 'Trade complete' : 'Customer waits at the counter';
      if (t >= 0 && t < 2.3) nextStatus = 'Customer approaches the counter';
      else if (t < 4.4 && t >= 0) nextStatus = 'Customer inspects the brass compass';
      else if (t < 6.0 && t >= 0) nextStatus = 'Customer asks the shopkeeper about it';
      else if (t < 7.7 && t >= 0) nextStatus = 'Shopkeeper hands over the compass';
      else if (t < 9.4 && t >= 0) nextStatus = 'Customer leaves through the harbor door';
      else if (t >= 9.4) nextStatus = 'Trade complete';
      if (nextStatus !== previousStatus) {
        previousStatus = nextStatus;
        setStatus(nextStatus);
      }
      if (t >= 10 && playback.current !== null) {
        playback.current = null;
        completed.current = true;
        setPlaying(false);
      }
      composer.render();
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      rig.geometries.forEach(geometry => geometry.dispose());
      rig.materials.forEach(surface => surface.dispose());
    };
  }, []);

  const replay = () => {
    completed.current = false;
    playback.current = performance.now() / 1000;
    setPlaying(true);
    setStatus('Customer approaches the counter');
  };

  return <main className="low-poly-demo" aria-label="Low-poly WebGL shop demonstration">
    <div ref={host} className="low-poly-scene" />
    <header className="low-poly-header">
      <div>
        <span className="low-poly-kicker">Undercut · WebGL study</span>
        <h1>Harbor shop</h1>
        <p>Faceted 3D room · real-time lighting · articulated customer</p>
      </div>
      <button className="low-poly-play" type="button" onClick={replay} disabled={playing}>
        {playing ? 'Visit in progress…' : 'Play customer visit'}
      </button>
    </header>
    <div className="low-poly-status" role="status" aria-live="polite">
      <span className="low-poly-status-light" />{status}
    </div>
    <aside className="low-poly-rig-note">
      <strong>Customer rig</strong>
      <span>Head · torso · shoulders · elbows · hips · knees</span>
      <span>Procedural walk, inspection, gesture and handoff</span>
    </aside>
    <footer className="low-poly-footer">Prototype scene · Three.js WebGL · faceted geometry · real-time shadows</footer>
  </main>;
}
