import * as THREE from "three";

const canvas = document.querySelector("#game");
const ui = {
  clarityValue: document.querySelector("#clarityValue"),
  clarityBar: document.querySelector("#clarityBar"),
  awarenessValue: document.querySelector("#awarenessValue"),
  awarenessBar: document.querySelector("#awarenessBar"),
  staminaValue: document.querySelector("#staminaValue"),
  staminaBar: document.querySelector("#staminaBar"),
  duckHealthMeter: document.querySelector("#duckHealthMeter"),
  duckHealthValue: document.querySelector("#duckHealthValue"),
  duckHealthBar: document.querySelector("#duckHealthBar"),
  bossHealthMeter: document.querySelector("#bossHealthMeter"),
  bossHealthValue: document.querySelector("#bossHealthValue"),
  bossHealthBar: document.querySelector("#bossHealthBar"),
  scorePill: document.querySelector("#scorePill"),
  actionText: document.querySelector("#actionText"),
  nearestText: document.querySelector("#nearestText"),
  missionText: document.querySelector("#missionText"),
  actionButton: document.querySelector("#actionButton"),
  restartButton: document.querySelector("#restartButton"),
  upgradeModal: document.querySelector("#upgradeModal"),
  upgradeTitle: document.querySelector("#upgradeTitle"),
  pauseMenu: document.querySelector("#pauseMenu"),
  resumeButton: document.querySelector("#resumeButton"),
  pauseRoundText: document.querySelector("#pauseRoundText"),
  pauseRoundProgressText: document.querySelector("#pauseRoundProgressText"),
  pauseTotalText: document.querySelector("#pauseTotalText"),
  pausePressureText: document.querySelector("#pausePressureText"),
  radarMap: document.querySelector("#radarMap")
};

const oldLake = { cx: 642, cy: 375, rx: 495, ry: 255 };
const lake = { rx: 40.5, rz: 21.2 };
const playableLakeMargin = 1.18;
const bankTopY = 0.62;
const roadTopY = 0.68;
const islandLiftY = 0.38;
const bridgeDeckTopY = 0.66;
const duckWaterEyeY = 0.34;
const duckLandEyeLift = 0.04;
const stages = [
  { id: 1, name: "第一阶段", mode: "cleanup", trashTarget: 5, pressureLabel: "普通", throwDelayScale: 1 },
  { id: 2, name: "第二阶段", mode: "cleanup", trashTarget: 15, pressureLabel: "加快", throwDelayScale: 0.54 },
  { id: 3, name: "第三阶段", mode: "boss", trashTarget: 0, pressureLabel: "重点游客", throwDelayScale: 0.3 }
];
const totalStages = stages.length;
const cleanupTrashTarget = stages.reduce((sum, stage) => sum + stage.trashTarget, 0);
const pollutionFailThreshold = 0;
const bossMaxHealth = 220;
const duckMaxHealth = 100;
const debugStage = getDebugStage();
const islandCenter = { x: lake.rx * 0.08, z: -lake.rz * 0.07 };
const stoneBoatCenter = { x: islandCenter.x + 9.2, z: islandCenter.z + 0.15 };
const bridgeCenterZ = (islandCenter.z - lake.rz * 1.02) / 2;
const islandFootprint = { x: islandCenter.x, z: islandCenter.z, rx: 8.35, rz: 4.9 };
const islandWalkable = { x: islandCenter.x, z: islandCenter.z, rx: 7.35, rz: 4.28 };
const bridgeWaterSpanLength = lake.rz * 0.92;
const bridgeHalfWidth = 1.46;
const bridgeNorthEndZ = bridgeCenterZ - bridgeWaterSpanLength / 2;
const bridgeSouthEndZ = islandCenter.z - islandWalkable.rz + 0.28;
const bridgeDeckLength = bridgeSouthEndZ - bridgeNorthEndZ;
const bridgeDeckCenterZ = (bridgeNorthEndZ + bridgeSouthEndZ) / 2;
const bridgeApproachNorthEndZ = -lake.rz * 1.15;
const bridgeApproachSouthEndZ = bridgeNorthEndZ;
const duckStart = { x: -lake.rx * 0.28, z: lake.rz * 0.13 };
const recycleSpots = [-2.45, -1.45, -0.45, 0.55, 1.55, 2.55].map((a) => ({
  x: Math.cos(a) * lake.rx * 1.19,
  z: Math.sin(a) * lake.rz * 1.19
}));
const bridgePillarObstacles = [-lake.rz * 0.27, 0, lake.rz * 0.27].flatMap((z) => (
  [-1.3, 1.3].map((x) => ({
    x: islandCenter.x + x,
    z: bridgeCenterZ + z,
    rx: 0.42,
    rz: 0.5,
    surfaces: ["water"]
  }))
));
const solidObstacles = [
  { x: stoneBoatCenter.x, z: stoneBoatCenter.z, rx: 1.35, rz: 2.9 },
  ...bridgePillarObstacles
];
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

const movementAudioFiles = {
  land: [
    "assets/footstep-land-1.wav",
    "assets/footstep-land-2.wav",
    "assets/footstep-land-3.wav",
    "assets/footstep-land-4.wav"
  ],
  island: [
    "assets/footstep-island-1.wav",
    "assets/footstep-island-2.wav"
  ],
  bridge: [
    "assets/footstep-bridge-1.wav",
    "assets/footstep-bridge-2.wav"
  ],
  water: [
    "assets/water-paddle.mp3"
  ]
};
const ambientAudioFile = "assets/ambient-breeze-birds.m4a";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd9f5);
scene.fog = new THREE.Fog(0xb7e1ee, 54, 170);

const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.08, 210);
camera.rotation.order = "YXZ";
scene.add(camera);

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(-8, 16, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -58;
sun.shadow.camera.right = 58;
sun.shadow.camera.top = 54;
sun.shadow.camera.bottom = -54;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xe8fbff, 0x7d9a58, 1.85));

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
  waterSurface: null,
  waterVertices: null,
  waterDetails: [],
  flowLines: [],
  waterSparkles: [],
  foamLines: [],
  floaters: [],
  reeds: [],
  lanterns: [],
  duckViewParts: {},
  walkers: [],
  recycleBins: [],
  channelBlockers: [],
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
    clarity: 50,
    awareness: 12,
    combo: 0,
    comboTimer: 0,
    score: 0,
    targetScore: cleanupTrashTarget,
    round: 1,
    roundTarget: stages[0].trashTarget,
    result: "playing",
    paused: false,
    pendingRound: null,
    upgrade: null,
    upgradeLevels: {
      capacity: 0,
      stamina: 0,
      voice: 0
    },
    cameraShake: 0,
    duck: {
      x: duckStart.x,
      z: duckStart.z,
      vx: 0,
      vz: 0,
      carrying: [],
      carryCapacity: 1,
      sign: false,
      stamina: 100,
      maxStamina: 100,
      health: duckMaxHealth,
      maxHealth: duckMaxHealth,
      sprintDrain: 34,
      quackBoost: 0,
      sprinting: false,
      surface: "water",
      lastSurface: "water",
      bob: 0,
      eyeY: duckEyeTargetY(duckStart.x, duckStart.z, "water")
    },
    ripples: [],
    soundWaves: [],
    floatTexts: [],
    thrown: [],
    boss: null,
    bossSpawnTimer: 0,
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
  if (debugStage) applyDebugStage(debugStage);
  const firstTarget = state.boss || state.trash.find((item) => item.urgent) || state.trash[0];
  yaw = yawTo(firstTarget);
  ui.upgradeModal.hidden = true;
  ui.pauseMenu.hidden = true;
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

function makeVisitor(x, y, label, timer, options = {}) {
  const p = placeOnShore(oldToWorld(x, y), 1.14);
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
    talkTimer: 3 + Math.random() * 5,
    drift: Math.random() * Math.PI * 2,
    health: options.health ?? 0,
    maxHealth: options.maxHealth ?? 0,
    isBoss: options.isBoss || false,
    isMinion: options.isMinion || false,
    throwDamage: options.throwDamage ?? 8,
    shirtColor: options.shirtColor ?? 0x315f96
  };
}

function makeBossVisitor() {
  return makeVisitor(930, 150, "重点游客", 2.8, {
    isBoss: true,
    health: bossMaxHealth,
    maxHealth: bossMaxHealth,
    throwDamage: 20,
    shirtColor: 0x7d2532
  });
}

function makeBossMinion(index = 0) {
  const angle = index * 1.72 + Math.random() * 0.42;
  const x = oldLake.cx + Math.cos(angle) * oldLake.rx * (0.9 + Math.random() * 0.18);
  const y = oldLake.cy + Math.sin(angle) * oldLake.ry * (0.82 + Math.random() * 0.2);
  return makeVisitor(x, y, "跟随游客", 1.8 + Math.random() * 2.4, {
    isMinion: true,
    throwDamage: 10,
    shirtColor: 0x8a5a2f
  });
}

function getDebugStage() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("debugStage") || params.get("stage");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return stages.some((stage) => stage.id === parsed) ? parsed : null;
}

function applyDebugStage(stageId) {
  state.score = completedTrashBeforeStage(stageId);
  if (state.score >= 4) {
    state.duck.sign = true;
    state.awareness = Math.max(state.awareness, 32);
  }
  if (stageId >= 3) {
    state.duck.carryCapacity = Math.max(state.duck.carryCapacity, 2);
    state.duck.maxStamina = Math.max(state.duck.maxStamina, 135);
    state.duck.stamina = state.duck.maxStamina;
    state.duck.quackBoost = Math.max(state.duck.quackBoost, 18);
  }
  enterStage(stageId, { silent: true });
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

function ellipseValue(x, z, area) {
  return ((x - area.x) ** 2) / (area.rx * area.rx) + ((z - area.z) ** 2) / (area.rz * area.rz);
}

function isInsideIslandFootprint(x, z, padding = 0) {
  const area = {
    ...islandFootprint,
    rx: islandFootprint.rx + padding,
    rz: islandFootprint.rz + padding
  };
  return ellipseValue(x, z, area) <= 1;
}

function isOnIsland(x, z, padding = 0) {
  const area = {
    ...islandWalkable,
    rx: islandWalkable.rx + padding,
    rz: islandWalkable.rz + padding
  };
  return ellipseValue(x, z, area) <= 1;
}

function isOnBridge(x, z, padding = 0) {
  const halfWidth = bridgeHalfWidth + padding;
  return Math.abs(x - islandCenter.x) <= halfWidth
    && z >= bridgeApproachNorthEndZ - padding
    && z <= bridgeSouthEndZ + padding;
}

function isWater(x, z) {
  return lakeValue(x, z) < 1 && !isInsideIslandFootprint(x, z, 0.08);
}

function isDuckSwimming(duck) {
  return duck.surface === "water";
}

function canEnterBridgeFromShore(surface, from, to) {
  return surface === "land"
    && !isWater(from.x, from.z)
    && Math.abs(to.x - islandCenter.x) <= bridgeHalfWidth + 0.08
    && to.z >= bridgeApproachNorthEndZ - 0.2
    && to.z <= bridgeApproachSouthEndZ + 0.38;
}

function landOrWaterSurface(point) {
  return isWater(point.x, point.z) ? "water" : "land";
}

function resolveDuckSurfaceMove(surface, from, to) {
  const toBridge = isOnBridge(to.x, to.z);
  const toIslandTop = isOnIsland(to.x, to.z);
  const toIslandFootprint = isInsideIslandFootprint(to.x, to.z, 0.04);

  if (surface === "bridge") {
    if (toIslandTop) return { blocked: false, surface: "island" };
    if (toBridge) return { blocked: false, surface: "bridge" };
    if (!isWater(to.x, to.z) && to.z <= bridgeApproachSouthEndZ + 0.28) return { blocked: false, surface: "land" };
    return { blocked: true, surface };
  }

  if (surface === "island") {
    if (toBridge) return { blocked: false, surface: "bridge" };
    if (toIslandFootprint) return { blocked: false, surface: "island" };
    return { blocked: false, surface: landOrWaterSurface(to) };
  }

  if (surface === "land") {
    if (toBridge && canEnterBridgeFromShore(surface, from, to)) return { blocked: false, surface: "bridge" };
    if (toIslandFootprint) return { blocked: true, surface };
    return { blocked: false, surface: landOrWaterSurface(to) };
  }

  if (toIslandFootprint) return { blocked: true, surface };
  return { blocked: false, surface: isWater(to.x, to.z) ? "water" : "land" };
}

function placeOnShore(point, radius = 1.14) {
  const r = lakeRadius(point.x, point.z);
  if (!Number.isFinite(r) || r === 0) return { x: lake.rx * radius, z: 0 };
  const target = Math.max(radius, Math.min(playableLakeMargin, r));
  const scale = target / r;
  return { x: point.x * scale, z: point.z * scale };
}

function lakeRadius(x, z) {
  return Math.sqrt(lakeValue(x, z));
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function terrainHeightAt(x, z) {
  if (isOnIsland(x, z) || isOnBridge(x, z)) return bridgeDeckTopY;
  const r = lakeRadius(x, z);
  if (r < 0.985) return 0;
  if (r < 1.06) return smoothstep(0.985, 1.06, r) * bankTopY;
  if (r < 1.18) return bankTopY + smoothstep(1.06, 1.18, r) * (roadTopY - bankTopY);
  return roadTopY;
}

function duckEyeTargetY(x, z, surface = "auto") {
  if (surface === "bridge" || surface === "island") return bridgeDeckTopY + duckWaterEyeY + duckLandEyeLift;
  if (surface === "water") return duckWaterEyeY;
  if (surface === "auto" && isOnIsland(x, z)) return bridgeDeckTopY + duckWaterEyeY + duckLandEyeLift;
  const shoreAmount = smoothstep(0.98, 1.06, lakeRadius(x, z));
  return terrainHeightAt(x, z) + duckWaterEyeY + shoreAmount * duckLandEyeLift;
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

function obstacleAppliesToSurface(obstacle, surface) {
  return !obstacle.surfaces || obstacle.surfaces.includes(surface);
}

function pushOutOfSolidObstacles(point, surface = "water") {
  let result = point;
  for (const obstacle of solidObstacles) {
    if (!obstacleAppliesToSurface(obstacle, surface)) continue;
    const rx = obstacle.rx + 0.45;
    const rz = obstacle.rz + 0.45;
    const dx = result.x - obstacle.x;
    const dz = result.z - obstacle.z;
    const v = Math.sqrt((dx * dx) / (rx * rx) + (dz * dz) / (rz * rz));
    if (v < 1) {
      if (!Number.isFinite(v) || v === 0) {
        result = { ...result, x: obstacle.x + rx, z: obstacle.z };
      } else {
        result = {
          ...result,
          x: obstacle.x + dx / v,
          z: obstacle.z + dz / v
        };
      }
    }
  }
  return result;
}

function pushOutOfIsland(point, padding = 0.28) {
  const area = {
    ...islandFootprint,
    rx: islandFootprint.rx + padding,
    rz: islandFootprint.rz + padding
  };
  const dx = point.x - area.x;
  const dz = point.z - area.z;
  const v = Math.sqrt((dx * dx) / (area.rx * area.rx) + (dz * dz) / (area.rz * area.rz));
  if (v >= 1) return point;
  if (!Number.isFinite(v) || v === 0) return { ...point, x: area.x, z: area.z + area.rz };
  return {
    ...point,
    x: area.x + dx / v,
    z: area.z + dz / v
  };
}

function isSolidObstacle(x, z) {
  return solidObstacles.some((obstacle) => {
    const rx = obstacle.rx + 0.45;
    const rz = obstacle.rz + 0.45;
    return ((x - obstacle.x) ** 2) / (rx * rx) + ((z - obstacle.z) ** 2) / (rz * rz) < 1;
  });
}

function randomWaterTarget() {
  for (let i = 0; i < 40; i += 1) {
    const x = (Math.random() * 2 - 1) * lake.rx * 0.82;
    const z = (Math.random() * 2 - 1) * lake.rz * 0.82;
    if (isWater(x, z) && !isSolidObstacle(x, z)) return { x, z };
  }
  return { x: -lake.rx * 0.38, z: lake.rz * 0.12 };
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
  addSkyDome();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(230, 150),
    new THREE.MeshStandardMaterial({ color: 0xcfdc9f, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  world.add(ground);

  const water = new THREE.Mesh(
    createLakeGeometry(192, 18),
    new THREE.MeshPhysicalMaterial({
      color: 0x49aabd,
      roughness: 0.28,
      metalness: 0,
      transmission: 0,
      clearcoat: 0.76,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.85,
      bumpMap: createWaterBumpTexture(),
      bumpScale: 0.075
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.scale.set(lake.rx, lake.rz, 1);
  water.position.y = 0;
  water.receiveShadow = true;
  refs.water = water;
  refs.waterSurface = water;
  refs.waterVertices = {
    attribute: water.geometry.getAttribute("position"),
    base: Float32Array.from(water.geometry.getAttribute("position").array)
  };
  world.add(water);
  addWaterDetails();

  const shore = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.034, 8, 160),
    new THREE.MeshStandardMaterial({ color: 0xead899, roughness: 0.8 })
  );
  shore.rotation.x = Math.PI / 2;
  shore.scale.set(lake.rx, lake.rz, 1);
  shore.position.y = 0.04;
  world.add(shore);

  addRaisedBank();
  addShoreDetails();
  addDistantHills();
  addForestBackdrop();
  addForestedSlopes();
  addRingRoad();
  addLangrunChannel();
  addBridge();
  addTrees();
  addShoreBuildings();
  addShoreLandmarks();
  addWalkingVisitors();
  addIsland();
  addRecycle();
  addBoundaryFence();
}

function addSkyDome() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(185, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x77c7f4) },
        horizonColor: { value: new THREE.Color(0xdff8ff) }
      },
      vertexShader: `
        varying float vY;
        void main() {
          vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        varying float vY;
        void main() {
          float t = smoothstep(-0.12, 0.82, vY);
          gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
        }
      `
    })
  );
  sky.renderOrder = -10;
  scene.add(sky);
}

