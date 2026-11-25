// Garden plan: every region, the strolling route and the auto tour stops live here so the
// generators, the player spawn and the walkthrough tour all agree on the same geometry.
//
// All coordinates are in WORLD VOXELS. The garden is designed on the old 128-unit grid
// (1 voxel ≈ 0.32 m) and multiplied by RES, so RES=2 makes every block a quarter of the
// footprint at the same physical size. Everything downstream — generators, physics, tour,
// actors — reads these numbers, so RES is the one knob that sets voxel resolution.
import { fbm2 } from '../core/noise.js';

export const RES = 2;

export const SX = 128 * RES;
export const SY = 48 * RES;
export const SZ = 128 * RES;
export const SHORE_BENCH = 12 * RES; // height the banks, terraces and island are shaped to
// Two world voxels (≈0.3 m) above that bench. The flattened bank top sits ~1 voxel over the
// water, so the basin reads as nearly full without the surface spilling onto the shore.
export const WATER_LEVEL = SHORE_BENCH + 2; // top voxel row of the pond/stream surface
export const GROUND = 13 * RES; // nominal top row of the surrounding ground

export const SEED = 20261117;

// Center of the main pond basin (the bay and neck are separate ellipses below).
export const POND = { x: 64 * RES, z: 56 * RES };

/** Pond: main basin + western bay, blended with a little noise for an organic shoreline. */
export function pondField(x, z, seed = SEED) {
  const main = ellipseField(x, z, 64 * RES, 56 * RES, 22 * RES, 15.5 * RES);
  const bay = ellipseField(x, z, 43 * RES, 64 * RES, 11 * RES, 8.5 * RES);
  const neck = ellipseField(x, z, 54 * RES, 60 * RES, 9 * RES, 6.5 * RES);
  let field = Math.max(main, bay, neck);
  if (field > -0.25) field += (fbm2((x * 0.07) / RES, (z * 0.07) / RES, seed + 311) - 0.5) * 0.24;
  return field;
}

export function ellipseField(x, z, cx, cz, rx, ry) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / ry;
  return 1 - Math.hypot(dx, dz);
}

const scalePts = (pts) => pts.map((p) => ({ x: p.x * RES, z: p.z * RES }));

/** Mountain stream: a polyline channel from the northern valley into the pond bay. */
export const STREAM = scalePts([
  { x: 22, z: 12 },
  { x: 25, z: 22 },
  { x: 30, z: 32 },
  { x: 35, z: 43 },
  { x: 39, z: 53 },
  { x: 42, z: 62 }
]);
export const STREAM_WIDTH = 3.4 * RES;

/** Karesansui (dry landscape) — raked sand field with rock groupings. */
export const KARESANSUI = { x0: 96 * RES, z0: 8 * RES, x1: 122 * RES, z1: 40 * RES };

/** Rock triads the sand ripples are drawn around; the rock builder reads the same list. */
export const KARESANSUI_ROCKS = [
  { x: 104, z: 16, r: 2.4 },
  { x: 108, z: 19, r: 1.4 },
  { x: 101, z: 19.5, r: 1.0 },
  { x: 115, z: 28, r: 2.0 },
  { x: 118, z: 31.5, r: 1.2 },
  { x: 104, z: 32, r: 1.7 },
  { x: 112, z: 37, r: 1.1 }
].map((r) => ({ x: r.x * RES, z: r.z * RES, r: r.r * RES }));

/** Pond island (なかのしま) kept above water while the basin is carved. */
export const ISLAND = { x: 71 * RES, z: 46 * RES, r: 5.2 * RES };

/** Entry plaza with the torii, south side. */
export const PLAZA = { x0: 52 * RES, z0: 104 * RES, x1: 78 * RES, z1: 124 * RES };

/** Viewing deck (engawa) on the east side, facing the pond. */
export const DECK = { x0: 104 * RES, z0: 58 * RES, x1: 118 * RES, z1: 74 * RES };

/** Bamboo grove, south east. */
export const BAMBOO = { x0: 98 * RES, z0: 90 * RES, x1: 122 * RES, z1: 120 * RES };

/** Moss-and-pine mound, west side. */
export const MOUND = { cx: 20 * RES, cz: 82 * RES, rx: 15 * RES, rz: 17 * RES, height: 4 * RES };

/** Maple grove north of the pond. */
export const MAPLE_GROVE = { x0: 44 * RES, z0: 18 * RES, x1: 94 * RES, z1: 34 * RES };

/**
 * Strolling route: the circuit the stepping stones follow, the minimap draws, and the
 * walkthrough tour replays. Ordered counter-clockwise from the entrance.
 */
export const ROUTE = scalePts([
  { x: 65, z: 121 },
  { x: 65, z: 112 },
  { x: 61, z: 103 },
  { x: 50, z: 95 },
  { x: 41, z: 88 },
  { x: 33, z: 78 },
  { x: 30, z: 68 },
  { x: 34, z: 54 },
  { x: 38, z: 48 }, // stream crossing (itsutsuhashi) — BRIDGE sits exactly here
  { x: 45, z: 38 },
  { x: 55, z: 30 },
  { x: 68, z: 27 },
  { x: 80, z: 30 },
  { x: 90, z: 36 },
  { x: 95, z: 43 },
  { x: 104, z: 45 }, // looking north into the karesansui
  { x: 114, z: 44 },
  { x: 113, z: 52 },
  { x: 105, z: 57 }, // deck steps
  { x: 103, z: 70 },
  { x: 100, z: 84 },
  { x: 96, z: 96 }, // bamboo path
  { x: 88, z: 106 },
  { x: 76, z: 113 },
  { x: 65, z: 121 }
]);

