import * as THREE from "three";

const canvas = document.querySelector("#game");
const ui = {
  clarityValue: document.querySelector("#clarityValue"),
  clarityBar: document.querySelector("#clarityBar"),
  awarenessValue: document.querySelector("#awarenessValue"),
  awarenessBar: document.querySelector("#awarenessBar"),
  staminaValue: document.querySelector("#staminaValue"),
  staminaBar: document.querySelector("#staminaBar"),
  scorePill: document.querySelector("#scorePill"),
  actionText: document.querySelector("#actionText"),
  nearestText: document.querySelector("#nearestText"),
  missionText: document.querySelector("#missionText"),
  actionButton: document.querySelector("#actionButton"),
  restartButton: document.querySelector("#restartButton"),
  upgradeModal: document.querySelector("#upgradeModal"),
  radarMap: document.querySelector("#radarMap")
};

const oldLake = { cx: 642, cy: 375, rx: 495, ry: 255 };
const lake = { rx: 14.1, rz: 7.3 };
const playableLakeMargin = 1.28;
const recycle = oldToWorld(174, 195);
const keys = new Set();
const pointer = { dragging: false, x: 0, y: 0 };
const clock = new THREE.Clock();
const trashTypes = [
  { name: "纸杯", color: 0xf3f0dc, size: [0.34, 0.2, 0.24] },
  { name: "塑料瓶", color: 0xc5e8f0, size: [0.5, 0.16, 0.16] },
  { name: "包装袋", color: 0xe96a4f, size: [0.38, 0.12, 0.32] },
  { name: "面包袋", color: 0xe3b34c, size: [0.36, 0.14, 0.26] }
];

let state;
let audio;
let yaw = -0.5;
let pitch = -0.12;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe2e5);
scene.fog = new THREE.Fog(0xbfe2e5, 20, 48);

const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.08, 90);
camera.rotation.order = "YXZ";
scene.add(camera);

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(-8, 16, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xdff5ff, 0x7d9a58, 1.7));

const world = new THREE.Group();
const dynamic = new THREE.Group();
scene.add(world, dynamic);

const refs = {
  water: null,
  duckView: null,
  recycle: null,
  trash: new Map(),
  visitors: new Map(),
  thrown: new Set(),
  floatTexts: new Set(),
  rings: new Set(),
  targetBeacon: null,
  minimap: []
};

buildWorld();
buildDuckView();

function reset() {
  clearDynamic();
  yaw = -0.5;
  pitch = -0.12;
  state = {
    time: 0,
    clarity: 95,
    awareness: 12,
    combo: 0,
    comboTimer: 0,
    score: 0,
    targetScore: 14,
    result: "playing",
    upgradeOffered: false,
    upgrade: null,
    cameraShake: 0,
    duck: {
      x: oldToWorld(625, 386).x,
      z: oldToWorld(625, 386).z,
      vx: 0,
      vz: 0,
      carrying: [],
      carryCapacity: 1,
      sign: false,
      stamina: 100,
      maxStamina: 100,
      sprintDrain: 34,
      quackBoost: 0,
      sprinting: false,
      bob: 0
    },
    ripples: [],
    soundWaves: [],
    floatTexts: [],
    thrown: [],
    trash: [
      makeTrash(486, 330, 0),
      makeTrash(710, 470, 1, true),
      makeTrash(835, 320, 2)
    ],
    visitors: [
      makeVisitor(322, 139, "学生游客", 10.5),
      makeVisitor(552, 112, "小朋友", 13.2),
      makeVisitor(935, 162, "摄影游客", 12.8),
      makeVisitor(1072, 385, "路过游客", 16.4),
      makeVisitor(258, 546, "散步游客", 14.1)
    ]
  };
  const firstTarget = state.trash.find((item) => item.urgent) || state.trash[0];
  yaw = yawTo(firstTarget);
  ui.upgradeModal.hidden = true;
  syncScene(true);
  updateUi();
}

function makeTrash(x, y, typeIndex, urgent = false) {
  const p = oldToWorld(x, y);
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    x: p.x,
    z: p.z,
    vx: (Math.random() - 0.5) * 0.22,
    vz: (Math.random() - 0.5) * 0.22,
    typeIndex,
    type: trashTypes[typeIndex % trashTypes.length],
    urgent,
    age: 0,
    spin: Math.random() * Math.PI * 2
  };
}

function makeVisitor(x, y, label, timer) {
  const p = oldToWorld(x, y);
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    x: p.x,
    z: p.z,
    baseX: p.x,
    baseZ: p.z,
    label,
    timer,
    cooldown: 0,
    shame: 0,
    throwWindup: 0,
    nextTarget: null,
    drift: Math.random() * Math.PI * 2
  };
}

function oldToWorld(x, y) {
  return {
    x: (x - oldLake.cx) / (oldLake.rx / lake.rx),
    z: (y - oldLake.cy) / (oldLake.ry / lake.rz)
  };
}

function worldToOld(point) {
  return {
    x: Math.round(point.x * (oldLake.rx / lake.rx) + oldLake.cx),
    y: Math.round(point.z * (oldLake.ry / lake.rz) + oldLake.cy)
  };
}

function lakeValue(x, z) {
  return (x * x) / (lake.rx * lake.rx) + (z * z) / (lake.rz * lake.rz);
}