function createLakeGeometry(segments = 160, rings = 16) {
  const vertices = [0, 0, 0];
  const uvs = [0.5, 0.5];
  for (let r = 1; r <= rings; r += 1) {
    const radius = r / rings;
    for (let i = 0; i < segments; i += 1) {
      const a = i / segments * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      vertices.push(x, y, 0);
      uvs.push(0.5 + x * 0.5, 0.5 + y * 0.5);
    }
  }
  const indices = [];
  for (let i = 0; i < segments; i += 1) {
    indices.push(0, 1 + i, 1 + ((i + 1) % segments));
  }
  for (let r = 2; r <= rings; r += 1) {
    const inner = 1 + (r - 2) * segments;
    const outer = 1 + (r - 1) * segments;
    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      indices.push(inner + i, outer + i, outer + next, inner + i, outer + next, inner + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createWaterBumpTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#76979d";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 520; i += 1) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const len = 14 + Math.random() * 44;
    const alpha = 0.035 + Math.random() * 0.055;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.24 + Math.random() * 0.48);
    ctx.strokeStyle = `rgba(230,255,255,${alpha})`;
    ctx.lineWidth = 1 + Math.random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.quadraticCurveTo(0, Math.sin(i) * 3, len / 2, 0);
    ctx.stroke();
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addRaisedBank() {
  const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x6f9a48, roughness: 0.92 });
  const flowerColors = [0xd95757, 0xe6cf56, 0xf2f0f5, 0x7aa5d9];
  const segments = 128;
  addEllipticalSlope(0.985, 1.06, 0.025, bankTopY, 0x9fbd6f, segments);
  addEllipticalSlope(1.06, 1.18, bankTopY, roadTopY, 0xb8cc83, segments);
  addEllipticalSlope(1.18, 1.32, roadTopY - 0.02, 0.08, 0xb7c884, segments);
  for (let i = 0; i < segments; i += 1) {
    const a = i / segments * Math.PI * 2;
    if (i % 3 === 0) {
      const r = 1.025 + (i % 4) * 0.018;
      const x = Math.cos(a) * lake.rx * r;
      const z = Math.sin(a) * lake.rz * r;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 5), grassMaterial);
      tuft.position.set(x, terrainHeightAt(x, z) + 0.21, z);
      tuft.rotation.set(Math.random() * 0.35, a, Math.random() * 0.35);
      world.add(tuft);
    }
    if (i % 8 === 0) {
      const r = 1.065 + (i % 3) * 0.022;
      const x = Math.cos(a) * lake.rx * r;
      const z = Math.sin(a) * lake.rz * r;
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshStandardMaterial({ color: flowerColors[(i / 8) % flowerColors.length], roughness: 0.82 })
      );
      flower.position.set(x, terrainHeightAt(x, z) + 0.08, z);
      flower.scale.y = 0.55;
      world.add(flower);
    }
  }
}

function addEllipticalSlope(innerRadius, outerRadius, innerY, outerY, color, segments) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.96, side: THREE.DoubleSide });
  for (let i = 0; i < segments; i += 1) {
    const a = i / segments * Math.PI * 2;
    const next = (i + 1) / segments * Math.PI * 2;
    const vertices = new Float32Array([
      Math.cos(a) * lake.rx * innerRadius, innerY, Math.sin(a) * lake.rz * innerRadius,
      Math.cos(next) * lake.rx * innerRadius, innerY, Math.sin(next) * lake.rz * innerRadius,
      Math.cos(next) * lake.rx * outerRadius, outerY, Math.sin(next) * lake.rz * outerRadius,
      Math.cos(a) * lake.rx * outerRadius, outerY, Math.sin(a) * lake.rz * outerRadius
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const slope = new THREE.Mesh(geometry, material);
    slope.receiveShadow = true;
    world.add(slope);
  }
}

function addWaterDetails() {
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xdaf9ff, transparent: true, opacity: 0.16 });
  for (let i = 0; i < 58; i += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 6, 96), lineMaterial.clone());
    const a = i * 2.399;
    const radius = 0.18 + (i % 9) * 0.085 + Math.random() * 0.035;
    ring.position.set(Math.cos(a) * lake.rx * radius, 0.026 + i * 0.0002, Math.sin(a) * lake.rz * radius);
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1.3 + Math.random() * 2.7, 0.28 + Math.random() * 0.7, 1);
    world.add(ring);
    refs.waterDetails.push({ mesh: ring, phase: Math.random() * Math.PI * 2, speed: 0.45 + Math.random() * 0.35, baseY: ring.position.y, baseOpacity: ring.material.opacity });
  }

  const flowMaterial = new THREE.MeshBasicMaterial({ color: 0xb7eef4, transparent: true, opacity: 0.22, depthWrite: false });
  for (let i = 0; i < 26; i += 1) {
    const flow = new THREE.Mesh(new THREE.PlaneGeometry(3.2 + Math.random() * 3.5, 0.045), flowMaterial.clone());
    const z = (Math.random() * 2 - 1) * lake.rz * 0.58;
    const x = -lake.rx * 0.82 + Math.random() * lake.rx * 1.64;
    flow.position.set(x, 0.038 + i * 0.0003, z);
    flow.rotation.x = -Math.PI / 2;
    flow.rotation.z = -0.03 + Math.random() * 0.06;
    world.add(flow);
    refs.flowLines.push({ mesh: flow, phase: Math.random() * Math.PI * 2, speed: 1.8 + Math.random() * 1.2, baseZ: z });
  }

  const sparkleMaterial = new THREE.MeshBasicMaterial({ color: 0xfff4bf, transparent: true, opacity: 0.0, depthWrite: false });
  for (let i = 0; i < 44; i += 1) {
    const p = randomWaterTarget();
    const sparkle = new THREE.Mesh(new THREE.PlaneGeometry(0.34 + Math.random() * 0.42, 0.024), sparkleMaterial.clone());
    sparkle.position.set(p.x, 0.052 + i * 0.0002, p.z);
    sparkle.rotation.x = -Math.PI / 2;
    sparkle.rotation.z = -0.18 + Math.random() * 0.36;
    world.add(sparkle);
    refs.waterSparkles.push({ mesh: sparkle, phase: Math.random() * Math.PI * 2, speed: 2.1 + Math.random() * 2.4 });
  }

  const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.2, depthWrite: false });
  for (let i = 0; i < 72; i += 1) {
    const a = i / 72 * Math.PI * 2;
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(0.68 + Math.random() * 0.55, 0.028), foamMaterial.clone());
    foam.position.set(Math.cos(a) * lake.rx * 0.976, 0.058 + i * 0.0001, Math.sin(a) * lake.rz * 0.976);
    foam.rotation.x = -Math.PI / 2;
    foam.rotation.z = -a + Math.PI / 2;
    world.add(foam);
    refs.foamLines.push({ mesh: foam, phase: Math.random() * Math.PI * 2, speed: 0.85 + Math.random() * 0.65 });
  }
}

function addShoreDetails() {
  const reedMaterial = new THREE.MeshStandardMaterial({ color: 0x6f9146, roughness: 0.88 });
  const tipMaterial = new THREE.MeshStandardMaterial({ color: 0x9b7148, roughness: 0.82 });
  for (let i = 0; i < 92; i += 1) {
    const a = i / 92 * Math.PI * 2 + (Math.random() - 0.5) * 0.07;
    const r = 0.98 + Math.random() * 0.06;
    const x = Math.cos(a) * lake.rx * r;
    const z = Math.sin(a) * lake.rz * r;
    if (Math.abs(x - islandCenter.x) < 3.8 && z < bridgeApproachSouthEndZ + 1.5) continue;
    const group = new THREE.Group();
    group.position.set(x, terrainHeightAt(x, z) + 0.04, z);
    group.rotation.y = -a;
    const count = 2 + (i % 3);
    for (let j = 0; j < count; j += 1) {
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.72 + Math.random() * 0.46, 5), reedMaterial);
      reed.position.set((Math.random() - 0.5) * 0.24, 0.38, (Math.random() - 0.5) * 0.2);
      reed.rotation.z = -0.18 + Math.random() * 0.36;
      reed.castShadow = true;
      group.add(reed);
      if (j === 0 && i % 4 === 0) {
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.034, 0.18, 6), tipMaterial);
        tip.position.copy(reed.position);
        tip.position.y += 0.48;
        tip.rotation.copy(reed.rotation);
        group.add(tip);
      }
    }
    world.add(group);
    refs.reeds.push({ mesh: group, phase: Math.random() * Math.PI * 2, baseRot: group.rotation.z });
  }

  const pebbleMaterial = new THREE.MeshStandardMaterial({ color: 0xb1ad99, roughness: 0.94 });
  for (let i = 0; i < 130; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.025 + Math.random() * 0.09;
    const x = Math.cos(a) * lake.rx * r;
    const z = Math.sin(a) * lake.rz * r;
    const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.055 + Math.random() * 0.075, 0), pebbleMaterial);
    pebble.position.set(x, terrainHeightAt(x, z) + 0.025, z);
    pebble.scale.y = 0.32 + Math.random() * 0.28;
    pebble.rotation.set(Math.random(), Math.random(), Math.random());
    world.add(pebble);
  }

  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x6ea04d, roughness: 0.74, metalness: 0 });
  const flowerMaterial = new THREE.MeshStandardMaterial({ color: 0xf4d8df, roughness: 0.7 });
  for (let i = 0; i < 22; i += 1) {
    const p = randomWaterTarget();
    const floater = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.CylinderGeometry(0.3 + Math.random() * 0.16, 0.34 + Math.random() * 0.16, 0.026, 18), leafMaterial);
    leaf.scale.z = 0.68;
    leaf.castShadow = true;
    floater.add(leaf);
    if (i % 5 === 0) {
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), flowerMaterial);
      flower.position.set(0.04, 0.08, -0.02);
      flower.scale.y = 0.42;
      floater.add(flower);
    }
    floater.position.set(p.x, 0.07, p.z);
    floater.rotation.y = Math.random() * Math.PI * 2;
    world.add(floater);
    refs.floaters.push({ mesh: floater, phase: Math.random() * Math.PI * 2, drift: Math.random() * Math.PI * 2 });
  }

  const lampPost = new THREE.MeshStandardMaterial({ color: 0x314646, roughness: 0.78 });
  for (let i = 0; i < 8; i += 1) {
    const a = i / 8 * Math.PI * 2 + 0.16;
    const x = Math.cos(a) * lake.rx * 1.2;
    const z = Math.sin(a) * lake.rz * 1.2;
    const lamp = new THREE.Group();
    lamp.position.set(x, terrainHeightAt(x, z), z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.22, 8), lampPost);
    post.position.y = 0.61;
    post.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a3, transparent: true, opacity: 0.86 }));
    head.position.y = 1.28;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0.14, depthWrite: false }));
    halo.position.y = 1.28;
    lamp.add(post, head, halo);
    world.add(lamp);
    refs.lanterns.push({ mesh: lamp, phase: Math.random() * Math.PI * 2 });
  }
}

