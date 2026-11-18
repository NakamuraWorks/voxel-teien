// Ground sculpting: base undulation, pond + stream carving, shore banks, sand terrace,
// plaza paving and the final soil/grass/moss painting of every column.
import { T } from '../core/palette.js';
import { fbm2, noise2, clamp, smoothstep, lerp, hash3 } from '../core/noise.js';
import {
  SX, SZ, RES, WATER_TOP, GROUND, SEED, POND, pondField, STREAM, STREAM_WIDTH, distToPolyline,
  progressAlongPolyline, KARESANSUI, KARESANSUI_ROCKS, PLAZA, DECK, MOUND, ISLAND
} from './layout.js';

export function gIndex(x, z) {
  return z * SX + x;
}

/** Bilinear sample of the ground height map, used to seat props and trees. */
export function groundAt(site, x, z) {
  const fx = clamp(x, 0, SX - 1.001);
  const fz = clamp(z, 0, SZ - 1.001);
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = fx - x0;
  const tz = fz - z0;
  const g = site.ground;
  const a = g[gIndex(x0, z0)];
  const b = g[gIndex(x0 + 1, z0)];
  const c = g[gIndex(x0, z0 + 1)];
  const d = g[gIndex(x0 + 1, z0 + 1)];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

export function heightFromPlan(x, z) {
  // Noise frequencies are divided by RES so features keep their physical size while the
  // voxel grid sampling them gets finer.
  const undulate = (fbm2((x * 0.035) / RES, (z * 0.035) / RES, SEED, 4) - 0.5) * 3.4 * RES
    + (fbm2((x * 0.11) / RES, (z * 0.11) / RES, SEED + 91, 2) - 0.5) * 1.1 * RES;
  const northRise = smoothstep(80 * RES, 6 * RES, z) * 4.2 * RES;
  const mdx = (x - MOUND.cx) / MOUND.rx;
  const mdz = (z - MOUND.cz) / MOUND.rz;
  const md = Math.hypot(mdx, mdz);
  const mound = md < 1 ? MOUND.height * Math.pow(Math.cos((md * Math.PI) / 2), 1.6) : 0;
  const westRise = smoothstep(58 * RES, 4 * RES, x) * 1.2 * RES;
  return GROUND + undulate + northRise + mound + westRise;
}

function rectWeight(x, z, rect, margin) {
  const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
  const dz = Math.max(rect.z0 - z, 0, z - rect.z1);
  const d = Math.hypot(dx, dz);
  return 1 - smoothstep(0, margin, d);
}

/** Stream water surface rises toward the north so the water visibly falls toward the pond. */
export function streamSurface(t) {
  return WATER_TOP + RES * (3.4 * (1 - t) + 0.6 * (1 - t) * (1 - t));
}

export function sculptHeights(site) {
  const rng = site.rng;
  const pondCenter = { x: POND.x, z: POND.z };
  const kasaTarget = heightFromPlan((KARESANSUI.x0 + KARESANSUI.x1) / 2, (KARESANSUI.z0 + KARESANSUI.z1) / 2);
  const plazaTarget = heightFromPlan((PLAZA.x0 + PLAZA.x1) / 2, (PLAZA.z0 + PLAZA.z1) / 2);
  const deckTarget = heightFromPlan((DECK.x0 + DECK.x1) / 2, (DECK.z0 + DECK.z1) / 2);
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      let h = heightFromPlan(x, z);
      // Bank flattening so the pond sits in a believable basin.
      const field = pondField(x, z);
      if (field < 0.02) {
        const shore = 1 - smoothstep(0, 8, -field);
        h = lerp(h, WATER_TOP + 1.6 * RES, shore * 0.85);
      }
      const dk = Math.hypot(x - pondCenter.x, z - pondCenter.z);
      if (dk < 34 * RES) h = lerp(h, WATER_TOP + 1.6 * RES, (1 - smoothstep(16 * RES, 34 * RES, dk)) * 0.5);
      // Terraces.
      h = lerp(h, Math.round(kasaTarget), rectWeight(x, z, KARESANSUI, 7 * RES) * 0.95);
      h = lerp(h, Math.round(plazaTarget), rectWeight(x, z, PLAZA, 5 * RES) * 0.95);
      h = lerp(h, Math.round(deckTarget), rectWeight(x, z, DECK, 5 * RES) * 0.9);
      // Micro texture everywhere else.
      h += (noise2((x * 0.28) / RES, (z * 0.28) / RES, SEED + 7) - 0.5) * 0.5 * RES;
      site.ground[gIndex(x, z)] = h;
    }
  }
  // Two smoothing passes so nothing is blocky before water carving.
  smoothHeights(site, 2);
}