function isWater(x, z) {
  return lakeValue(x, z) < 1;
}

function clampToLake(point, margin = 0.96) {
  const v = Math.sqrt(lakeValue(point.x, point.z));
  if (!Number.isFinite(v) || v === 0) return { ...point, x: 0, z: 0 };
  if (v <= margin) return point;
  const scale = margin / v;
  return {
    ...point,
    x: point.x * scale,
    z: point.z * scale
  };
}

function randomWaterTarget() {
  for (let i = 0; i < 40; i += 1) {
    const x = (Math.random() * 2 - 1) * lake.rx * 0.82;
    const z = (Math.random() * 2 - 1) * lake.rz * 0.82;
    if (isWater(x, z)) return { x, z };
  }
  return { x: 0, z: 0 };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function yawTo(point) {
  return Math.atan2(-(point.x - state.duck.x), -(point.z - state.duck.z));
}

function clearDynamic() {
  for (const group of [dynamic, camera]) {
    for (let i = group.children.length - 1; i >= 0; i -= 1) {
      const child = group.children[i];
      if (child.userData.keep) continue;
      group.remove(child);
      disposeObject(child);
    }
  }
  refs.trash.clear();
  refs.visitors.clear();
  refs.thrown.clear();
  refs.floatTexts.clear();
  refs.rings.clear();
  refs.targetBeacon = null;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}

function buildWorld() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 48),
    new THREE.MeshStandardMaterial({ color: 0xd2d89d, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  world.add(ground);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    new THREE.MeshPhysicalMaterial({
      color: 0x4ea3b6,
      roughness: 0.42,
      metalness: 0,
      transmission: 0,
      clearcoat: 0.45,
      clearcoatRoughness: 0.32
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.scale.set(lake.rx, lake.rz, 1);
  water.position.y = 0;
  water.receiveShadow = true;
  refs.water = water;
  world.add(water);

  const shore = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.045, 8, 128),
    new THREE.MeshStandardMaterial({ color: 0xead899, roughness: 0.8 })
  );
  shore.rotation.x = Math.PI / 2;
  shore.scale.set(lake.rx, lake.rz, 1);
  shore.position.y = 0.04;
  world.add(shore);

  addBridge();
  addTrees();
  addIsland();
  addRecycle();
  addBoundaryFence();
}

function addBridge() {
  const group = new THREE.Group();
  group.position.set(9.8, 0.12, 4.1);
  group.rotation.y = -0.2;
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.18, 0.56),
    new THREE.MeshStandardMaterial({ color: 0xb96d42, roughness: 0.7 })
  );
  deck.castShadow = true;
  group.add(deck);
  for (let x = -1.9; x <= 1.9; x += 0.48) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.7, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x853f2d, roughness: 0.7 })
    );
    post.position.set(x, 0.3, -0.22);
    post.castShadow = true;
    group.add(post);
  }
  world.add(group);
}

function addTrees() {
  const treePositions = [
    [-15.7, -7.6], [-14.3, -7.5], [15.1, -5.1], [14.2, 2.0],
    [-15.8, 5.4], [-8.6, 8.3], [2.2, -9.2], [11.2, -8.2],
    [-6.2, -8.6], [13.5, 7.0], [-12.1, 6.6], [16.0, 0.4]
  ];
  for (const [x, z] of treePositions) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x9f5a38, roughness: 0.9 })
    );
    trunk.position.y = 0.38;
    trunk.castShadow = true;
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.62 + Math.random() * 0.16, 1),
      new THREE.MeshStandardMaterial({ color: 0x5f8f43, roughness: 0.85 })
    );
    crown.position.y = 1.0;
    crown.castShadow = true;
    group.add(trunk, crown);
    world.add(group);
  }
}

function addBoundaryFence() {
  const material = new THREE.MeshStandardMaterial({ color: 0x8a5a38, roughness: 0.72 });
  const postGeometry = new THREE.BoxGeometry(0.16, 0.78, 0.16);
  const railGeometry = new THREE.BoxGeometry(1.55, 0.13, 0.12);
  const group = new THREE.Group();

  const addPost = (x, z) => {
    const post = new THREE.Mesh(postGeometry, material);
    post.position.set(x, 0.36, z);
    post.castShadow = true;
    group.add(post);
  };
  const addRail = (a, b) => {
    const rail = new THREE.Mesh(railGeometry, material);
    rail.position.set((a.x + b.x) / 2, 0.62, (a.z + b.z) / 2);
    rail.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    rail.castShadow = true;
    group.add(rail);
  };

  const points = [];
  for (let i = 0; i < 42; i += 1) {
    const a = i / 42 * Math.PI * 2;
    points.push({
      x: Math.cos(a) * lake.rx * playableLakeMargin,
      z: Math.sin(a) * lake.rz * playableLakeMargin
    });
  }
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    addPost(a.x, a.z);
    addRail(a, b);
  }
  world.add(group);
}