function addDistantHills() {
  const hillMaterial = new THREE.MeshStandardMaterial({ color: 0xa9bf84, roughness: 0.92 });
  const shadowMaterial = new THREE.MeshStandardMaterial({ color: 0x819d6f, roughness: 0.95 });
  const hills = [
    [-56, -45, 28, 7.4, 15, hillMaterial],
    [-14, -50, 42, 8.2, 17, shadowMaterial],
    [38, -45, 34, 7.8, 15, hillMaterial],
    [62, 31, 34, 5.4, 13, shadowMaterial],
    [-66, 32, 32, 5.8, 14, hillMaterial]
  ];
  for (const [x, z, sx, sy, sz, material] of hills) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), material);
    hill.position.set(x, sy * 0.18 - 0.65, z);
    hill.scale.set(sx, sy, sz);
    hill.receiveShadow = true;
    world.add(hill);
  }
}

function addForestBackdrop() {
  const group = new THREE.Group();
  const ridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x7f9f63, roughness: 0.94 });
  for (let i = 0; i < 18; i += 1) {
    const a = i / 18 * Math.PI * 2;
    const ridge = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), ridgeMaterial);
    const radiusX = lake.rx * (1.78 + (i % 3) * 0.06);
    const radiusZ = lake.rz * (1.82 + (i % 4) * 0.06);
    ridge.position.set(Math.cos(a) * radiusX, 1.0 + (i % 4) * 0.12, Math.sin(a) * radiusZ);
    ridge.scale.set(11 + (i % 5) * 3.2, 4.8 + (i % 3) * 0.9, 5.6 + (i % 4) * 0.8);
    ridge.receiveShadow = true;
    group.add(ridge);
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.09, 0.16, 1, 6);
  const broadGeometry = new THREE.IcosahedronGeometry(1, 1);
  const pineGeometry = new THREE.ConeGeometry(1, 1, 8);
  const ridgeCanopyGeometry = new THREE.DodecahedronGeometry(1, 0);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x75513a, roughness: 0.9 });
  const broadMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x416f3c, roughness: 0.88 }),
    new THREE.MeshStandardMaterial({ color: 0x537f42, roughness: 0.88 }),
    new THREE.MeshStandardMaterial({ color: 0x355f42, roughness: 0.88 })
  ];
  const pineMaterial = new THREE.MeshStandardMaterial({ color: 0x2f5b42, roughness: 0.88 });
  const ridgeCanopyMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x2f6840, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x3f7746, roughness: 0.9 })
  ];
  const broadCounts = [78, 78, 78];
  const pineCount = 90;
  const ridgeCanopyCount = 180;
  const trunkCount = broadCounts.reduce((sum, count) => sum + count, 0) + pineCount;
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trunkCount);
  const broadMeshes = broadCounts.map((count, index) => new THREE.InstancedMesh(broadGeometry, broadMaterials[index], count));
  const pines = new THREE.InstancedMesh(pineGeometry, pineMaterial, pineCount);
  const ridgeCanopies = ridgeCanopyMaterials.map((material) => new THREE.InstancedMesh(ridgeCanopyGeometry, material, ridgeCanopyCount / 2));
  const temp = new THREE.Object3D();
  let trunkIndex = 0;
  const setTrunk = (x, z, height, width, baseY) => {
    temp.position.set(x, baseY + height * 0.48, z);
    temp.rotation.set(0, Math.random() * Math.PI * 2, 0);
    temp.scale.set(width, height, width);
    temp.updateMatrix();
    trunks.setMatrixAt(trunkIndex, temp.matrix);
    trunkIndex += 1;
  };

  for (let layer = 0; layer < broadMeshes.length; layer += 1) {
    const mesh = broadMeshes[layer];
    for (let i = 0; i < broadCounts[layer]; i += 1) {
      const a = (i / broadCounts[layer]) * Math.PI * 2 + layer * 0.18 + Math.sin(i * 12.989) * 0.025;
      const radius = 1.62 + layer * 0.19 + (i % 9) * 0.012;
      const x = Math.cos(a) * lake.rx * radius;
      const z = Math.sin(a) * lake.rz * radius;
      const baseY = roadTopY + 0.1 + layer * 0.08;
      const height = 2.2 + (i % 7) * 0.16;
      const width = 0.72 + (i % 5) * 0.06;
      setTrunk(x, z, height * 0.45, 0.55, baseY);
      temp.position.set(x, baseY + height, z);
      temp.rotation.set((Math.random() - 0.5) * 0.18, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.18);
      temp.scale.set(width * (1.05 + layer * 0.14), height * 0.62, width * 0.86);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);
    }
  }

  for (let i = 0; i < pineCount; i += 1) {
    const a = (i / pineCount) * Math.PI * 2 + 0.08 + Math.sin(i * 7.21) * 0.02;
    const radius = 1.9 + (i % 11) * 0.018;
    const x = Math.cos(a) * lake.rx * radius;
    const z = Math.sin(a) * lake.rz * radius;
    const baseY = roadTopY + 0.08;
    const height = 2.6 + (i % 6) * 0.2;
    setTrunk(x, z, height * 0.42, 0.58, baseY);
    temp.position.set(x, baseY + height, z);
    temp.rotation.set(0, Math.random() * Math.PI * 2, 0);
    temp.scale.set(0.9 + (i % 4) * 0.08, height * 1.05, 0.9 + (i % 4) * 0.08);
    temp.updateMatrix();
    pines.setMatrixAt(i, temp.matrix);
  }

  for (let layer = 0; layer < ridgeCanopies.length; layer += 1) {
    const mesh = ridgeCanopies[layer];
    for (let i = 0; i < ridgeCanopyCount / 2; i += 1) {
      const a = (i / (ridgeCanopyCount / 2)) * Math.PI * 2 + layer * 0.05 + Math.sin(i * 5.73) * 0.035;
      const radius = 1.82 + layer * 0.18 + (i % 8) * 0.016;
      const x = Math.cos(a) * lake.rx * radius;
      const z = Math.sin(a) * lake.rz * radius;
      const wave = 0.5 + Math.sin(a * 3.0 + layer) * 0.42 + Math.cos(a * 5.0) * 0.22;
      temp.position.set(x, 2.35 + wave + (i % 5) * 0.18, z);
      temp.rotation.set((Math.random() - 0.5) * 0.24, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.24);
      temp.scale.set(1.25 + (i % 6) * 0.18, 0.95 + (i % 5) * 0.14, 1.0 + (i % 4) * 0.2);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);
    }
  }

  trunks.instanceMatrix.needsUpdate = true;
  pines.instanceMatrix.needsUpdate = true;
  for (const mesh of broadMeshes) mesh.instanceMatrix.needsUpdate = true;
  for (const mesh of ridgeCanopies) mesh.instanceMatrix.needsUpdate = true;
  for (const mesh of [trunks, pines, ...broadMeshes, ...ridgeCanopies]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  world.add(group);
}

function addForestedSlopes() {
  const group = new THREE.Group();
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6f4c37, roughness: 0.92 });
  const pineMaterial = new THREE.MeshStandardMaterial({ color: 0x28563d, roughness: 0.9 });
  const broadMaterial = new THREE.MeshStandardMaterial({ color: 0x4f7d40, roughness: 0.9 });
  const darkBroadMaterial = new THREE.MeshStandardMaterial({ color: 0x37683d, roughness: 0.9 });
  const patchMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x396f3f, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0x4f8144, roughness: 0.92 })
  ];
  const trunkGeometry = new THREE.CylinderGeometry(0.08, 0.13, 1, 6);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const pineGeometry = new THREE.ConeGeometry(1, 1.8, 8);
  const canopyPatchGeometry = new THREE.DodecahedronGeometry(1, 0);

  const addSlopeTree = (x, y, z, scale, pine = false, material = broadMaterial) => {
    const tree = new THREE.Group();
    tree.position.set(x, y, z);
    tree.rotation.y = Math.random() * Math.PI * 2;
    tree.scale.setScalar(scale);
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 0.42;
    trunk.castShadow = true;
    tree.add(trunk);
    if (pine) {
      const crown = new THREE.Mesh(pineGeometry, pineMaterial);
      crown.position.y = 1.45;
      crown.scale.set(0.75, 1.12, 0.75);
      crown.castShadow = true;
      tree.add(crown);
    } else {
      const crown = new THREE.Mesh(crownGeometry, material);
      crown.position.y = 1.24;
      crown.scale.set(0.9, 0.88, 0.78);
      crown.castShadow = true;
      tree.add(crown);
    }
    group.add(tree);
  };

  for (let i = 0; i < 72; i += 1) {
    const row = i % 4;
    const x = lake.rx * 1.05 + (i % 18) * 2.35 + Math.sin(i * 1.7) * 0.75;
    const z = -lake.rz * 0.72 + row * 5.6 + Math.cos(i * 0.9) * 1.2;
    const y = 1.05 + row * 0.42 + (i % 5) * 0.08;
    addSlopeTree(x, y, z, 1.15 + (i % 4) * 0.16, i % 5 === 0, i % 2 === 0 ? broadMaterial : darkBroadMaterial);
  }

  for (let i = 0; i < 80; i += 1) {
    const row = i % 5;
    const x = lake.rx * 1.18 + (i % 16) * 2.45 + Math.cos(i * 1.19) * 0.8;
    const z = lake.rz * 0.04 + row * 4.8 + Math.sin(i * 0.83) * 1.0;
    const y = 1.85 + row * 0.34 + (i % 4) * 0.12;
    addSlopeTree(x, y, z, 1.28 + (i % 5) * 0.16, i % 6 === 0, i % 3 === 0 ? darkBroadMaterial : broadMaterial);
  }

  for (let i = 0; i < 34; i += 1) {
    const row = i % 3;
    const patch = new THREE.Mesh(canopyPatchGeometry, patchMaterials[i % patchMaterials.length]);
    patch.position.set(lake.rx * 1.28 + (i % 12) * 3.45, 2.45 + row * 0.36, lake.rz * 0.16 + row * 6.2 + Math.sin(i) * 1.1);
    patch.scale.set(2.15 + (i % 4) * 0.32, 0.72 + (i % 3) * 0.08, 1.35 + (i % 5) * 0.22);
    patch.rotation.set((Math.random() - 0.5) * 0.16, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.16);
    patch.castShadow = true;
    patch.receiveShadow = true;
    group.add(patch);
  }

  for (let i = 0; i < 84; i += 1) {
    const col = i % 28;
    const x = -lake.rx * 1.35 + col * 3.8 + Math.sin(i * 1.31) * 0.9;
    const z = -lake.rz * 1.55 + (i % 3) * 3.8 + Math.cos(i * 0.77) * 0.9;
    const y = 1.25 + (i % 6) * 0.12;
    addSlopeTree(x, y, z, 0.95 + (i % 5) * 0.14, i % 4 === 0, i % 3 === 0 ? darkBroadMaterial : broadMaterial);
  }

  for (let i = 0; i < 34; i += 1) {
    const x = -lake.rx * 1.65 + Math.sin(i * 0.7) * 5.5;
    const z = -lake.rz * 0.85 + i * 2.25;
    const y = 1.05 + (i % 5) * 0.16;
    addSlopeTree(x, y, z, 1.05 + (i % 4) * 0.12, i % 6 === 0, i % 2 === 0 ? broadMaterial : darkBroadMaterial);
  }

  world.add(group);
}

function addRingRoad() {
  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0xc8bd96, roughness: 0.93 });
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xeee1b8, roughness: 0.9 });
  const segments = 96;
  for (let i = 0; i < segments; i += 1) {
    const a = i / segments * Math.PI * 2;
    const next = (i + 1) / segments * Math.PI * 2;
    const x = Math.cos(a) * lake.rx * 1.15;
    const z = Math.sin(a) * lake.rz * 1.15;
    const nx = Math.cos(next) * lake.rx * 1.15;
    const nz = Math.sin(next) * lake.rz * 1.15;
    const len = Math.hypot(nx - x, nz - z);
    const tile = new THREE.Mesh(new THREE.BoxGeometry(len * 1.06, 0.035, 1.15), roadMaterial);
    tile.position.set((x + nx) / 2, roadTopY - 0.018, (z + nz) / 2);
    tile.rotation.y = Math.atan2(nx - x, nz - z) + Math.PI / 2;
    tile.receiveShadow = true;
    world.add(tile);
    if (i % 4 === 0) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(len * 0.92, 0.035, 0.08), edgeMaterial);
      curb.position.set(Math.cos(a) * lake.rx * 1.08, roadTopY + 0.02, Math.sin(a) * lake.rz * 1.08);
      curb.rotation.y = tile.rotation.y;
      world.add(curb);
    }
  }
}