export function smoothHeights(site, iterations = 1) {
  const g = site.ground;
  const tmp = new Float32Array(g.length);
  const rad = RES; // physical smoothing radius, in world voxels
  for (let k = 0; k < iterations; k++) {
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        let sum = 0;
        let n = 0;
        for (let dz = -rad; dz <= rad; dz++) {
          for (let dx = -rad; dx <= rad; dx++) {
            const xx = clamp(x + dx, 0, SX - 1);
            const zz = clamp(z + dz, 0, SZ - 1);
            const a = Math.abs(dx);
            const b = Math.abs(dz);
            const w = Math.max(1, 3 - Math.max(a, b));
            sum += g[gIndex(xx, zz)] * w;
            n += w;
          }
        }
        tmp[gIndex(x, z)] = sum / n;
      }
    }
    g.set(tmp);
  }
}

/** Carve the pond basin and the mountain stream, then register koi / cascade anchors. */
export function carveWater(site) {
  const g = site.ground;
  const world = site.world;
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const i = gIndex(x, z);
      const field = pondField(x, z);
      if (field > 0) {
        let floor = WATER_TOP - RES * (0.6 + 4.6 * smoothstep(0, 0.34, field));
        const idx = Math.hypot(x - ISLAND.x, z - ISLAND.z);
        if (idx < ISLAND.r) {
          const cap = WATER_TOP + RES * (2.2 + 1.8 * Math.cos((idx / ISLAND.r) * (Math.PI / 2)));
          floor = Math.max(floor, cap);
        } else if (idx < ISLAND.r + 1.6 * RES) {
          floor = Math.max(floor, WATER_TOP + 1.4 * RES);
        }
        g[i] = floor;
        site.basinMask[i] = 1;
      }
      const ds = distToPolyline(x, z, STREAM);
      if (ds < STREAM_WIDTH) {
        const t = progressAlongPolyline(x, z, STREAM);
        const surf = streamSurface(t);
        const core = 1 - ds / STREAM_WIDTH;
        let floor = surf - RES * (1.1 + 1.9 * core);
        for (const step of site.cascadeT) {
          if (Math.abs(t - step) < 0.018) floor -= 1.2 * RES;
        }
        if (floor < g[i]) {
          g[i] = floor;
          site.channelMask[i] = 1;
          site.waterSurface[i] = Math.round(surf);
        }
      }
    }
  }

  // Fill water columns.
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const i = gIndex(x, z);
      const isBasin = site.basinMask[i] === 1;
      const isStream = site.channelMask[i] === 1;
      if (!isBasin && !isStream) continue;
      const top = isStream && isBasin === 0 ? site.waterSurface[i] : WATER_TOP;
      const floor = Math.round(g[i]);
      let placed = 0;
      for (let y = floor + 1; y <= top; y++) {
        if (world.set(x, y, z, T.WATER)) placed++;
      }
      if (!placed) continue;
      site.waterTop[i] = top;
      site.waterDepth[i] = top - floor;
      if (isBasin) site.pondMask[i] = 1;
      else site.streamMask[i] = 1;
    }
  }

  // Cascade anchors (used for sound + surface ripples and stream stones).
  for (const step of site.cascadeT) {
    const idx = Math.round(step * (STREAM.length - 1));
    const a = STREAM[clamp(idx, 0, STREAM.length - 1)];
    site.cascades.push({ x: a.x, z: a.z, y: Math.round(streamSurface(step)) });
  }
}