function addIsland() {
  const group = new THREE.Group();
  group.position.set(0.25, 0.03, -0.43);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.85, 1.95, 0.24, 36),
    new THREE.MeshStandardMaterial({ color: 0xd2c27d, roughness: 0.9 })
  );
  base.scale.z = 0.52;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  for (const [x, z, r] of [[-0.65, -0.16, 0.48], [0.55, -0.18, 0.56]]) {
    const bush = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),
      new THREE.MeshStandardMaterial({ color: 0x668f3c, roughness: 0.86 })
    );
    bush.position.set(x, 0.45, z);
    bush.castShadow = true;
    group.add(bush);
  }
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.78, 0.45),
    new THREE.MeshStandardMaterial({ color: 0xb24d32, roughness: 0.7 })
  );
  tower.position.set(0.14, 0.54, 0.1);
  tower.castShadow = true;
  group.add(tower);
  world.add(group);
}

function addRecycle() {
  const group = new THREE.Group();
  group.position.set(recycle.x, 0.05, recycle.z);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 0.04, 32),
    new THREE.MeshStandardMaterial({ color: 0x2d8064, transparent: true, opacity: 0.32 })
  );
  const bin = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.86, 0.62),
    new THREE.MeshStandardMaterial({ color: 0x2d8064, roughness: 0.65 })
  );
  bin.position.y = 0.45;
  bin.castShadow = true;
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.16, 0.76),
    new THREE.MeshStandardMaterial({ color: 0xe9f5e9, roughness: 0.7 })
  );
  lid.position.y = 0.94;
  lid.castShadow = true;
  group.add(base, bin, lid);
  refs.recycle = group;
  world.add(group);
}

function buildDuckView() {
  const group = new THREE.Group();
  group.userData.keep = true;
  group.position.set(0.08, -1.28, -0.92);
  group.scale.setScalar(0.38);

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xf1d85a, roughness: 0.65 })
  );
  body.scale.set(1.8, 0.62, 0.92);
  body.position.set(-0.16, -0.03, 0.05);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xf6e980, roughness: 0.62 })
  );
  head.position.set(0.24, 0.12, -0.1);
  head.scale.set(1.05, 0.9, 0.92);

  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.45, 4),
    new THREE.MeshStandardMaterial({ color: 0xe06f2a, roughness: 0.7 })
  );
  beak.position.set(0.32, 0.08, -0.42);
  beak.rotation.x = Math.PI / 2;
  beak.rotation.z = Math.PI / 4;
  beak.scale.set(1.0, 0.55, 0.55);

  const wing = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 18, 12),
    new THREE.MeshStandardMaterial({ color: 0xd4ba32, roughness: 0.72 })
  );
  wing.scale.set(1.2, 0.32, 0.64);
  wing.position.set(-0.34, -0.04, -0.04);

  group.add(body, head, beak, wing);
  refs.duckView = group;
  camera.add(group);
}

function createTrashMesh(item) {
  const group = new THREE.Group();
  const [w, h, d] = item.type.size;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color: item.type.color,
      roughness: 0.62,
      emissive: item.urgent ? 0x4c0907 : 0x000000,
      emissiveIntensity: item.urgent ? 0.35 : 0
    })
  );
  body.castShadow = true;
  group.add(body);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.025, 8, 36),
    new THREE.MeshBasicMaterial({ color: item.urgent ? 0xb33327 : 0xffffff, transparent: true, opacity: item.urgent ? 0.9 : 0.0 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.03;
  group.add(ring);
  group.userData.ring = ring;
  dynamic.add(group);
  return group;
}

function createVisitorMesh(visitor) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c59b, roughness: 0.75 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x315f96, roughness: 0.72 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x273c3d, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.58, 0.2), shirt);
  body.position.y = 0.74;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), skin);
  head.position.y = 1.16;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.1), pants);
  legL.position.set(-0.09, 0.28, 0);
  const legR = legL.clone();
  legR.position.x = 0.09;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.08), shirt);
  armL.position.set(-0.25, 0.76, 0);
  armL.rotation.z = -0.55;
  const armR = armL.clone();
  armR.position.x = 0.25;
  armR.rotation.z = 0.55;
  for (const part of [body, head, legL, legR, armL, armR]) part.castShadow = true;
  group.add(body, head, legL, legR, armL, armR);
  group.userData = { shirt, arms: [armL, armR] };
  dynamic.add(group);
  return group;
}

function createFloatText(text, color) {
  const canvasText = document.createElement("canvas");
  canvasText.width = 512;
  canvasText.height = 128;
  const ctx = canvasText.getContext("2d");
  ctx.clearRect(0, 0, canvasText.width, canvasText.height);
  ctx.font = "900 54px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 9;
  ctx.strokeStyle = "rgba(255,255,251,0.92)";
  ctx.strokeText(text, 256, 64);
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(canvasText);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(2.3, 0.58, 1);
  dynamic.add(sprite);
  refs.floatTexts.add(sprite);
  return sprite;
}

function createTargetBeacon() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xb33327, transparent: true, opacity: 0.82 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 56), material);
  ring.rotation.x = Math.PI / 2;
  const topRing = ring.clone();
  topRing.position.y = 1.25;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 4), material);
  cone.position.y = 1.8;
  cone.rotation.y = Math.PI / 4;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.1, 10),
    new THREE.MeshBasicMaterial({ color: 0xb33327, transparent: true, opacity: 0.28 })
  );
  beam.position.y = 0.95;
  group.add(ring, topRing, cone, beam);
  dynamic.add(group);
  return group;
}