function addLangrunChannel() {
  const group = new THREE.Group();
  group.position.set(lake.rx * 0.72, 0.018, -lake.rz * 0.98);
  group.rotation.y = -0.72;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(15, 3.1),
    new THREE.MeshPhysicalMaterial({
      color: 0x4ea3b6,
      roughness: 0.4,
      clearcoat: 0.4,
      clearcoatRoughness: 0.34
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.x = 5.2;
  group.add(water);

  const bankMaterial = new THREE.MeshStandardMaterial({ color: 0xb8c984, roughness: 0.94 });
  for (const z of [-1.95, 1.95]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.38, 0.56), bankMaterial);
    edge.position.set(5.15, 0.26, z);
    edge.castShadow = true;
    edge.receiveShadow = true;
    group.add(edge);
  }

  const blocker = new THREE.Group();
  blocker.position.set(1.35, 0.14, 0);
  const colors = [0xe96a4f, 0xc5e8f0, 0xf3f0dc, 0x9b9b8a];
  for (let i = 0; i < 18; i += 1) {
    const piece = new THREE.Mesh(
      i % 4 === 0 ? new THREE.CylinderGeometry(0.12, 0.16, 0.56, 10) : new THREE.BoxGeometry(0.42, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.76 })
    );
    piece.position.set((Math.random() - 0.5) * 2.5, 0.1 + Math.random() * 0.35, (Math.random() - 0.5) * 2.2);
    piece.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
    piece.castShadow = true;
    blocker.add(piece);
  }
  group.add(blocker);
  refs.channelBlockers.push(blocker);
  world.add(group);
}

function addBridge() {
  const group = new THREE.Group();
  group.position.set(islandCenter.x, 0, bridgeCenterZ);
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0xb96d42, roughness: 0.7 });
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.18, bridgeDeckLength),
    deckMaterial
  );
  deck.position.set(0, bridgeDeckTopY - 0.09, bridgeDeckCenterZ - bridgeCenterZ);
  deck.castShadow = true;
  group.add(deck);
  const landingMaterial = new THREE.MeshStandardMaterial({ color: 0xc68a54, roughness: 0.78 });
  const addLanding = (northZ, southZ, width, colorMaterial = landingMaterial) => {
    const length = southZ - northZ;
    const landing = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, length), colorMaterial);
    landing.position.set(0, bridgeDeckTopY - 0.08, (northZ + southZ) / 2 - bridgeCenterZ);
    landing.castShadow = true;
    landing.receiveShadow = true;
    group.add(landing);
  };
  addLanding(bridgeApproachNorthEndZ, bridgeApproachSouthEndZ, 3.8);
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x853f2d, roughness: 0.7 });
  for (const x of [-1.48, 1.48]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, bridgeDeckLength - 0.28), railMaterial);
    rail.position.set(x, bridgeDeckTopY + 0.28, bridgeDeckCenterZ - bridgeCenterZ);
    rail.castShadow = true;
    group.add(rail);
  }
  for (let z = bridgeNorthEndZ + 0.7; z <= bridgeSouthEndZ - 0.55; z += 2.15) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.54, 0.14),
      railMaterial
    );
    for (const x of [-1.48, 1.48]) {
      const p = post.clone();
      p.position.set(x, bridgeDeckTopY + 0.18, z - bridgeCenterZ);
      p.castShadow = true;
      group.add(p);
    }
  }
  const archMaterial = new THREE.MeshStandardMaterial({ color: 0xd8c7a0, roughness: 0.84 });
  for (const z of [-lake.rz * 0.27, 0, lake.rz * 0.27]) {
    for (const x of [-1.3, 1.3]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.36, bridgeDeckTopY - 0.06, 0.44), archMaterial);
      pier.position.set(x, (bridgeDeckTopY - 0.06) / 2, z);
      pier.castShadow = true;
      group.add(pier);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.16, 8, 24, Math.PI), archMaterial);
    arch.position.set(0, 0.42, z);
    arch.rotation.z = Math.PI;
    arch.rotation.y = Math.PI / 2;
    arch.castShadow = true;
    group.add(arch);
  }
  world.add(group);
}

function addTrees() {
  for (let i = 0; i < 96; i += 1) {
    const a = i / 96 * Math.PI * 2;
    const lane = i % 3;
    const radius = playableLakeMargin + 0.1 + lane * 0.17 + Math.random() * 0.08;
    const x = Math.cos(a) * lake.rx * radius;
    const z = Math.sin(a) * lake.rz * radius;
    const type = i % 5 === 0 ? "willow" : i % 4 === 0 ? "pine" : "broadleaf";
    world.add(createTree(type, 1.22 + Math.random() * 0.72, x, z));
  }

  for (let i = 0; i < 48; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (lake.rx * 1.75 + Math.random() * 18);
    const z = (Math.random() * 2 - 1) * lake.rz * 1.75;
    world.add(createTree(i % 3 === 0 ? "pine" : "broadleaf", 1.6 + Math.random() * 1.0, x, z));
  }
}

function createTree(type, scale, x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = Math.random() * Math.PI * 2;
  group.scale.setScalar(scale);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.18, type === "willow" ? 1.35 : 1.0, 8),
    new THREE.MeshStandardMaterial({ color: 0x8d5738, roughness: 0.9 })
  );
  trunk.position.y = type === "willow" ? 0.62 : 0.47;
  trunk.castShadow = true;
  group.add(trunk);

  if (type === "pine") {
    const material = new THREE.MeshStandardMaterial({ color: 0x315f42, roughness: 0.86 });
    for (let i = 0; i < 3; i += 1) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry(0.5 - i * 0.08, 0.8, 9), material);
      tier.position.y = 0.98 + i * 0.38;
      tier.castShadow = true;
      group.add(tier);
    }
    return group;
  }

  const crownColor = type === "willow" ? 0x7faa50 : 0x5f8f43;
  const crown = new THREE.Mesh(
    new THREE.IcosahedronGeometry(type === "willow" ? 0.72 : 0.66, 1),
    new THREE.MeshStandardMaterial({ color: crownColor, roughness: 0.86 })
  );
  crown.scale.set(type === "willow" ? 0.86 : 1.12, type === "willow" ? 1.3 : 0.96, type === "willow" ? 0.86 : 1.0);
  crown.position.y = type === "willow" ? 1.42 : 1.05;
  crown.castShadow = true;
  group.add(crown);

  if (type === "willow") {
    const frondMaterial = new THREE.MeshStandardMaterial({ color: 0x8bbd5f, roughness: 0.9 });
    for (let i = 0; i < 7; i += 1) {
      const frond = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.72, 0.035), frondMaterial);
      const a = i / 7 * Math.PI * 2;
      frond.position.set(Math.cos(a) * 0.45, 0.92, Math.sin(a) * 0.45);
      frond.rotation.z = Math.cos(a) * 0.28;
      frond.rotation.x = Math.sin(a) * 0.28;
      group.add(frond);
    }
  }

  return group;
}

function addBoundaryFence() {
  const material = new THREE.MeshStandardMaterial({ color: 0x8a5a38, roughness: 0.72 });
  const postGeometry = new THREE.BoxGeometry(0.18, 0.84, 0.18);
  const railGeometry = new THREE.BoxGeometry(1, 0.12, 0.12);
  const group = new THREE.Group();

  const addPost = (x, z) => {
    const post = new THREE.Mesh(postGeometry, material);
    post.position.set(x, terrainHeightAt(x, z) + 0.42, z);
    post.castShadow = true;
    group.add(post);
  };
  const addRail = (a, b) => {
    const rail = new THREE.Mesh(railGeometry, material);
    const length = Math.hypot(a.x - b.x, a.z - b.z);
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;
    rail.position.set(x, terrainHeightAt(x, z) + 0.62, z);
    rail.scale.x = length;
    rail.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    rail.castShadow = true;
    group.add(rail);
  };

  const points = [];
  for (let i = 0; i < 84; i += 1) {
    const a = i / 84 * Math.PI * 2;
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

function createBuilding(width, depth, floors, color, roofColor = 0x6c5340) {
  const group = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
  const roof = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, floors * 0.78, depth), wall);
  body.position.y = floors * 0.39;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.35, 0.22, depth + 0.35), roof);
  cap.position.y = floors * 0.78 + 0.14;
  cap.castShadow = true;
  group.add(cap);

  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xe9f5d8, transparent: true, opacity: 0.72 });
  for (let floor = 0; floor < floors; floor += 1) {
    for (let i = 0; i < Math.max(2, Math.floor(width / 0.9)); i += 1) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.28), windowMaterial);
      win.position.set(-width * 0.42 + i * 0.82, 0.45 + floor * 0.72, -depth / 2 - 0.006);
      win.rotation.y = Math.PI;
      group.add(win);
    }
  }
  return group;
}

function addShoreBuildings() {
  const placements = [
    { name: "northwest", x: -lake.rx * 1.08, z: -lake.rz * 0.7, rot: 0.22, w: 8.8, d: 2.6, floors: 2, color: 0xb99873 },
    { name: "north", x: -lake.rx * 0.1, z: -lake.rz * 1.52, rot: -0.02, w: 14.5, d: 3.0, floors: 3, color: 0xb6a982 },
    { name: "eastGym", x: lake.rx * 1.28, z: lake.rz * 0.14, rot: -Math.PI / 2, w: 18.8, d: 5.8, floors: 3, color: 0xc99b68, roof: 0x8f4b32 },
    { name: "eastAnnex", x: lake.rx * 1.22, z: -lake.rz * 0.26, rot: -Math.PI / 2 + 0.04, w: 8.4, d: 3.4, floors: 2, color: 0xd7ba86 }
  ];
  for (const p of placements) {
    const building = createBuilding(p.w, p.d, p.floors, p.color, p.roof);
    building.position.set(p.x, 0, p.z);
    building.rotation.y = p.rot;
    world.add(building);
  }

  for (let i = 0; i < 14; i += 1) {
    const x = -lake.rx * 0.54 + i * lake.rx * 0.08;
    const z = -lake.rz * 1.25 + Math.sin(i) * 0.45;
    world.add(createTree(i % 4 === 0 ? "pine" : "broadleaf", 1.85 + Math.random() * 0.45, x, z));
  }

  const slopeMaterial = new THREE.MeshStandardMaterial({ color: 0xb0c17a, roughness: 0.95 });
  const southSlope = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12), slopeMaterial);
  southSlope.position.set(0, 0.08, lake.rz * 1.78);
  southSlope.scale.set(lake.rx * 1.12, 3.4, 8.8);
  southSlope.receiveShadow = true;
  world.add(southSlope);

  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x8f8d7e, roughness: 0.9 });
  const nameStone = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 0), stoneMaterial);
  nameStone.position.set(-lake.rx * 1.2, 0.74, lake.rz * 0.1);
  nameStone.scale.set(1.8, 0.72, 0.85);
  nameStone.rotation.set(0.1, -0.45, 0.08);
  nameStone.castShadow = true;
  world.add(nameStone);
  const plaque = createSignSprite("未名湖", "#36433b", 1.85, 0.48);
  plaque.position.set(-lake.rx * 1.22, 1.18, lake.rz * 0.08);
  plaque.rotation.y = -0.45;
  world.add(plaque);

  addStoneBoat();
}

function addStoneBoat() {
  const group = new THREE.Group();
  group.position.set(stoneBoatCenter.x, 0.04, stoneBoatCenter.z);
  group.rotation.y = Math.PI / 2;
  const material = new THREE.MeshStandardMaterial({ color: 0xd8d1bd, roughness: 0.88 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 0.86 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.58, 1.42), material);
  hull.position.y = 0.32;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.82, 1.2, 4), material);
  bow.rotation.z = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(2.95, 0.32, 0);
  bow.castShadow = true;
  group.add(bow);
  const stern = bow.clone();
  stern.position.x = -2.95;
  stern.rotation.z = -Math.PI / 2;
  group.add(stern);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.92, 1.08), material);
  cabin.position.y = 1.02;
  cabin.castShadow = true;
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.2, 1.34), dark);
  roof.position.y = 1.58;
  roof.castShadow = true;
  group.add(roof);
  for (const x of [-0.8, 0, 0.8]) {
    const window = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.28), new THREE.MeshBasicMaterial({ color: 0xf5edc8, transparent: true, opacity: 0.75 }));
    window.position.set(x, 1.02, -0.55);
    window.rotation.y = Math.PI;
    group.add(window);
  }
  world.add(group);
}

function addWalkingVisitors() {
  for (let i = 0; i < 12; i += 1) {
    const walker = createWalkerMesh(i);
    world.add(walker);
    refs.walkers.push({
      mesh: walker,
      phase: i / 12 * Math.PI * 2,
      speed: 0.018 + (i % 4) * 0.004,
      radius: 1.12 + (i % 3) * 0.035,
      wobble: Math.random() * Math.PI * 2
    });
  }
}

function createWalkerMesh(index) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xefc49c, roughness: 0.74 });
  const shirtColors = [0x315f96, 0xb45c12, 0x6a9b5a, 0x8d5a9f];
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColors[index % shirtColors.length], roughness: 0.75 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x333f3e, roughness: 0.82 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.44, 0.16), shirt);
  body.position.y = 0.58;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin);
  head.position.y = 0.9;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.07), pants);
  legL.position.set(-0.07, 0.24, 0);
  const legR = legL.clone();
  legR.position.x = 0.07;
  group.add(body, head, legL, legR);
  group.userData.legs = [legL, legR];
  for (const part of group.children) part.castShadow = true;
  return group;
}