/** Paint soil, grass, moss, sand and paving from the height map. */
export function paintGround(site) {
  const world = site.world;
  const g = site.ground;
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const i = gIndex(x, z);
      const top = Math.round(g[i]);
      const isWater = site.pondMask[i] === 1 || site.streamMask[i] === 1;
      const field = pondField(x, z);
      const inKasa = x >= KARESANSUI.x0 && x <= KARESANSUI.x1 && z >= KARESANSUI.z0 && z <= KARESANSUI.z1;
      const inPlaza = x >= PLAZA.x0 && x <= PLAZA.x1 && z >= PLAZA.z0 && z <= PLAZA.z1;
      const inDeck = x >= DECK.x0 - 1 && x <= DECK.x1 && z >= DECK.z0 - 1 && z <= DECK.z1;

      for (let y = 0; y <= top; y++) {
        let id;
        if (y === top) id = T.DIRT;
        else if (y > top - 3 * RES) id = T.DIRT;
        else id = T.ROCK_DARK;

        if (isWater) {
          id = y > top - 2 * RES ? T.MUD : T.DIRT;
        } else if (inKasa) {
          id = y === top ? sandTop(x, z) : y > top - 3 * RES ? T.SAND : T.DIRT;
        } else if (inPlaza && y === top) {
          id = pavingTop(site, x, z);
        } else if (inDeck && y === top) {
          id = T.GRAVEL;
        } else if (y === top) {
          const shoreBand = field > -0.22 && field < 0.02;
          const slope = groundSlope(site, x, z);
          if (shoreBand) {
            id = hash3(x, 1, z) > 0.55 ? T.SAND : T.GRAVEL;
          } else if (slope > 1.15) {
            id = hash3(x, 2, z) > 0.7 ? T.GRAVEL : T.DIRT;
          } else if (site.pathMask[i]) {
            // The corridor between the stepping stones is kept as moss.
            id = hash3(x, 4, z) > 0.82 ? T.MOSS_LIGHT : T.MOSS;
          } else {
            const moss = fbm2(x * 0.06, z * 0.06, SEED + 45, 3);
            id = moss > 0.56 ? T.MOSS : moss > 0.42 ? T.GRASS : hash3(x, 3, z) > 0.88 ? T.MOSS_LIGHT : T.GRASS;
          }
        }
        world.set(x, y, z, id);
      }
    }
  }
}

export function sandTop(x, z) {
  let d = Infinity;
  for (const r of KARESANSUI_ROCKS) {
    const dd = Math.hypot(x - r.x, z - r.z) - r.r;
    if (dd < d) d = dd;
  }
  // Frequencies divided by RES so the ripples keep their physical size at finer resolution.
  const ring = d < 9.5 * RES ? Math.sin((d + RES) * (1.85 / RES)) : Math.sin((z * 1.6) / RES + Math.sin((x * 0.18) / RES) * 1.4);
  return ring > 0.25 ? T.SAND : T.SAND_RIDGE;
}

function groundSlope(site, x, z) {
  const gx = groundAt(site, x + 1, z) - groundAt(site, x - 1, z);
  const gz = groundAt(site, x, z + 1) - groundAt(site, x, z - 1);
  return Math.hypot(gx, gz);
}

/** Soto-zumi style irregular flagstones with mossy joints. */
function pavingTop(site, x, z) {
  const cell = 3.4 * RES;
  const cx = Math.floor(x / cell);
  const cz = Math.floor(z / cell);
  const jx = (hash3(cx, 11, cz) - 0.5) * cell * 0.55;
  const jz = (hash3(cx, 23, cz) - 0.5) * cell * 0.55;
  const px = x - (cx + 0.5) * cell - jx;
  const pz = z - (cz + 0.5) * cell - jz;
  const d = Math.max(Math.abs(px), Math.abs(pz)) / (cell * 0.5);
  if (d > 0.82) return hash3(cx, cz, 5) > 0.6 ? T.MOSS : T.GRAVEL;
  const r = hash3(x, 7, z);
  return r > 0.86 ? T.STONE_DARK : T.STONE;
}