function addText(text, x, z, color = "#173638") {
  state.floatTexts.push({ text, x, z, y: 1.15, a: 1, color, mesh: createFloatText(text, color) });
}

function addRipple(x, z, color = 0xffffff) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.014, 8, 56),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.58 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, 0.035, z);
  dynamic.add(ring);
  refs.rings.add(ring);
  state.ripples.push({ mesh: ring, r: 0.18, a: 1, speed: 1.8 });
}

function addSoundWave(x, z, radius, color = 0xd24d3f) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.02, 8, 72),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, 0.055, z);
  dynamic.add(ring);
  refs.rings.add(ring);
  state.soundWaves.push({ mesh: ring, r: 0.24, max: radius, a: 1, speed: 4.8 });
}

function nearestTrash() {
  if (state.trash.length === 0) return null;
  let best = state.trash[0];
  let bestD = dist(state.duck, best);
  for (const item of state.trash) {
    const d = dist(state.duck, item);
    if (d < bestD) {
      best = item;
      bestD = d;
    }
  }
  return { item: best, d: bestD };
}

function nearestVisitor() {
  let best = null;
  let bestD = Infinity;
  for (const visitor of state.visitors) {
    const d = dist(state.duck, visitor);
    if (d < bestD) {
      best = visitor;
      bestD = d;
    }
  }
  return { visitor: best, d: bestD };
}

function carryingCount() {
  return state.duck.carrying.length;
}

function carryingFull() {
  return carryingCount() >= state.duck.carryCapacity;
}

function carriedLabel(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0].urgent ? "污染热点" : items[0].type.name;
  return `${items.length} 件垃圾`;
}

function maybeOfferUpgrade() {
  if (state.score < 10 || state.upgradeOffered) return;
  state.upgradeOffered = true;
  state.result = "upgrade";
  ui.upgradeModal.hidden = false;
  document.exitPointerLock?.();
  updateUi();
}

function performAction() {
  resumeAudio();
  if (state.result !== "playing") {
    if (state.result !== "upgrade") reset();
    return;
  }
  const duck = state.duck;

  if (carryingCount() > 0 && dist(duck, recycle) < 2.1) {
    const cleanedItems = [...duck.carrying];
    const urgentCleaned = cleanedItems.filter((item) => item.urgent).length;
    const comboBonus = state.comboTimer > 0 ? Math.min(4, state.combo) : 0;
    duck.carrying = [];
    state.score += cleanedItems.length;
    state.combo = Math.min(9, state.combo + 1);
    state.comboTimer = 8;
    state.clarity = Math.min(100, state.clarity + cleanedItems.length * 5.5 + urgentCleaned * 4.5 + comboBonus * 1.1);
    addText(`回收 ${carriedLabel(cleanedItems)}${comboBonus ? ` x${state.combo}` : ""}`, recycle.x, recycle.z, "#2d8064");
    addRipple(recycle.x, recycle.z, 0x2d8064);
    playDrop();
    if (state.score >= 4 && !duck.sign) {
      duck.sign = true;
      addText("学生递来了小告示牌", duck.x, duck.z, "#b45c12");
    }
    maybeOfferUpgrade();
    return;
  }

  if (!carryingFull()) {
    const target = nearestTrash();
    if (target && target.d < 1.45) {
      duck.carrying.push(target.item);
      removeTrashMesh(target.item);
      state.trash = state.trash.filter((item) => item !== target.item);
      addText(`叼起 ${target.item.urgent ? "污染热点" : target.item.type.name}`, duck.x, duck.z, target.item.urgent ? "#b33327" : "#315f96");
      addRipple(target.item.x, target.item.z);
      playPickup();
      syncScene();
      return;
    }
  }

  playQuack();
  const radius = (state.duck.sign ? 4.4 : 3.2) + state.duck.quackBoost * 0.03;
  let warnedCount = 0;
  for (const v of state.visitors) {
    if (dist(duck, v) <= radius) {
      v.cooldown = Math.max(v.cooldown, (state.duck.sign ? 40 : 28) + state.duck.quackBoost * 0.1);
      v.shame = 2.2;
      v.throwWindup = 0;
      v.nextTarget = null;
      v.timer += (state.duck.sign ? 12 : 8) + state.duck.quackBoost * 0.08;
      warnedCount += 1;
      addText(state.duck.sign ? "请勿投喂与乱丢" : "嘎!", v.x, v.z, "#b33327");
    }
  }
  addRipple(duck.x, duck.z, warnedCount ? 0xd24d3f : 0x315f96);
  addSoundWave(duck.x, duck.z, radius, warnedCount ? 0xd24d3f : 0x315f96);
  if (warnedCount > 0) {
    state.awareness = Math.min(100, state.awareness + warnedCount * (state.duck.sign ? 8 : 4));
    addText(`提醒 ${warnedCount} 人`, duck.x, duck.z, "#b33327");
  } else {
    addText("嘎", duck.x, duck.z, "#315f96");
  }
}