function createSignSprite(text, color, width, height) {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(238,230,202,0.96)";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "rgba(120,105,80,0.7)";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, c.width - 10, c.height - 10);
  ctx.font = "900 58px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(width, height, 1);
  return sprite;
}

function addShoreLandmarks() {
  const tower = new THREE.Group();
  tower.position.set(lake.rx * 0.96, terrainHeightAt(lake.rx * 0.96, lake.rz * 0.7), lake.rz * 0.7);
  tower.rotation.y = -0.18;
  const brick = new THREE.MeshStandardMaterial({ color: 0xb36a4c, roughness: 0.78 });
  const darkBrick = new THREE.MeshStandardMaterial({ color: 0x8f4f3f, roughness: 0.82 });
  const eaveMaterial = new THREE.MeshStandardMaterial({ color: 0x5d6661, roughness: 0.84 });
  const stoneBase = new THREE.MeshStandardMaterial({ color: 0xc5ad8a, roughness: 0.88 });

  const plinthShapes = [
    [1.25, 1.36, 0.24],
    [1.08, 1.18, 0.18],
    [0.94, 1.02, 0.2]
  ];
  let y = 0;
  for (const [top, bottom, height] of plinthShapes) {
    const baseTier = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 8), stoneBase);
    baseTier.position.y = y + height / 2;
    baseTier.castShadow = true;
    baseTier.receiveShadow = true;
    tower.add(baseTier);
    y += height;
  }

  for (let i = 0; i < 13; i += 1) {
    const radius = 0.82 - i * 0.026;
    const storyHeight = i < 2 ? 0.42 : 0.36;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.96, radius, storyHeight, 8), brick);
    body.position.y = y + storyHeight / 2;
    body.castShadow = true;
    tower.add(body);

    if (i < 9) {
      for (const a of [0, Math.PI / 2]) {
        const slit = new THREE.Mesh(
          new THREE.PlaneGeometry(0.12, 0.2),
          new THREE.MeshBasicMaterial({ color: 0x392e2a, transparent: true, opacity: 0.58 })
        );
        slit.position.set(Math.sin(a) * (radius + 0.006), y + storyHeight * 0.52, Math.cos(a) * (radius + 0.006));
        slit.rotation.y = a;
        tower.add(slit);
      }
    }

    y += storyHeight;
    const eave = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.22, radius * 1.12, 0.1, 8), eaveMaterial);
    eave.position.y = y + 0.05;
    eave.castShadow = true;
    tower.add(eave);

    const brickBand = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.03, radius * 1.03, 0.035, 8), darkBrick);
    brickBand.position.y = y + 0.12;
    tower.add(brickBand);
    y += 0.16;
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.38, 8), brick);
  neck.position.y = y + 0.19;
  neck.castShadow = true;
  tower.add(neck);
  y += 0.38;

  const finialBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.14, 8), eaveMaterial);
  finialBase.position.y = y + 0.07;
  finialBase.castShadow = true;
  tower.add(finialBase);
  y += 0.14;

  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.08, 12), eaveMaterial);
  spire.position.y = y + 0.54;
  spire.castShadow = true;
  tower.add(spire);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), eaveMaterial);
  finial.position.y = y + 1.14;
  finial.castShadow = true;
  tower.add(finial);
  world.add(tower);

  const pavilion = new THREE.Group();
  pavilion.position.set(-lake.rx * 0.42, terrainHeightAt(-lake.rx * 0.42, lake.rz * 0.92), lake.rz * 0.92);
  const stone = new THREE.MeshStandardMaterial({ color: 0xded4b0, roughness: 0.9 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x764a34, roughness: 0.78 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.96, 0.12, 16), stone);
  base.position.y = 0.06;
  pavilion.add(base);
  for (const [x, z] of [[-0.52, -0.52], [0.52, -0.52], [-0.52, 0.52], [0.52, 0.52]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.72, 8), darkWood);
    post.position.set(x, 0.46, z);
    post.castShadow = true;
    pavilion.add(post);
  }
  const pavilionRoof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.46, 4), new THREE.MeshStandardMaterial({ color: 0x8f4b32, roughness: 0.74 }));
  pavilionRoof.position.y = 0.96;
  pavilionRoof.rotation.y = Math.PI / 4;
  pavilionRoof.castShadow = true;
  pavilion.add(pavilionRoof);
  world.add(pavilion);

  const pathMaterial = new THREE.MeshStandardMaterial({ color: 0xd8cfa9, roughness: 0.92 });
  for (let i = 0; i < 24; i += 1) {
    const a = -2.4 + i * 0.1;
    const stoneStep = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.035, 0.34), pathMaterial);
    stoneStep.position.set(Math.cos(a) * lake.rx * 1.08, roadTopY + 0.01, Math.sin(a) * lake.rz * 1.08);
    stoneStep.rotation.y = -a;
    stoneStep.receiveShadow = true;
    world.add(stoneStep);
  }
}

function addIsland() {
  const group = new THREE.Group();
  group.position.set(lake.rx * 0.08, islandLiftY, -lake.rz * 0.07);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(8.0, 8.45, 0.46, 64),
    new THREE.MeshStandardMaterial({ color: 0xd2c27d, roughness: 0.9 })
  );
  base.scale.z = 0.58;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  const grass = new THREE.Mesh(
    new THREE.CylinderGeometry(7.15, 7.54, 0.16, 64),
    new THREE.MeshStandardMaterial({ color: 0x89a95a, roughness: 0.9 })
  );
  grass.position.y = 0.2;
  grass.scale.z = 0.55;
  grass.receiveShadow = true;
  group.add(grass);

  for (const [x, z, r] of [[-3.8, -0.36, 1.0], [3.65, -0.32, 1.08], [0.3, 1.55, 0.78], [1.8, -1.55, 0.72], [-1.2, 2.0, 0.62]]) {
    const bush = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),
      new THREE.MeshStandardMaterial({ color: 0x668f3c, roughness: 0.86 })
    );
    bush.position.set(x, 0.45, z);
    bush.castShadow = true;
    group.add(bush);
  }
  group.add(createTree("willow", 1.2, -4.7, 0.24));
  group.add(createTree("pine", 1.02, 4.6, 0.18));

  const pavilion = new THREE.Group();
  pavilion.position.set(0.2, 0.18, -0.06);
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.74, 0.8, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0xcdbb82, roughness: 0.86 })
  );
  floor.position.y = 0.08;
  pavilion.add(floor);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.88, 0.36, 4),
    new THREE.MeshStandardMaterial({ color: 0x9a5136, roughness: 0.78 })
  );
  roof.position.y = 0.82;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  pavilion.add(roof);
  for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.052, 0.62, 8),
      new THREE.MeshStandardMaterial({ color: 0x724932, roughness: 0.8 })
    );
    post.position.set(x, 0.42, z);
    post.castShadow = true;
    pavilion.add(post);
  }
  group.add(pavilion);

  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x9b9b8a, roughness: 0.92 });
  for (const [x, z, s] of [[-6.8, -0.05, 0.42], [-5.8, 0.92, 0.3], [6.7, -0.76, 0.38], [5.8, 0.86, 0.3]]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMaterial);
    rock.position.set(x, 0.27, z);
    rock.scale.y = 0.55;
    rock.castShadow = true;
    group.add(rock);
  }
  world.add(group);
}

function addRecycle() {
  for (let i = 0; i < recycleSpots.length; i += 1) {
    const bin = createRecycleBin(recycleSpots[i], i === 0);
    bin.rotation.y = i * 0.35;
    refs.recycleBins.push(bin);
    world.add(bin);
  }
}

function createRecycleBin(position, primary = false) {
  const group = new THREE.Group();
  group.position.set(position.x, terrainHeightAt(position.x, position.z), position.z);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(primary ? 0.9 : 0.72, primary ? 0.9 : 0.72, 0.04, 32),
    new THREE.MeshStandardMaterial({ color: 0x2d8064, transparent: true, opacity: 0.32 })
  );
  const bin = new THREE.Mesh(
    new THREE.BoxGeometry(primary ? 0.8 : 0.64, primary ? 0.86 : 0.72, primary ? 0.62 : 0.5),
    new THREE.MeshStandardMaterial({ color: 0x2d8064, roughness: 0.65 })
  );
  bin.position.y = primary ? 0.45 : 0.38;
  bin.castShadow = true;
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(primary ? 1.0 : 0.82, 0.16, primary ? 0.76 : 0.62),
    new THREE.MeshStandardMaterial({ color: 0xe9f5e9, roughness: 0.7 })
  );
  lid.position.y = primary ? 0.94 : 0.78;
  lid.castShadow = true;
  group.add(base, bin, lid);
  if (primary) refs.recycle = group;
  return group;
}

function buildDuckView() {
  const group = new THREE.Group();
  group.userData.keep = true;
  group.position.set(0.06, -0.78, -0.98);
  group.scale.setScalar(0.22);

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
  const wingR = wing.clone();
  wingR.position.x = 0.02;
  wingR.position.z = 0.16;
  wingR.scale.set(0.95, 0.28, 0.52);

  const footMaterial = new THREE.MeshStandardMaterial({ color: 0xe06f2a, roughness: 0.72 });
  const footL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8), footMaterial);
  footL.scale.set(1.5, 0.24, 0.82);
  footL.position.set(-0.18, -0.24, -0.22);
  const footR = footL.clone();
  footR.position.x = 0.15;

  group.add(body, head, beak, wing, wingR, footL, footR);
  refs.duckViewParts = { body, head, beak, wing, wingR, footL, footR };
  refs.duckView = group;
  camera.add(group);
}

function createTrashMesh(item) {
  const group = new THREE.Group();
  const [w, h, d] = item.type.size;
  const material = new THREE.MeshStandardMaterial({
    color: item.type.color,
    roughness: 0.62,
    emissive: item.urgent ? 0x4c0907 : 0x000000,
    emissiveIntensity: item.urgent ? 0.35 : 0
  });
  if (item.type.name === "塑料瓶") {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.52, h * 0.66, w, 16), material);
    bottle.rotation.z = Math.PI / 2;
    bottle.castShadow = true;
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(h * 0.42, h * 0.42, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0x315f96, roughness: 0.56 })
    );
    cap.rotation.z = Math.PI / 2;
    cap.position.x = w * 0.58;
    cap.castShadow = true;
    group.add(bottle, cap);
  } else if (item.type.name === "纸杯") {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.35, w * 0.25, h * 1.45, 16), material);
    cup.rotation.x = Math.PI / 2;
    cup.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(w * 0.35, 0.018, 8, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.z = h * 0.72;
    group.add(cup, rim);
  } else {
    const wrapper = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    wrapper.scale.set(1, 0.55, 1);
    wrapper.castShadow = true;
    group.add(wrapper);
    for (let i = -1; i <= 1; i += 1) {
      const crease = new THREE.Mesh(new THREE.BoxGeometry(0.018, h * 0.9, d * 0.92), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.26 }));
      crease.position.x = i * w * 0.24;
      crease.position.y = h * 0.1;
      group.add(crease);
    }
  }

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(item.urgent ? 0.66 : 0.52, item.urgent ? 0.032 : 0.024, 8, 40),
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
  const shirt = new THREE.MeshStandardMaterial({ color: visitor.shirtColor || 0x315f96, roughness: 0.72 });
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
  let healthFill = null;
  if (visitor.isBoss) {
    group.scale.setScalar(1.42);
    const badge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, 0.1, 5),
      new THREE.MeshStandardMaterial({ color: 0xd24d3f, roughness: 0.62 })
    );
    badge.position.set(0, 1.42, 0);
    badge.rotation.y = Math.PI / 5;
    const healthBack = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x301818, transparent: true, opacity: 0.82, depthWrite: false })
    );
    healthBack.position.set(0, 1.72, 0.03);
    healthFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.045),
      new THREE.MeshBasicMaterial({ color: 0xd24d3f, transparent: true, opacity: 0.95, depthWrite: false })
    );
    healthFill.position.set(0, 1.72, 0.04);
    group.add(badge, healthBack, healthFill);
  }
  group.userData = { shirt, arms: [armL, armR], healthFill };
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

function addWake(x, z, angle, strong = false) {
  const material = new THREE.MeshBasicMaterial({ color: strong ? 0xe9fbff : 0xffffff, transparent: true, opacity: strong ? 0.62 : 0.42 });
  for (const side of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(strong ? 0.24 : 0.18, 0.012, 8, 36), material.clone());
    const sideX = Math.cos(angle) * side * 0.18;
    const sideZ = -Math.sin(angle) * side * 0.18;
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = angle + side * 0.28;
    ring.position.set(x + sideX, 0.044, z + sideZ);
    dynamic.add(ring);
    refs.rings.add(ring);
    state.ripples.push({ mesh: ring, r: strong ? 0.24 : 0.18, a: strong ? 1.15 : 0.92, speed: strong ? 2.8 : 2.1, sx: 1.55, sy: 0.42 });
  }
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

function addDroplets(x, z, color = 0xe8fbff) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 });
  for (let i = 0; i < 9; i += 1) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025 + Math.random() * 0.018, 6, 4), material.clone());
    const a = Math.random() * Math.PI * 2;
    const r = 0.12 + Math.random() * 0.5;
    dot.position.set(x + Math.cos(a) * r, 0.12 + Math.random() * 0.22, z + Math.sin(a) * r);
    dynamic.add(dot);
    refs.rings.add(dot);
    state.ripples.push({ mesh: dot, r: 0.18, a: 0.72, speed: 0.42, droplet: true, vy: 0.75 + Math.random() * 0.42 });
  }
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