/** Decorative sawatashi (valley crossings) stepping stones, off the main route. */
export const BRANCHES = [
  { name: 'sawatashi', pts: scalePts([{ x: 33, z: 68 }, { x: 39, z: 70 }, { x: 45, z: 69 }, { x: 50, z: 66 }]) },
  { name: 'island', pts: scalePts([{ x: 60, z: 46 }, { x: 63, z: 43 }]) },
  { name: 'plaza-to-torii', pts: scalePts([{ x: 65, z: 116 }, { x: 65, z: 113 }]) }
];

/** The plank bridge over the stream; ROUTE[8] is exactly on its centre line. */
export const BRIDGE = { x: 38 * RES, z: 48 * RES, half: 6 * RES, width: 2.5 * RES, rail: 3 * RES };

/**
 * Auto walkthrough tour. `via` is the ROUTE index the camera walks through, `view` the
 * point it looks at while the caption is shown.
 */
export const TOUR = [
  {
    via: 1,
    view: { x: 65 * RES, z: 98 * RES },
    title: '総門の鳥居',
    text: '南側の鳥居をくぐると、飛石の延段が庭の奥へと続きます。石は一段ずつ職人が据えた高さで、歩幅が自然と緩やかになるように据えられています。'
  },
  {
    via: 5,
    view: { x: 20 * RES, z: 82 * RES },
    title: '苔庭と雪見灯籠',
    text: '左手は黒松と苔の岡。根元に低く据わった雪見灯籠は、積もった雪を払う形で親しまれています。濡れた苔は雨のあとが最も美しいとされます。'
  },
  {
    via: 8,
    view: { x: 34 * RES, z: 38 * RES },
    title: '渓流と落差',
    text: '北の谷から水を引き、石を組んで三段の落差をつけた渓流です。水音は庭の「声」とされ、静けさを際立たせるための音として設計されました。'
  },
  {
    via: 9,
    view: { x: 38 * RES, z: 48 * RES },
    title: '五橋（いつつのはし）',
    text: '渓流にかかる板橋。平たい板を五つに折れ重ねた形から五橋と呼ばれ、根元には菖蒲や杜若が植わります。'
  },
  {
    via: 11,
    view: { x: 71 * RES, z: 46 * RES },
    title: '池と中之島',
    text: '庭の中心を占める大池と、その上に浮く中之島。島には黒松を植え、向こう岸との間に飛石を渡して「渡れない距離」を演出しています。'
  },
  {
    via: 15,
    view: { x: 108 * RES, z: 20 * RES },
    title: '枯山水の砂紋',
    text: '白砂に熊手で砂紋を描き、石を三尊形式に組んだ枯山水。水を使わず水の流れを現す、庭園表現の究極形とされます。'
  },
  {
    via: 18,
    view: { x: 68 * RES, z: 54 * RES },
    title: '眺めの縁側',
    text: '東側に張り出した見晴らしの床。座して池を借景に眺めるための場所で、庭は「歩いて見せ、座って眺める」二段構えに組み上げられています。'
  },
  {
    via: 21,
    view: { x: 110 * RES, z: 104 * RES },
    title: '竹林の道',
    text: '東南の竹林。風が通ると竹同士がこすれ合い、昼と夜とで異なる音を残します。ここを抜けると出口の鳥居へ戻ります。'
  }
];

/** Arc-length parameter of a ROUTE index, so tour stops survive route edits. */
export function tAtPoint(pts, i) {
  const segs = [];
  let total = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const d = Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z);
    segs.push(d);
    total += d;
  }
  let acc = 0;
  for (let k = 0; k < Math.min(i, segs.length); k++) acc += segs[k];
  return total === 0 ? 0 : acc / total;
}

export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1e-6;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}

export function pointOnPolyline(pts, t) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    segs.push(d);
    total += d;
  }
  let target = t * total;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const k = segs[i] === 0 ? 0 : target / segs[i];
      const a = pts[i];
      const b = pts[i + 1];
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, bearing: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    target -= segs[i];
  }
  const last = pts[pts.length - 1];
  return { x: last.x, z: last.z, bearing: 0 };
}

/** Normalised progress [0,1] of the closest point on a polyline. */
export function progressAlongPolyline(x, z, pts) {
  let best = Infinity;
  let bestT = 0;
  let total = 0;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    segs.push(d);
    total += d;
  }
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1e-6;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      bestT = (acc + t * segs[i]) / (total || 1);
    }
    acc += segs[i];
  }
  return bestT;
}

/** Regions where planting must not happen (paths, sand, deck, water). */
export function isBuiltGround(x, z) {
  if (x >= KARESANSUI.x0 - 1 && x <= KARESANSUI.x1 + 1 && z >= KARESANSUI.z0 - 1 && z <= KARESANSUI.z1 + 1) return true;
  if (x >= DECK.x0 - 2 && x <= DECK.x1 + 1 && z >= DECK.z0 - 2 && z <= DECK.z1 + 1) return true;
  if (x >= PLAZA.x0 - 1 && x <= PLAZA.x1 + 1 && z >= PLAZA.z0 - 1 && z <= PLAZA.z1 + 1) return true;
  return false;
}