function update(dt) {
  if (state.result !== "playing") {
    updateParticles(dt);
    syncScene();
    updateCamera(dt);
    return;
  }

  state.time += dt;
  const urgentCount = state.trash.filter((item) => item.urgent).length;
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer <= 0) state.combo = 0;
  state.clarity -= (state.trash.length * 0.07 + urgentCount * 0.12) * dt;
  state.clarity = clamp(state.clarity, 0, 100);
  if (state.clarity <= 6) {
    state.result = "lost";
    addText("湖面失守", state.duck.x, state.duck.z, "#b33327");
  }
  if (state.score >= state.targetScore && state.clarity >= 35) {
    state.result = "won";
    addText("未名湖恢复清澈", state.duck.x, state.duck.z, "#2d8064");
  }

  updateDuck(dt);
  updateVisitors(dt);
  updateThrown(dt);
  updateTrash(dt);
  updateParticles(dt);
  syncScene();
  updateCamera(dt);
  updateUi();
}

function updateDuck(dt) {
  const duck = state.duck;
  let forward = 0;
  let strafe = 0;
  let turn = 0;
  if (keys.has("ArrowLeft") || keys.has("a")) turn -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) turn += 1;
  if (keys.has("ArrowUp") || keys.has("w")) forward += 1;
  if (keys.has("ArrowDown") || keys.has("s")) forward -= 0.62;
  if (keys.has("q")) strafe -= 1;
  if (keys.has("e")) strafe += 1;

  yaw = wrapAngle(yaw - turn * dt * 2.45);
  const dirX = -Math.sin(yaw);
  const dirZ = -Math.cos(yaw);
  let mx = dirX * forward + Math.cos(yaw) * strafe * 0.72;
  let mz = dirZ * forward - Math.sin(yaw) * strafe * 0.72;
  const m = Math.hypot(mx, mz);
  if (m > 0) {
    mx /= m;
    mz /= m;
  }

  const wantsSprint = (keys.has("Shift") || keys.has("shift")) && m > 0 && duck.stamina > 2;
  duck.sprinting = wantsSprint;
  if (wantsSprint) duck.stamina = Math.max(0, duck.stamina - dt * duck.sprintDrain);
  else duck.stamina = Math.min(duck.maxStamina, duck.stamina + dt * (isWater(duck.x, duck.z) ? 20 : 28));

  const baseSpeed = isWater(duck.x, duck.z) ? 5.3 : 3.0;
  const speed = baseSpeed * (duck.sprinting ? 1.55 : 1);
  duck.vx += (mx * speed - duck.vx) * Math.min(1, dt * 9);
  duck.vz += (mz * speed - duck.vz) * Math.min(1, dt * 9);
  const nextX = duck.x + duck.vx * dt;
  const nextZ = duck.z + duck.vz * dt;
  const p = clampToLake({ x: nextX, z: nextZ }, playableLakeMargin);
  if (p.x !== nextX || p.z !== nextZ) {
    duck.vx = 0;
    duck.vz = 0;
  }
  duck.x = p.x;
  duck.z = p.z;
  duck.bob += dt * (m > 0 ? 10 : 4);

  if (Math.hypot(duck.vx, duck.vz) > 1.0 && state.time % 0.28 < dt) {
    addRipple(duck.x - dirX * 0.5, duck.z - dirZ * 0.5);
    playSplash(duck.sprinting);
  }
}

function updateVisitors(dt) {
  for (const visitor of state.visitors) {
    visitor.drift += dt;
    visitor.x = visitor.baseX + Math.cos(visitor.drift * 0.7) * 0.2;
    visitor.z = visitor.baseZ + Math.sin(visitor.drift * 0.9) * 0.14;
    visitor.cooldown = Math.max(0, visitor.cooldown - dt);
    visitor.shame = Math.max(0, visitor.shame - dt);

    if (visitor.cooldown > 0) continue;
    visitor.timer -= dt;
    if (visitor.timer < 1.1 && !visitor.nextTarget) {
      visitor.nextTarget = randomWaterTarget();
      visitor.throwWindup = 1.1;
    }
    if (visitor.throwWindup > 0) visitor.throwWindup -= dt;
    if (visitor.timer <= 0) {
      const target = visitor.nextTarget || randomWaterTarget();
      const typeIndex = Math.floor(Math.random() * trashTypes.length);
      const urgent = Math.random() < 0.12;
      state.thrown.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
        x: visitor.x,
        z: visitor.z,
        sx: visitor.x,
        sz: visitor.z,
        tx: target.x,
        tz: target.z,
        t: 0,
        typeIndex,
        urgent,
        mesh: null
      });
      visitor.timer = 14 + Math.random() * 10 + state.awareness * 0.18 + (state.upgrade === "voice" ? 7 : 0);
      visitor.nextTarget = null;
      visitor.throwWindup = 0;
    }
  }
}

function updateThrown(dt) {
  for (const item of state.thrown) {
    item.t += dt * 1.45;
    const t = Math.min(1, item.t);
    const arc = Math.sin(t * Math.PI) * 2.4;
    item.x = item.sx + (item.tx - item.sx) * t;
    item.z = item.sz + (item.tz - item.sz) * t;
    item.y = 1.05 + arc;
    if (t >= 1) {
      state.trash.push(makeTrashWorld(item.tx, item.tz, item.typeIndex, item.urgent));
      addRipple(item.tx, item.tz, 0xd24d3f);
      state.cameraShake = 0.16;
    }
  }
  for (const item of state.thrown.filter((item) => item.t >= 1)) {
    if (item.mesh) {
      dynamic.remove(item.mesh);
      disposeObject(item.mesh);
    }
  }
  state.thrown = state.thrown.filter((item) => item.t < 1);
  state.cameraShake = Math.max(0, state.cameraShake - dt);
}