function nearestRecyclePoint(point = state.duck) {
  let best = recycleSpots[0];
  let bestD = dist(point, best);
  for (const spot of recycleSpots) {
    const d = dist(point, spot);
    if (d < bestD) {
      best = spot;
      bestD = d;
    }
  }
  return { spot: best, d: bestD };
}

function visitorThrowDelay() {
  const stage = currentStage();
  const round = stage.id;
  const base = 15.5 - (round - 1) * 2.25;
  const variance = Math.max(3.5, 9.5 - (round - 1) * 1.15);
  const awarenessDelay = (state?.awareness || 0) * Math.max(0.04, 0.15 - (round - 1) * 0.018);
  const voiceDelay = (state?.upgradeLevels?.voice || 0) * 2.2;
  return Math.max(stage.mode === "boss" ? 2.8 : 4.2, (base + Math.random() * variance + awarenessDelay + voiceDelay) * stage.throwDelayScale);
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

function currentStage() {
  return stages[Math.max(0, Math.min(stages.length - 1, (state?.round || 1) - 1))];
}

function completedTrashBeforeStage(stageId = state.round) {
  return stages
    .filter((stage) => stage.id < stageId)
    .reduce((sum, stage) => sum + stage.trashTarget, 0);
}

function currentRoundProgress() {
  const stage = currentStage();
  if (stage.mode === "boss") return Math.max(0, Math.round((state.boss?.health || 0) / (state.boss?.maxHealth || bossMaxHealth) * 100));
  return Math.min(stage.trashTarget, Math.max(0, state.score - completedTrashBeforeStage(stage.id)));
}

function maybeAdvanceRound() {
  if (state.result !== "playing") return;
  const stage = currentStage();
  if (stage.mode === "boss") {
    if (state.boss && state.boss.health <= 0) openChannelAndWin();
    return;
  }
  const roundCompleteScore = completedTrashBeforeStage(stage.id) + stage.trashTarget;
  if (state.score < roundCompleteScore) return;
  state.pendingRound = state.round + 1;
  state.result = "upgrade";
  state.duck.vx = 0;
  state.duck.vz = 0;
  playSuccess();
  ui.upgradeTitle.textContent = `${stage.name}完成，选择一次升级`;
  ui.upgradeModal.hidden = false;
  document.exitPointerLock?.();
  updateUi();
}

function enterStage(stageId, options = {}) {
  const stage = stages[Math.max(0, Math.min(stages.length - 1, stageId - 1))];
  state.round = stage.id;
  state.roundTarget = stage.trashTarget;
  state.pendingRound = null;
  state.result = "playing";
  state.duck.carrying = [];
  for (const visitor of state.visitors) visitor.timer = Math.min(visitor.timer, visitorThrowDelay() * 0.62);
  if (stage.mode === "boss") setupBossStage();
  if (!options.silent) addText(`${stage.name}开始`, state.duck.x, state.duck.z, stage.mode === "boss" ? "#b33327" : "#2d8064");
}

function setupBossStage() {
  clearThrownProjectiles();
  state.trash = [];
  state.boss = makeBossVisitor();
  state.bossSpawnTimer = 3.5;
  state.duck.health = state.duck.maxHealth;
  state.visitors = [
    state.boss,
    makeBossMinion(0),
    makeBossMinion(1),
    makeBossMinion(2),
    makeBossMinion(3),
    makeBossMinion(4),
    makeBossMinion(5)
  ];
  for (const mesh of refs.visitors.values()) {
    dynamic.remove(mesh);
    disposeObject(mesh);
  }
  refs.visitors.clear();
}

function clearThrownProjectiles() {
  for (const item of state.thrown) {
    if (!item.mesh) continue;
    dynamic.remove(item.mesh);
    disposeObject(item.mesh);
    refs.thrown.delete(item.mesh);
  }
  state.thrown = [];
}

function performAction() {
  resumeAudio();
  if (state.paused) return;
  if (state.result !== "playing") {
    if (state.result !== "upgrade") reset();
    return;
  }
  const duck = state.duck;
  const bin = nearestRecyclePoint(duck);

  if (carryingCount() > 0 && bin.d < 3.0) {
    const cleanedItems = [...duck.carrying];
    const urgentCleaned = cleanedItems.filter((item) => item.urgent).length;
    const comboBonus = state.comboTimer > 0 ? Math.min(4, state.combo) : 0;
    duck.carrying = [];
    state.score += cleanedItems.length;
    state.combo = Math.min(9, state.combo + 1);
    state.comboTimer = 8;
    state.clarity = Math.min(100, state.clarity + cleanedItems.length * 5.5 + urgentCleaned * 4.5 + comboBonus * 1.1);
    addText(`回收 ${carriedLabel(cleanedItems)}${comboBonus ? ` x${state.combo}` : ""}`, bin.spot.x, bin.spot.z, "#2d8064");
    addRipple(bin.spot.x, bin.spot.z, 0x2d8064);
    addDroplets(bin.spot.x, bin.spot.z, 0x9de7cf);
    playDrop();
    if (state.score >= 4 && !duck.sign) {
      duck.sign = true;
      addText("学生递来了小告示牌", duck.x, duck.z, "#b45c12");
    }
    maybeAdvanceRound();
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
      addDroplets(target.item.x, target.item.z);
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
      if (v.isBoss) {
        const damage = (state.duck.sign ? 17 : 12) + state.duck.quackBoost * 0.08;
        v.health = Math.max(0, v.health - damage);
        v.cooldown = Math.max(v.cooldown, 0.75);
        v.shame = 2.2;
        v.throwWindup = 0;
        v.nextTarget = null;
        warnedCount += 1;
        addText(`重点游客 -${Math.round(damage)}`, v.x, v.z, "#b33327");
        continue;
      }
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
    maybeAdvanceRound();
  } else {
    addText("嘎", duck.x, duck.z, "#315f96");
  }
}

function update(dt) {
  if (state.paused) {
    syncScene();
    updateCamera(dt);
    updateUi();
    return;
  }
  if (state.result !== "playing") {
    updateParticles(dt);
    syncScene();
    updateCamera(dt);
    updateUi();
    return;
  }

  state.time += dt;
  const urgentCount = state.trash.filter((item) => item.urgent).length;
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer <= 0) state.combo = 0;
  state.clarity -= (state.trash.length * 0.07 + urgentCount * 0.12) * dt;
  state.clarity = clamp(state.clarity, 0, 100);
  if (state.clarity <= pollutionFailThreshold) {
    state.result = "lost";
    addText("湖面失守", state.duck.x, state.duck.z, "#b33327");
    playFailure();
  } else {
    maybeAdvanceRound();
  }

  updateDuck(dt);
  updateBossPressure(dt);
  updateVisitors(dt);
  updateThrown(dt);
  updateTrash(dt);
  updateParticles(dt);
  syncScene();
  updateCamera(dt);
  updateUi();
}

function openChannelAndWin() {
  if (state.result === "won") return;
  clearThrownProjectiles();
  state.trash = [];
  state.round = totalStages;
  state.result = "won";
  state.clarity = Math.max(state.clarity, 72);
  addText("重点游客离开", lake.rx * 0.72, -lake.rz * 0.98, "#2d8064");
  addText("胜利", state.duck.x, state.duck.z, "#2d8064");
  addRipple(lake.rx * 0.72, -lake.rz * 0.98, 0x2d8064);
  playSuccess();
}

function updateDuck(dt) {
  const duck = state.duck;
  const previousSurface = duck.surface;
  let forward = 0;
  let strafe = 0;
  let turn = 0;
  if (keys.has("ArrowLeft")) turn -= 1;
  if (keys.has("ArrowRight")) turn += 1;
  if (keys.has("ArrowUp") || keys.has("w")) forward += 1;
  if (keys.has("ArrowDown") || keys.has("s")) forward -= 0.62;
  if (keys.has("a") || keys.has("q")) strafe -= 1;
  if (keys.has("d") || keys.has("e")) strafe += 1;

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
  const swimming = isDuckSwimming(duck);
  duck.sprinting = wantsSprint;
  if (wantsSprint) duck.stamina = Math.max(0, duck.stamina - dt * duck.sprintDrain);
  else duck.stamina = Math.min(duck.maxStamina, duck.stamina + dt * (swimming ? 20 : 28));

  const baseSpeed = swimming ? 7.2 : 4.2;
  const speed = baseSpeed * (duck.sprinting ? 1.55 : 1);
  duck.vx += (mx * speed - duck.vx) * Math.min(1, dt * 9);
  duck.vz += (mz * speed - duck.vz) * Math.min(1, dt * 9);
  const nextX = duck.x + duck.vx * dt;
  const nextZ = duck.z + duck.vz * dt;
  const from = { x: duck.x, z: duck.z };
  let nextSurface = duck.surface;
  let blocked = false;
  let p = clampToLake({ x: nextX, z: nextZ }, playableLakeMargin);
  let move = resolveDuckSurfaceMove(duck.surface, from, p);
  if (!move.blocked) {
    nextSurface = move.surface;
    p = pushOutOfSolidObstacles(p, nextSurface);
    p = clampToLake(p, playableLakeMargin);
    move = resolveDuckSurfaceMove(duck.surface, from, p);
    blocked = move.blocked;
    if (!blocked) nextSurface = move.surface;
  } else {
    blocked = true;
  }
  if (blocked) p = from;
  if (blocked || p.x !== nextX || p.z !== nextZ) {
    duck.vx = 0;
    duck.vz = 0;
  }
  duck.x = p.x;
  duck.z = p.z;
  duck.surface = blocked ? duck.surface : nextSurface;
  if (previousSurface !== duck.surface) {
    playSurfaceChange(previousSurface, duck.surface);
    duck.lastSurface = duck.surface;
  }
  duck.eyeY += (duckEyeTargetY(duck.x, duck.z, duck.surface) - duck.eyeY) * Math.min(1, dt * 5.2);
  duck.bob += dt * (m > 0 ? 10 : 4);

  const swimSpeed = Math.hypot(duck.vx, duck.vz);
  const currentSwimming = isDuckSwimming(duck);
  if (currentSwimming && swimSpeed > 1.0 && state.time % (duck.sprinting ? 0.14 : 0.23) < dt) {
    const wakeX = duck.x - dirX * 0.58;
    const wakeZ = duck.z - dirZ * 0.58;
    addWake(wakeX, wakeZ, yaw, duck.sprinting);
    playPaddle(duck.sprinting, swimSpeed);
  } else if (!currentSwimming && swimSpeed > 0.75 && state.time % footstepInterval(duck.surface, duck.sprinting) < dt) {
    playFootstep(duck.surface, duck.sprinting, swimSpeed);
  }
}

function updateBossPressure(dt) {
  if (currentStage().mode !== "boss" || !state.boss || state.boss.health <= 0) return;
  state.bossSpawnTimer -= dt;
  const minionCount = state.visitors.filter((visitor) => visitor.isMinion).length;
  if (state.bossSpawnTimer > 0 || minionCount >= 28) return;
  const minion = makeBossMinion(minionCount);
  minion.timer = Math.min(minion.timer, visitorThrowDelay() * 0.45);
  state.visitors.push(minion);
  state.bossSpawnTimer = Math.max(2.4, 7.2 - minionCount * 0.18 - (1 - state.boss.health / state.boss.maxHealth) * 2.6);
  addText("又有跟随游客加入", minion.x, minion.z, "#8a5a2f");
}

function updateVisitors(dt) {
  for (const visitor of state.visitors) {
    visitor.drift += dt;
    const drifted = placeOnShore({
      x: visitor.baseX + Math.cos(visitor.drift * 0.7) * 0.2,
      z: visitor.baseZ + Math.sin(visitor.drift * 0.9) * 0.14
    }, 1.13);
    visitor.x = drifted.x;
    visitor.z = drifted.z;
    visitor.cooldown = Math.max(0, visitor.cooldown - dt);
    visitor.shame = Math.max(0, visitor.shame - dt);

    if (visitor.cooldown > 0) continue;
    visitor.timer -= dt;
    visitor.talkTimer -= dt;
    if (visitor.talkTimer <= 0 && dist(state.duck, visitor) < lake.rx * 0.72) {
      visitor.talkTimer = 5.5 + Math.random() * 7.5 + state.awareness * 0.05;
      playVisitorChatter(visitor.shame > 0);
    }
    if (visitor.timer < 1.1 && !visitor.nextTarget) {
      visitor.nextTarget = visitor.isBoss || (currentStage().mode === "boss" && Math.random() < 0.62)
        ? { x: state.duck.x, z: state.duck.z, aimDuck: true }
        : randomWaterTarget();
      visitor.throwWindup = visitor.isBoss ? 1.35 : 1.1;
      playVisitorWindup();
    }
    if (visitor.throwWindup > 0) visitor.throwWindup -= dt;
    if (visitor.timer <= 0) {
      const target = visitor.nextTarget || randomWaterTarget();
      const typeIndex = Math.floor(Math.random() * trashTypes.length);
      const urgent = visitor.isBoss || Math.random() < (currentStage().mode === "boss" ? 0.28 : 0.12);
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
        aimDuck: target.aimDuck || false,
        damage: visitor.throwDamage || 8,
        hitRadius: visitor.isBoss ? 2.25 : 1.55,
        mesh: null
      });
      playVisitorThrow(urgent);
      visitor.timer = visitor.isBoss ? 1.7 + Math.random() * 1.1 : visitorThrowDelay();
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
      let dropPoint = { x: item.tx, z: item.tz };
      if (!isWater(dropPoint.x, dropPoint.z)) dropPoint = randomWaterTarget();
      if (item.aimDuck && dist(state.duck, item) <= (item.hitRadius || 1.35)) {
        state.duck.health = Math.max(0, state.duck.health - (item.damage || 8));
        addText(`鸭子 -${item.damage || 8}`, state.duck.x, state.duck.z, "#b33327");
        state.cameraShake = Math.max(state.cameraShake, 0.34);
        if (state.duck.health <= 0 && state.result === "playing") {
          state.result = "lost";
          addText("鸭子被赶退", state.duck.x, state.duck.z, "#b33327");
          playFailure();
        }
      }
      state.trash.push(makeTrashWorld(dropPoint.x, dropPoint.z, item.typeIndex, item.urgent));
      addRipple(dropPoint.x, dropPoint.z, 0xd24d3f);
      addDroplets(dropPoint.x, dropPoint.z, item.urgent ? 0xffb3a8 : 0xe8fbff);
      state.cameraShake = Math.max(state.cameraShake, 0.16);
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
      const p = isInsideIslandFootprint(item.x, item.z, 0.16) ? pushOutOfIsland(item) : clampToLake(item, 0.95);
      item.x = p.x;
      item.z = p.z;
      item.vx *= -0.4;
      item.vz *= -0.4;
    }
    if (isSolidObstacle(item.x, item.z)) {
      const p = pushOutOfSolidObstacles(item);
      item.x = p.x;
      item.z = p.z;
      item.vx *= -0.45;
      item.vz *= -0.45;
    }
  }
}