function makeTrashWorld(x, z, typeIndex, urgent = false) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    x,
    z,
    vx: (Math.random() - 0.5) * 0.22,
    vz: (Math.random() - 0.5) * 0.22,
    typeIndex,
    type: trashTypes[typeIndex % trashTypes.length],
    urgent,
    age: 0,
    spin: Math.random() * Math.PI * 2
  };
}

function updateTrash(dt) {
  for (const item of state.trash) {
    item.age += dt;
    item.spin += dt * 1.3;
    item.x += item.vx * dt;
    item.z += item.vz * dt;
    item.vx += Math.sin(item.age * 1.7 + item.x * 2.1) * dt * 0.08;
    item.vz += Math.cos(item.age * 1.3 + item.z * 2.1) * dt * 0.06;
    item.vx *= 0.985;
    item.vz *= 0.985;
    if (!isWater(item.x, item.z)) {
      const p = clampToLake(item, 0.95);
      item.x = p.x;
      item.z = p.z;
      item.vx *= -0.4;
      item.vz *= -0.4;
    }
  }
}

function updateParticles(dt) {
  for (const ripple of state.ripples) {
    ripple.r += dt * ripple.speed;
    ripple.a -= dt * 1.15;
    ripple.mesh.scale.setScalar(ripple.r / 0.18);
    ripple.mesh.material.opacity = Math.max(0, ripple.a * 0.55);
  }
  for (const ripple of state.ripples.filter((ripple) => ripple.a <= 0)) removeMesh(ripple.mesh);
  state.ripples = state.ripples.filter((ripple) => ripple.a > 0);

  for (const wave of state.soundWaves) {
    wave.r += dt * wave.speed;
    wave.a = Math.max(0, 1 - wave.r / wave.max);
    wave.mesh.scale.setScalar(wave.r / 0.24);
    wave.mesh.material.opacity = Math.max(0, wave.a * 0.68);
  }
  for (const wave of state.soundWaves.filter((wave) => wave.a <= 0 || wave.r >= wave.max)) removeMesh(wave.mesh);
  state.soundWaves = state.soundWaves.filter((wave) => wave.a > 0 && wave.r < wave.max);

  for (const text of state.floatTexts) {
    text.y += dt * 0.65;
    text.a -= dt * 0.78;
    text.mesh.position.set(text.x, text.y, text.z);
    text.mesh.material.opacity = Math.max(0, text.a);
  }
  for (const text of state.floatTexts.filter((text) => text.a <= 0)) removeMesh(text.mesh);
  state.floatTexts = state.floatTexts.filter((text) => text.a > 0);
}

function removeMesh(mesh) {
  dynamic.remove(mesh);
  refs.rings.delete(mesh);
  refs.floatTexts.delete(mesh);
  disposeObject(mesh);
}

function syncScene(force = false) {
  if (!state) return;
  refs.water.material.color.setHex(state.clarity > 45 ? 0x4ea3b6 : 0x596f74);
  const nearest = nearestTrash();

  for (const item of state.trash) {
    let mesh = refs.trash.get(item.id);
    if (!mesh) {
      mesh = createTrashMesh(item);
      refs.trash.set(item.id, mesh);
    }
    mesh.position.set(item.x, 0.16 + Math.sin(state.time * 2 + item.age) * 0.035, item.z);
    mesh.rotation.set(0.1 * Math.sin(item.age), item.spin, 0.18 * Math.cos(item.age));
    mesh.userData.ring.material.opacity = item.urgent || nearest?.item === item ? 0.9 : 0;
  }
  for (const [id, mesh] of [...refs.trash.entries()]) {
    if (!state.trash.some((item) => item.id === id)) {
      dynamic.remove(mesh);
      disposeObject(mesh);
      refs.trash.delete(id);
    }
  }

  for (const visitor of state.visitors) {
    let mesh = refs.visitors.get(visitor.id);
    if (!mesh || force) {
      if (mesh) {
        dynamic.remove(mesh);
        disposeObject(mesh);
      }
      mesh = createVisitorMesh(visitor);
      refs.visitors.set(visitor.id, mesh);
    }
    mesh.position.set(visitor.x, 0, visitor.z);
    mesh.lookAt(camera.position.x, 0, camera.position.z);
    mesh.userData.shirt.color.setHex(visitor.cooldown > 0 ? 0x6a9b5a : 0x315f96);
    const wind = visitor.throwWindup > 0 ? 1 : 0;
    mesh.userData.arms[0].rotation.z = -0.55 - wind * 0.7;
    mesh.userData.arms[1].rotation.z = 0.55 + wind * 0.7;
  }

  for (const item of state.thrown) {
    if (!item.mesh) {
      item.mesh = createTrashMesh({ ...item, type: trashTypes[item.typeIndex] });
      item.mesh.userData.ring.visible = false;
      refs.thrown.add(item.mesh);
    }
    item.mesh.position.set(item.x, item.y || 1, item.z);
    item.mesh.rotation.set(item.t * 4, item.t * 8, item.t * 3);
  }

  refs.recycle.rotation.y = state.time * 0.25;
  if (nearest) {
    if (!refs.targetBeacon) refs.targetBeacon = createTargetBeacon();
    refs.targetBeacon.visible = true;
    refs.targetBeacon.position.set(nearest.item.x, 0.12 + Math.sin(state.time * 3) * 0.04, nearest.item.z);
    refs.targetBeacon.rotation.y = state.time * 1.8;
  } else if (refs.targetBeacon) {
    refs.targetBeacon.visible = false;
  }
  updateMinimap();
}