function updateParticles(dt) {
  for (const ripple of state.ripples) {
    ripple.r += dt * ripple.speed;
    ripple.a -= dt * (ripple.droplet ? 1.75 : 1.15);
    if (ripple.droplet) {
      ripple.mesh.position.y += (ripple.vy || 0.8) * dt;
      ripple.mesh.material.opacity = Math.max(0, ripple.a * 0.72);
    } else {
      const size = ripple.r / 0.18;
      ripple.mesh.scale.set(size * (ripple.sx || 1), size * (ripple.sy || 1), size);
      ripple.mesh.material.opacity = Math.max(0, ripple.a * 0.55);
    }
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
  refs.water.material.color.setHex(state.clarity > 70 ? 0x49aabd : state.clarity > 45 ? 0x4ea3b6 : 0x596f74);
  animateWaterSurface();
  if (refs.water.material.bumpMap) {
    refs.water.material.bumpMap.offset.x = state.time * 0.018;
    refs.water.material.bumpMap.offset.y = state.time * 0.01;
  }
  for (const detail of refs.waterDetails) {
    detail.mesh.material.opacity = detail.baseOpacity * (0.72 + Math.sin(state.time * detail.speed + detail.phase) * 0.28);
    detail.mesh.position.y = detail.baseY + Math.sin(state.time * detail.speed + detail.phase) * 0.006;
  }
  for (const line of refs.flowLines) {
    line.mesh.position.x += 0.018 * line.speed;
    if (line.mesh.position.x > lake.rx * 0.88) line.mesh.position.x = -lake.rx * 0.88;
    line.mesh.position.z = line.baseZ + Math.sin(state.time * line.speed + line.phase) * 0.12;
    line.mesh.material.opacity = 0.12 + Math.sin(state.time * 1.4 + line.phase) * 0.08;
  }
  for (const sparkle of refs.waterSparkles) {
    sparkle.mesh.material.opacity = Math.max(0, Math.sin(state.time * sparkle.speed + sparkle.phase) - 0.64) * 0.54;
    sparkle.mesh.scale.x = 0.75 + Math.sin(state.time * 1.7 + sparkle.phase) * 0.22;
  }
  for (const foam of refs.foamLines) {
    foam.mesh.material.opacity = 0.12 + Math.sin(state.time * foam.speed + foam.phase) * 0.08;
  }
  for (const floater of refs.floaters) {
    floater.mesh.position.y = 0.07 + Math.sin(state.time * 1.25 + floater.phase) * 0.025;
    floater.mesh.rotation.y += 0.003 * Math.sin(state.time + floater.drift);
  }
  for (const reed of refs.reeds) {
    reed.mesh.rotation.z = reed.baseRot + Math.sin(state.time * 1.4 + reed.phase) * 0.035;
  }
  for (const lamp of refs.lanterns) {
    const glow = lamp.mesh.children[2];
    glow.material.opacity = 0.1 + Math.sin(state.time * 1.2 + lamp.phase) * 0.035;
    glow.scale.setScalar(0.92 + Math.sin(state.time * 1.8 + lamp.phase) * 0.08);
  }
  for (const walker of refs.walkers) {
    const a = walker.phase + state.time * walker.speed;
    const x = Math.cos(a) * lake.rx * walker.radius;
    const z = Math.sin(a) * lake.rz * walker.radius;
    const nx = Math.cos(a + 0.02) * lake.rx * walker.radius;
    const nz = Math.sin(a + 0.02) * lake.rz * walker.radius;
    walker.mesh.position.set(x, terrainHeightAt(x, z), z);
    walker.mesh.rotation.y = Math.atan2(nx - x, nz - z);
    const step = Math.sin(state.time * 4.2 + walker.wobble) * 0.32;
    walker.mesh.userData.legs[0].rotation.x = step;
    walker.mesh.userData.legs[1].rotation.x = -step;
  }
  for (const blocker of refs.channelBlockers) {
    blocker.visible = state.result !== "won";
  }
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
    mesh.position.set(visitor.x, terrainHeightAt(visitor.x, visitor.z), visitor.z);
    mesh.lookAt(camera.position.x, 0, camera.position.z);
    mesh.userData.shirt.color.setHex(visitor.cooldown > 0 ? 0x6a9b5a : (visitor.shirtColor || 0x315f96));
    const wind = visitor.throwWindup > 0 ? 1 : 0;
    mesh.userData.arms[0].rotation.z = -0.55 - wind * 0.7;
    mesh.userData.arms[1].rotation.z = 0.55 + wind * 0.7;
    if (visitor.isBoss && mesh.userData.healthFill) {
      const pct = clamp(visitor.health / visitor.maxHealth, 0, 1);
      mesh.userData.healthFill.scale.x = pct;
      mesh.userData.healthFill.position.x = (pct - 1) * 0.43;
    }
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

  for (let i = 0; i < refs.recycleBins.length; i += 1) refs.recycleBins[i].rotation.y = state.time * 0.18 + i * 0.35;
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
  const eyeY = duck.eyeY ?? duckEyeTargetY(duck.x, duck.z, duck.surface);
  camera.position.set(duck.x + shake, eyeY + Math.sin(duck.bob) * 0.025, duck.z + shake);
  camera.rotation.set(pitch, yaw, 0);
  refs.duckView.position.y = -0.78 + Math.sin(duck.bob) * 0.01;
  const wingSwing = Math.sin(duck.bob * 0.86) * (duck.sprinting ? 0.18 : 0.08);
  if (refs.duckViewParts.wing) refs.duckViewParts.wing.rotation.z = -0.08 + wingSwing;
  if (refs.duckViewParts.wingR) refs.duckViewParts.wingR.rotation.z = 0.06 - wingSwing * 0.7;
  if (refs.duckViewParts.footL) refs.duckViewParts.footL.rotation.x = Math.sin(duck.bob) * 0.24;
  if (refs.duckViewParts.footR) refs.duckViewParts.footR.rotation.x = -Math.sin(duck.bob) * 0.24;
}

function animateWaterSurface() {
  const data = refs.waterVertices;
  if (!data) return;
  const positions = data.attribute;
  const arr = positions.array;
  const base = data.base;
  for (let i = 0; i < positions.count; i += 1) {
    const index = i * 3;
    const x = base[index];
    const y = base[index + 1];
    const radius = Math.hypot(x, y);
    const edgeFade = 1 - smoothstep(0.86, 1.0, radius) * 0.54;
    const wave =
      Math.sin(x * 15.5 + state.time * 1.8) * 0.018 +
      Math.sin(y * 22.0 + state.time * 1.25) * 0.012 +
      Math.sin((x + y) * 11.0 - state.time * 1.55) * 0.01;
    arr[index + 2] = wave * edgeFade;
  }
  positions.needsUpdate = true;
  refs.waterSurface.geometry.computeVertexNormals();
}

function updateMinimap() {
  for (const item of refs.minimap) item.remove();
  refs.minimap = [];

  if (!ui.radarMap) return;
  const makeDot = (x, z, className) => {
    const dot = document.createElement("i");
    dot.className = `radar-dot ${className}`;
    dot.style.left = `${50 + x / (lake.rx * playableLakeMargin) * 44}%`;
    dot.style.top = `${50 + z / (lake.rz * playableLakeMargin) * 40}%`;
    ui.radarMap.append(dot);
    refs.minimap.push(dot);
  };
  makeDot(state.duck.x, state.duck.z, "duck");
  for (const item of state.trash) makeDot(item.x, item.z, item.urgent ? "urgent" : "trash");
  if (currentStage().mode === "boss") {
    for (const visitor of state.visitors) makeDot(visitor.x, visitor.z, visitor.isBoss ? "boss" : "minion");
  }
}

function updateUi() {
  const clarity = Math.round(state.clarity);
  const awareness = Math.round(state.awareness);
  const stamina = Math.round(state.duck.stamina);
  const staminaPct = Math.round(state.duck.stamina / state.duck.maxStamina * 100);
  const stage = currentStage();
  const roundProgress = currentRoundProgress();
  ui.clarityValue.textContent = `${clarity}%`;
  ui.awarenessValue.textContent = `${awareness}%`;
  ui.staminaValue.textContent = `${stamina}/${state.duck.maxStamina}`;
  ui.clarityBar.style.width = `${clarity}%`;
  ui.awarenessBar.style.width = `${awareness}%`;
  ui.staminaBar.style.width = `${staminaPct}%`;
  const inBossStage = stage.mode === "boss";
  ui.duckHealthMeter.hidden = !inBossStage;
  ui.bossHealthMeter.hidden = !inBossStage;
  if (inBossStage) {
    const duckHealth = Math.round(state.duck.health);
    const bossHealth = Math.round(state.boss?.health || 0);
    const bossHealthMax = state.boss?.maxHealth || bossMaxHealth;
    ui.duckHealthValue.textContent = `${duckHealth}/${state.duck.maxHealth}`;
    ui.bossHealthValue.textContent = `${bossHealth}/${bossHealthMax}`;
    ui.duckHealthBar.style.width = `${clamp(state.duck.health / state.duck.maxHealth * 100, 0, 100)}%`;
    ui.bossHealthBar.style.width = `${clamp((state.boss?.health || 0) / bossHealthMax * 100, 0, 100)}%`;
    ui.scorePill.textContent = `第 ${state.round} / ${totalStages} 阶段  Boss ${bossHealth}/${bossHealthMax}`;
  } else {
    ui.scorePill.textContent = state.combo > 1
      ? `第 ${state.round} / ${totalStages} 阶段  ${roundProgress} / ${stage.trashTarget}  x${state.combo}`
      : `第 ${state.round} / ${totalStages} 阶段  ${roundProgress} / ${stage.trashTarget}`;
  }
  updatePauseMenu();

  if (state.result === "won") {
    ui.actionText.textContent = "胜利";
    ui.missionText.textContent = "进入第二阶段（尚未完成）";
    ui.nearestText.textContent = "重点游客已离开";
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
    ui.missionText.textContent = `${stage.name}完成`;
    ui.nearestText.textContent = `即将进入第 ${state.pendingRound} 阶段`;
    ui.actionButton.textContent = "等待选择";
    return;
  }

  const duck = state.duck;
  const nearTrash = nearestTrash();
  const nearVisitor = nearestVisitor();
  const nearBin = nearestRecyclePoint(duck);
  let action = "巡湖中";
  if (carryingCount() > 0 && nearBin.d < 3.0) action = "投放到回收点";
  else if (carryingCount() > 0) action = `叼着${carriedLabel(duck.carrying)} (${carryingCount()}/${duck.carryCapacity})`;
  else if (nearTrash && nearTrash.d < 1.45) action = `拾取${nearTrash.item.urgent ? "污染热点" : nearTrash.item.type.name}`;
  else if (nearVisitor && nearVisitor.d < (nearVisitor.visitor?.isBoss ? 4.8 : (duck.sign ? 2.45 : 1.8))) action = nearVisitor.visitor?.isBoss ? "鸣叫压制重点游客" : (duck.sign ? "举牌提醒游客" : "鸣叫提醒游客");
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
  else if (stage.mode === "boss") {
    const minions = state.visitors.filter((visitor) => visitor.isMinion).length;
    ui.missionText.textContent = `赶走重点游客，跟随游客 ${minions} 人`;
  }
  else if (state.trash.some((item) => item.urgent)) ui.missionText.textContent = "优先处理红色污染热点";
  else if (roundProgress >= stage.trashTarget - 2) {
    const left = stage.trashTarget - roundProgress;
    ui.missionText.textContent = `再清理 ${left} 件进入下一阶段`;
  }
  else if (state.trash.length > 0) ui.missionText.textContent = "定位并清理漂浮垃圾";
  else ui.missionText.textContent = `${stage.name}: 盯住岸边游客`;
}

function updatePauseMenu() {
  if (!ui.pauseMenu) return;
  const stage = currentStage();
  const roundProgress = currentRoundProgress();
  ui.pauseRoundText.textContent = `第 ${state.round} / ${totalStages} 阶段`;
  ui.pauseRoundProgressText.textContent = stage.mode === "boss" ? `Boss ${roundProgress}%` : `${roundProgress} / ${stage.trashTarget}`;
  ui.pauseTotalText.textContent = `${state.score} / ${cleanupTrashTarget}`;
  ui.pausePressureText.textContent = stage.pressureLabel;
}

function showPauseMenu() {
  if (!state || state.result !== "playing") return;
  state.paused = true;
  keys.clear();
  state.duck.vx = 0;
  state.duck.vz = 0;
  ui.pauseMenu.hidden = false;
  updateUi();
}

function hidePauseMenu(lockPointer = false) {
  if (!state) return;
  state.paused = false;
  ui.pauseMenu.hidden = true;
  updateUi();
  if (lockPointer) requestPointerLockSafely();
}

function requestPointerLockSafely() {
  try {
    const request = canvas.requestPointerLock?.();
    request?.catch?.(() => {});
  } catch {
    // Pointer lock can be unavailable in automated or embedded contexts.
  }
}

function regionName(item) {
  if (Math.abs(item.x) < lake.rx * 0.24 && Math.abs(item.z) < lake.rz * 0.22) return "湖心岛附近";
  if (item.z < -lake.rz * 0.32) return item.x < 0 ? "西北水域" : "博雅塔前水域";
  if (item.z > lake.rz * 0.34) return item.x < 0 ? "钟亭岸边" : "东南水域";
  return item.x < 0 ? "西侧水域" : "东侧水域";
}

function chooseUpgrade(type) {
  if (state.result !== "upgrade") return;
  const duck = state.duck;
  state.upgrade = type;
  if (type === "capacity") {
    state.upgradeLevels.capacity += 1;
    duck.carryCapacity = Math.min(5, duck.carryCapacity + 1);
    addText(`升级: 一次携带 ${duck.carryCapacity} 件`, duck.x, duck.z, "#2d8064");
  } else if (type === "stamina") {
    state.upgradeLevels.stamina += 1;
    duck.maxStamina += 35;
    duck.stamina = duck.maxStamina;
    duck.sprintDrain = Math.max(18, duck.sprintDrain - 4);
    addText(`升级: 体力 ${duck.maxStamina}`, duck.x, duck.z, "#b45c12");
  } else if (type === "voice") {
    state.upgradeLevels.voice += 1;
    duck.quackBoost += 24;
    addText("升级: 鸣叫更远", duck.x, duck.z, "#315f96");
  }
  ui.upgradeModal.hidden = true;
  enterStage(state.pendingRound || Math.min(totalStages, state.round + 1));
  updateUi();
}

function ensureAudio() {
  if (audio) return audio;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  const quack = new Audio("assets/mallard-quack.m4a");
  quack.preload = "auto";
  quack.volume = 0.31;
  audio = {
    ctx,
    master,
    movementSamples: {
      land: [],
      island: [],
      bridge: [],
      water: []
    },
    movementSamplesStarted: false,
    ambientBuffer: null,
    ambientLoadFailed: false,
    swimReadyAt: 0,
    footReadyAt: 0,
    visitorReadyAt: 0,
    ambienceStarted: false,
    quack,
    quackFallback: false
  };
  loadMovementSamples(audio);
  loadAmbientSample(audio);
  return audio;
}

function resumeAudio() {
  const setup = ensureAudio();
  if (!setup) return;
  if (setup.ctx.state === "suspended") {
    setup.ctx.resume().then(() => startAmbience(setup)).catch(() => {});
  } else {
    startAmbience(setup);
  }
}

function startAmbience(setup) {
  if (!setup || setup.ambienceStarted || setup.ctx.state !== "running") return;
  if (setup.ambientBuffer) {
    setup.ambienceStarted = true;
    const source = setup.ctx.createBufferSource();
    const gain = setup.ctx.createGain();
    const lowpass = setup.ctx.createBiquadFilter();
    source.buffer = setup.ambientBuffer;
    source.loop = true;
    lowpass.type = "lowpass";
    lowpass.frequency.value = 3600;
    gain.gain.value = 0.22;
    source.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(setup.master);
    source.start();
    setup.ambience = { source, gain, lowpass };
    return;
  }
  if (!setup.ambientLoadFailed) return;
  setup.ambienceStarted = true;
  const length = setup.ctx.sampleRate * 2;
  const buffer = setup.ctx.createBuffer(1, length, setup.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.34;
  }
  const source = setup.ctx.createBufferSource();
  const lowpass = setup.ctx.createBiquadFilter();
  const highpass = setup.ctx.createBiquadFilter();
  const gain = setup.ctx.createGain();
  const lfo = setup.ctx.createOscillator();
  const lfoGain = setup.ctx.createGain();
  source.buffer = buffer;
  source.loop = true;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 420;
  highpass.type = "highpass";
  highpass.frequency.value = 55;
  gain.gain.value = 0.012;
  lfo.frequency.value = 0.11;
  lfoGain.gain.value = 0.004;
  source.connect(lowpass);
  lowpass.connect(highpass);
  highpass.connect(gain);
  gain.connect(setup.master);
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  source.start();
  lfo.start();
  setup.ambience = { source, gain, lfo };
}

function loadAmbientSample(setup) {
  fetch(ambientAudioFile)
    .then((response) => response.arrayBuffer())
    .then((data) => setup.ctx.decodeAudioData(data))
    .then((buffer) => {
      setup.ambientBuffer = buffer;
      startAmbience(setup);
    })
    .catch(() => {
      setup.ambientLoadFailed = true;
      startAmbience(setup);
    });
}

function loadMovementSamples(setup) {
  if (!setup || setup.movementSamplesStarted) return;
  setup.movementSamplesStarted = true;
  for (const [name, urls] of Object.entries(movementAudioFiles)) {
    Promise.all(urls.map(async (url) => {
      const response = await fetch(url);
      const data = await response.arrayBuffer();
      return setup.ctx.decodeAudioData(data);
    })).then((buffers) => {
      setup.movementSamples[name] = buffers;
    }).catch(() => {
      setup.movementSamples[name] = [];
    });
  }
}

function playMovementSample(name, {
  gainValue = 0.14,
  playbackRate = 1,
  randomRate = 0.04,
  maxDuration = null,
  delay = 0
} = {}) {
  const setup = audio;
  const samples = setup?.movementSamples?.[name];
  if (!setup || !samples || samples.length === 0) return false;
  const source = setup.ctx.createBufferSource();
  const gain = setup.ctx.createGain();
  source.buffer = samples[Math.floor(Math.random() * samples.length)];
  source.playbackRate.value = Math.max(0.72, playbackRate + (Math.random() * 2 - 1) * randomRate);
  const duration = maxDuration ? Math.min(source.buffer.duration, maxDuration) : source.buffer.duration;
  gain.gain.setValueAtTime(gainValue, setup.ctx.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, setup.ctx.currentTime + delay + duration);
  source.connect(gain);
  gain.connect(setup.master);
  source.start(setup.ctx.currentTime + delay, 0, duration);
  return true;
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

function playNoiseBurst(duration = 0.08, gainValue = 0.04, filterFreq = 520) {
  const setup = ensureAudio();
  if (!setup) return;
  const length = Math.max(1, Math.floor(setup.ctx.sampleRate * duration));
  const buffer = setup.ctx.createBuffer(1, length, setup.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = setup.ctx.createBufferSource();
  const filter = setup.ctx.createBiquadFilter();
  const gain = setup.ctx.createGain();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = 2.2;
  gain.gain.setValueAtTime(gainValue, setup.ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, setup.ctx.currentTime + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(setup.master);
  source.start();
}

function playQuack() {
  const setup = ensureAudio();
  if (!setup || setup.quackFallback) {
    playTone(380, 0.1, "triangle", 0.04, 0.74);
    return;
  }
  try {
    setup.quack.pause();
    setup.quack.currentTime = 0.65;
    setup.quack.play().catch(() => {
      setup.quackFallback = true;
      playTone(380, 0.1, "triangle", 0.04, 0.74);
    });
  } catch {
    setup.quackFallback = true;
    playTone(380, 0.1, "triangle", 0.04, 0.74);
  }
}

function footstepInterval(surface, sprinting = false) {
  if (surface === "bridge") return sprinting ? 0.22 : 0.31;
  if (surface === "island") return sprinting ? 0.24 : 0.34;
  return sprinting ? 0.26 : 0.37;
}

function playPaddle(strong = false, speed = 1) {
  const setup = audio;
  if (!setup || setup.ctx.currentTime < setup.swimReadyAt) return;
  setup.swimReadyAt = setup.ctx.currentTime + (strong ? 0.32 : 0.42);
  const speedLift = clamp(speed / 10, 0, 0.45);
  if (playMovementSample("water", {
    gainValue: (strong ? 0.46 : 0.36) + speedLift * 0.053,
    playbackRate: strong ? 1.04 : 0.9 + speedLift * 0.12,
    randomRate: 0.025,
    maxDuration: strong ? 0.92 : 1.08
  })) return;
}

function playFootstep(surface = "land", sprinting = false, speed = 1) {
  const setup = audio;
  if (!setup || setup.ctx.currentTime < setup.footReadyAt) return;
  setup.footReadyAt = setup.ctx.currentTime + footstepInterval(surface, sprinting) * 0.72;
  const loudness = sprinting ? 1.26 : 1;
  const strideRate = sprinting ? 1.12 : 0.94 + clamp(speed / 7, 0, 0.18);
  if (surface === "bridge") {
    if (playMovementSample("bridge", {
      gainValue: 1.44 * loudness,
      playbackRate: strideRate,
      randomRate: 0.035
    })) return;
  }
  if (surface === "island") {
    if (playMovementSample("island", {
      gainValue: 1.6 * loudness,
      playbackRate: strideRate,
      randomRate: 0.04
    })) return;
  }
  if (playMovementSample("land", {
    gainValue: 1.76 * loudness,
    playbackRate: strideRate,
    randomRate: 0.045
  })) return;
  if (surface === "bridge") {
    playNoiseBurst(0.045, 0.019 * loudness, 1180);
    playTone(250 + speed * 9, 0.042, "triangle", 0.022 * loudness, 0.62);
    setTimeout(() => playTone(410, 0.028, "sine", 0.008 * loudness, 0.8), 34);
    return;
  }
  if (surface === "island") {
    playNoiseBurst(0.056, 0.021 * loudness, 640);
    playTone(150, 0.034, "triangle", 0.013 * loudness, 0.64);
    return;
  }
  playNoiseBurst(0.05, 0.017 * loudness, 360);
  playTone(104, 0.035, "triangle", 0.01 * loudness, 0.58);
}

function playSurfaceChange(from, to) {
  const setup = audio;
  if (!setup) return;
  if (from === "water" && to !== "water") {
    playNoiseBurst(0.11, 0.036, 480);
    playTone(132, 0.07, "triangle", 0.024, 0.58);
    return;
  }
  if (from !== "water" && to === "water") {
    playNoiseBurst(0.16, 0.065, 760);
    playTone(178, 0.08, "triangle", 0.048, 0.5);
    setTimeout(() => playNoiseBurst(0.06, 0.022, 1600), 48);
  }
}

function playVisitorChatter(nervous = false) {
  const setup = audio;
  if (!setup || setup.ctx.currentTime < setup.visitorReadyAt) return;
  setup.visitorReadyAt = setup.ctx.currentTime + 1.0;
  playTone(nervous ? 310 : 240, 0.08, "sine", 0.018, nervous ? 1.35 : 1.12);
  setTimeout(() => playTone(nervous ? 360 : 285, 0.06, "sine", 0.012, 0.9), 90);
}

function playVisitorWindup() {
  const setup = audio;
  if (!setup || setup.ctx.currentTime < setup.visitorReadyAt) return;
  setup.visitorReadyAt = setup.ctx.currentTime + 0.55;
  playTone(420, 0.07, "square", 0.018, 1.18);
}

function playVisitorThrow(urgent = false) {
  const setup = audio;
  if (!setup) return;
  playTone(urgent ? 185 : 220, 0.09, "triangle", urgent ? 0.045 : 0.032, 0.62);
}

function playPickup() {
  resumeAudio();
  playNoiseBurst(0.04, 0.56, 1450);
  playTone(520, 0.05, "triangle", 0.32, 1.52);
  setTimeout(() => playTone(910, 0.04, "sine", 0.16, 1.18), 38);
}

function playDrop() {
  resumeAudio();
  playNoiseBurst(0.055, 0.72, 620);
  playTone(180, 0.08, "triangle", 0.52, 0.62);
  setTimeout(() => playNoiseBurst(0.045, 0.3, 1180), 52);
  setTimeout(() => playTone(330, 0.055, "sine", 0.22, 0.72), 68);
}

function playSuccess() {
  resumeAudio();
  playTone(392, 0.09, "sine", 0.06, 1.26);
  setTimeout(() => playTone(523, 0.1, "sine", 0.048, 1.12), 95);
  setTimeout(() => playTone(659, 0.14, "triangle", 0.04, 1.02), 190);
}

function playFailure() {
  resumeAudio();
  playTone(196, 0.16, "sawtooth", 0.045, 0.62);
  setTimeout(() => playNoiseBurst(0.14, 0.03, 260), 80);
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
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Spacebar", "Shift", "Escape", "w", "a", "s", "d", "q", "e"].includes(key)) {
    event.preventDefault();
  }
  if (key === "Escape") {
    showPauseMenu();
    document.exitPointerLock?.();
    return;
  }
  if (state?.paused) return;
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
  if (state?.paused) return;
  requestPointerLockSafely();
});

window.addEventListener("mousemove", (event) => {
  if (state?.paused || document.pointerLockElement !== canvas) return;
  yaw = wrapAngle(yaw - event.movementX * 0.002);
  pitch = clamp(pitch - event.movementY * 0.002, -0.55, 0.35);
});

canvas.addEventListener("pointerdown", (event) => {
  resumeAudio();
  if (state?.paused) return;
  pointer.dragging = true;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});

canvas.addEventListener("pointermove", (event) => {
  if (state?.paused || !pointer.dragging || document.pointerLockElement === canvas) return;
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
ui.resumeButton.addEventListener("click", () => hidePauseMenu(false));
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas && state?.result === "playing" && !state.paused) showPauseMenu();
});
ui.upgradeModal.addEventListener("click", (event) => {
  const button = event.target.closest("[data-upgrade]");
  if (!button) return;
  chooseUpgrade(button.dataset.upgrade);
});

reset();
renderer.setAnimationLoop(loop);