function removeTrashMesh(item) {
  const mesh = refs.trash.get(item.id);
  if (!mesh) return;
  dynamic.remove(mesh);
  disposeObject(mesh);
  refs.trash.delete(item.id);
}

function updateCamera(dt) {
  const duck = state.duck;
  const shake = state.cameraShake > 0 ? (Math.random() - 0.5) * state.cameraShake * 0.16 : 0;
  camera.position.set(duck.x + shake, 0.72 + Math.sin(duck.bob) * 0.035, duck.z + shake);
  camera.rotation.set(pitch, yaw, 0);
  refs.duckView.position.y = -1.28 + Math.sin(duck.bob) * 0.018;
}

function updateMinimap() {
  for (const item of refs.minimap) item.remove();
  refs.minimap = [];

  if (!ui.radarMap) return;
  const makeDot = (x, z, className) => {
    const dot = document.createElement("i");
    dot.className = `radar-dot ${className}`;
    dot.style.left = `${50 + x / lake.rx * 42}%`;
    dot.style.top = `${50 + z / lake.rz * 38}%`;
    ui.radarMap.append(dot);
    refs.minimap.push(dot);
  };
  makeDot(state.duck.x, state.duck.z, "duck");
  for (const item of state.trash) makeDot(item.x, item.z, item.urgent ? "urgent" : "trash");
}

function updateUi() {
  const clarity = Math.round(state.clarity);
  const awareness = Math.round(state.awareness);
  const stamina = Math.round(state.duck.stamina);
  const staminaPct = Math.round(state.duck.stamina / state.duck.maxStamina * 100);
  ui.clarityValue.textContent = `${clarity}%`;
  ui.awarenessValue.textContent = `${awareness}%`;
  ui.staminaValue.textContent = `${stamina}/${state.duck.maxStamina}`;
  ui.clarityBar.style.width = `${clarity}%`;
  ui.awarenessBar.style.width = `${awareness}%`;
  ui.staminaBar.style.width = `${staminaPct}%`;
  ui.scorePill.textContent = state.combo > 1 ? `清理 ${state.score} / ${state.targetScore}  x${state.combo}` : `清理 ${state.score} / ${state.targetScore}`;

  if (state.result === "won") {
    ui.actionText.textContent = "湖面已守住";
    ui.missionText.textContent = "Demo 完成";
    ui.nearestText.textContent = "全部处理";
    ui.actionButton.textContent = "再玩一次";
    return;
  }
  if (state.result === "lost") {
    ui.actionText.textContent = "水质过低";
    ui.missionText.textContent = "需要更快清理";
    ui.nearestText.textContent = "污染扩散";
    ui.actionButton.textContent = "重新开始";
    return;
  }
  if (state.result === "upgrade") {
    ui.actionText.textContent = "选择升级";
    ui.missionText.textContent = "清理 10 件后的奖励";
    ui.nearestText.textContent = "升级后继续";
    ui.actionButton.textContent = "等待选择";
    return;
  }

  const duck = state.duck;
  const nearTrash = nearestTrash();
  const nearVisitor = nearestVisitor();
  let action = "巡湖中";
  if (carryingCount() > 0 && dist(duck, recycle) < 2.1) action = "投放到回收点";
  else if (carryingCount() > 0) action = `叼着${carriedLabel(duck.carrying)} (${carryingCount()}/${duck.carryCapacity})`;
  else if (nearTrash && nearTrash.d < 1.45) action = `拾取${nearTrash.item.urgent ? "污染热点" : nearTrash.item.type.name}`;
  else if (nearVisitor && nearVisitor.d < (duck.sign ? 2.45 : 1.8)) action = duck.sign ? "举牌提醒游客" : "鸣叫提醒游客";
  ui.actionText.textContent = action;
  ui.actionButton.textContent = action === "巡湖中" ? "鸣叫" : "行动";

  if (nearTrash) {
    const p = worldToOld(nearTrash.item);
    ui.nearestText.textContent = `${nearTrash.item.urgent ? "污染热点 " : ""}${regionName(nearTrash.item)}  X${p.x} Y${p.y}`;
  } else {
    ui.nearestText.textContent = "未发现";
  }

  if (!duck.sign && state.score >= 4) ui.missionText.textContent = "告示牌已解锁";
  else if (state.combo > 1) ui.missionText.textContent = `连击中: ${state.combo} 次`;
  else if (carryingCount() > 0 && !carryingFull()) ui.missionText.textContent = "还可以再叼 1 件";
  else if (carryingCount() > 0) ui.missionText.textContent = "送到岸边绿色回收点";
  else if (state.trash.some((item) => item.urgent)) ui.missionText.textContent = "优先处理红色污染热点";
  else if (!state.upgradeOffered && state.score >= 8) ui.missionText.textContent = `再清理 ${10 - state.score} 件解锁升级`;
  else if (state.trash.length > 0) ui.missionText.textContent = "定位并清理漂浮垃圾";
  else ui.missionText.textContent = "盯住岸边游客";
}

function regionName(item) {
  if (Math.abs(item.x) < 4.2 && Math.abs(item.z) < 2.3) return "湖心";
  if (item.z < -2.3) return item.x < 0 ? "西北水域" : "东北水域";
  if (item.z > 2.7) return item.x < 0 ? "西南水域" : "东南水域";
  return item.x < 0 ? "西侧水域" : "东侧水域";
}

function chooseUpgrade(type) {
  if (state.result !== "upgrade") return;
  const duck = state.duck;
  state.upgrade = type;
  if (type === "capacity") {
    duck.carryCapacity = 2;
    addText("升级: 一次携带 2 件", duck.x, duck.z, "#2d8064");
  } else if (type === "stamina") {
    duck.maxStamina = 150;
    duck.stamina = 150;
    duck.sprintDrain = 23;
    addText("升级: 体力 150", duck.x, duck.z, "#b45c12");
  } else if (type === "voice") {
    duck.quackBoost = 45;
    addText("升级: 鸣叫更远", duck.x, duck.z, "#315f96");
  }
  ui.upgradeModal.hidden = true;
  state.result = "playing";
  updateUi();
}

function ensureAudio() {
  if (audio) return audio;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);
  const quack = new Audio("assets/mallard-quack.m4a");
  quack.preload = "auto";
  quack.volume = 0.62;
  audio = { ctx, master, swimReadyAt: 0, quack, quackFallback: false };
  return audio;
}

function resumeAudio() {
  const setup = ensureAudio();
  if (setup && setup.ctx.state === "suspended") setup.ctx.resume();
}

function playTone(freq, duration, type = "sine", gainValue = 0.18, bend = 1) {
  const setup = ensureAudio();
  if (!setup) return;
  const osc = setup.ctx.createOscillator();
  const gain = setup.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, setup.ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * bend), setup.ctx.currentTime + duration);
  gain.gain.setValueAtTime(gainValue, setup.ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, setup.ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(setup.master);
  osc.start();
  osc.stop(setup.ctx.currentTime + duration + 0.02);
}

function playQuack() {
  const setup = ensureAudio();
  if (!setup || setup.quackFallback) {
    playTone(380, 0.1, "triangle", 0.08, 0.74);
    return;
  }
  try {
    setup.quack.pause();
    setup.quack.currentTime = 0.65;
    setup.quack.play().catch(() => {
      setup.quackFallback = true;
      playTone(380, 0.1, "triangle", 0.08, 0.74);
    });
  } catch {
    setup.quackFallback = true;
    playTone(380, 0.1, "triangle", 0.08, 0.74);
  }
}

function playSplash(strong = false) {
  const setup = audio;
  if (!setup || setup.ctx.currentTime < setup.swimReadyAt) return;
  setup.swimReadyAt = setup.ctx.currentTime + (strong ? 0.11 : 0.23);
  playTone(strong ? 165 : 120, strong ? 0.08 : 0.06, "triangle", strong ? 0.09 : 0.045, 0.52);
}

function playPickup() {
  resumeAudio();
  playTone(720, 0.08, "triangle", 0.08, 1.38);
}

function playDrop() {
  resumeAudio();
  playTone(260, 0.11, "sine", 0.09, 1.75);
}

function resizeRenderer() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (drawingBuffer.x !== Math.round(width * renderer.getPixelRatio()) || drawingBuffer.y !== Math.round(height * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function loop() {
  const dt = Math.min(0.033, clock.getDelta());
  resizeRenderer();
  update(dt);
  renderer.render(scene, camera);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Spacebar", "Shift", "w", "a", "s", "d", "q", "e"].includes(key)) {
    event.preventDefault();
  }
  if (["w", "a", "s", "d", "q", "e", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Shift"].includes(key)) resumeAudio();
  if (key === " " || key === "Spacebar") performAction();
  else keys.add(key);
});

window.addEventListener("keyup", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.delete(key);
});

canvas.addEventListener("click", () => {
  resumeAudio();
  canvas.requestPointerLock?.();
});

window.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas) return;
  yaw = wrapAngle(yaw - event.movementX * 0.002);
  pitch = clamp(pitch - event.movementY * 0.002, -0.55, 0.35);
});

canvas.addEventListener("pointerdown", (event) => {
  resumeAudio();
  pointer.dragging = true;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointer.dragging || document.pointerLockElement === canvas) return;
  yaw = wrapAngle(yaw - (event.clientX - pointer.x) * 0.006);
  pitch = clamp(pitch - (event.clientY - pointer.y) * 0.006, -0.55, 0.35);
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});

window.addEventListener("pointerup", () => {
  pointer.dragging = false;
});

ui.actionButton.addEventListener("click", performAction);
ui.restartButton.addEventListener("click", reset);
ui.upgradeModal.addEventListener("click", (event) => {
  const button = event.target.closest("[data-upgrade]");
  if (!button) return;
  chooseUpgrade(button.dataset.upgrade);
});

reset();
renderer.setAnimationLoop(loop);
