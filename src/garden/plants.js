// Planting and rock work: maples, pruned pines, bamboo, karikomi shrubs, moss, shoreline
// plants and the rock groupings the sand ripples are drawn around.
// World voxels (layout.js RES): every length below is the original design proportion × R,
// so trees keep their physical size while gaining finer voxel detail. Plant COUNTS are
// tied to physical garden area and therefore do not scale with R.
import { T } from '../core/palette.js';
import { hash3, fbm2, clamp } from '../core/noise.js';
import { groundAt, gIndex } from './terrain.js';
import {
  SX, SZ, RES, MAPLE_GROVE, BAMBOO, MOUND, ISLAND, KARESANSUI, KARESANSUI_ROCKS, POND, STREAM,
  STREAM_WIDTH, distToPolyline, isBuiltGround, BRIDGE
} from './layout.js';

const R = RES;
const inRect = (x, z, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

// Stepping stones, flagstones and stone bases are hardscape the walker stands on. A karikomi
// mound whose centre is outside the path corridor still overhangs the paving and used to
// replace those voxels; the corridor pruning pass then cut the foliage out and left the hole
// behind, so planting must never write over them.
const HARDSCAPE = new Set([T.STONE, T.STONE_DARK]);

function setV(site, x, y, z, id) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iz = Math.round(z);
  if (HARDSCAPE.has(site.world.get(ix, iy, iz))) return;
  site.world.set(ix, iy, iz, id);
}

function blob(site, cx, cy, cz, rx, ry, rz, pick, fuzz = 0.28) {
  const x0 = Math.floor(cx - rx - 1);
  const x1 = Math.ceil(cx + rx + 1);
  const y0 = Math.floor(cy - ry - 1);
  const y1 = Math.ceil(cy + ry + 1);
  const z0 = Math.floor(cz - rz - 1);
  const z1 = Math.ceil(cz + rz + 1);
  // fuzz is a jitter in design voxels, so it scales by R, not with the blob radius.
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const j = (hash3(x, y, z) - 0.5) * fuzz * R;
        const d = Math.pow((x - cx) / (rx + j), 2) + Math.pow((y - cy) / (ry + j), 2) + Math.pow((z - cz) / (rz + j), 2);
        if (d > 1) continue;
        const id = pick(x, y, z);
        if (id) setV(site, x, y, z, id);
      }
    }
  }
}

function column(site, x0, y0, z0, x1, y1, z1, id, thick = 1) {
  const steps = Math.max(Math.abs(y1 - y0), 1);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    const z = Math.round(z0 + (z1 - z0) * t);
    for (let dx = 0; dx < thick; dx++) {
      for (let dz = 0; dz < thick; dz++) setV(site, x + dx, y, z + dz, id);
    }
  }
}

export function plantMaple(site, x, z, rng) {
  const base = Math.round(groundAt(site, x, z)) + 1;
  const h = (8 + Math.floor(rng.float() * 5)) * R;
  const leanX = (rng.float() - 0.5) * 2.2 * R;
  const leanZ = (rng.float() - 0.5) * 2.2 * R;
  const warm = rng.float();
  const mix = warm > 0.66 ? [T.MAPLE_RED, T.MAPLE_ORANGE] : warm > 0.33 ? [T.MAPLE_ORANGE, T.MAPLE_GOLD] : [T.MAPLE_RED, T.MAPLE_GOLD];
  column(site, x, base, z, x + leanX, base + h, z + leanZ, T.BARK, R);
  // Two low scaffold branches.
  column(site, x, base + h - 3 * R, z, x + leanX - 2 * R, base + h - R, z + R, T.BARK, R);
  column(site, x, base + h - 2 * R, z, x + leanX + 2 * R, base + h, z - R, T.BARK, R);
  const cx = x + leanX;
  const cz = z + leanZ;
  const pads = 3 + Math.floor(rng.float() * 2);
  for (let p = 0; p < pads; p++) {
    const px = cx + (rng.float() - 0.5) * 4.2 * R;
    const pz = cz + (rng.float() - 0.5) * 4.2 * R;
    const py = base + h + rng.float() * 2.4 * R;
    const rx = (2.4 + rng.float() * 1.5) * R;
    blob(site, px, py, pz, rx, (1.9 + rng.float() * 0.8) * R, rx, (ix, iy, iz) => {
      const up = iy > py + 0.6 * R;
      const r = hash3(ix, iy, iz);
      if (up && r > 0.55) return mix[1];
      return mix[r > 0.75 ? 1 : 0];
    }, 0.42);
  }
  site.leafSources.push({ x, z, y: base + h });
  return { r: 4.6 * R, footprint: 1.4 * R };
}

export function plantPine(site, x, z, rng) {
  const base = Math.round(groundAt(site, x, z)) + 1;
  const h = (6 + Math.floor(rng.float() * 6)) * R;
  const leanX = (rng.float() - 0.5) * 3.2 * R;
  const leanZ = (rng.float() - 0.5) * 3.2 * R;
  column(site, x, base, z, x + leanX, base + h, z + leanZ, T.BARK_DARK, R);
  const pads = 3 + Math.floor(rng.float() * 3);
  for (let p = 0; p < pads; p++) {
    const t = 0.45 + (p / pads) * 0.62;
    const px = x + leanX * t + (rng.float() - 0.5) * 2.4 * R;
    const pz = z + leanZ * t + (rng.float() - 0.5) * 2.4 * R;
    const py = base + Math.max(5 * R, Math.round(h * t));
    const rx = (1.8 + rng.float() * 1.8 - p * 0.18) * R;
    blob(site, px, py, pz, Math.max(1.3 * R, rx), 0.9 * R, Math.max(1.3 * R, rx), (ix, iy, iz) => {
      const r = hash3(ix, iy, iz);
      if (iy < py - 0.3 * R && r > 0.4) return T.PINE_DARK;
      return r > 0.82 ? T.PINE_DARK : T.PINE;
    }, 0.4);
  }
  return { r: 3.4 * R, footprint: 1.2 * R };
}

export function plantBamboo(site, x, z, rng) {
  const base = Math.round(groundAt(site, x, z)) + 1;
  const h = (15 + Math.floor(rng.float() * 9)) * R;
  const leanX = (rng.float() - 0.5) * 2.4 * R;
  const leanZ = (rng.float() - 0.5) * 2.4 * R;
  column(site, x, base, z, x + leanX, base + h, z + leanZ, T.BAMBOO, R);
  for (let node = 3 * R; node < h; node += 4 * R) {
    const t = node / h;
    const nx = Math.round(x + leanX * t);
    const nz = Math.round(z + leanZ * t);
    const ny = base + node;
    setV(site, nx + R, ny, nz, T.BAMBOO_LEAF);
    setV(site, nx - R, ny + R, nz, T.BAMBOO_LEAF);
    setV(site, nx, ny + R, nz + R, T.BAMBOO_LEAF);
    setV(site, nx, ny + R, nz - R, T.BAMBOO_LEAF);
  }
  blob(site, x + leanX, base + h + 0.6 * R, z + leanZ, 1.8 * R, 1.6 * R, 1.8 * R, () => T.BAMBOO_LEAF, 0.55);
  site.bamboo.push({ x, z, y: base + h });
  return { r: 1.1 * R, footprint: 0.9 * R };
}

export function plantKarikomi(site, x, z, rng) {
  const base = Math.round(groundAt(site, x, z));
  const r = (1.4 + rng.float() * 1.8) * R;
  blob(site, x, base + r * 0.5, z, r, r * 0.62, r, (ix, iy, iz) => {
    const up = iy > base + r * 0.55;
    const rr = hash3(ix, iy, iz);
    return up && rr > 0.45 ? T.SHRUB_LIGHT : T.SHRUB;
  }, 0.3);
  return { r: r + 0.6 * R, footprint: r };
}

export function plantIris(site, x, z, rng) {
  const base = Math.round(groundAt(site, x, z)) + 1;
  const n = 3 + Math.floor(rng.float() * 4);
  for (let i = 0; i < n; i++) {
    const bx = Math.round(x + (rng.float() - 0.5) * 1.6 * R);
    const bz = Math.round(z + (rng.float() - 0.5) * 1.6 * R);
    const h = (1 + Math.floor(rng.float() * 2)) * R;
    for (let y = base; y < base + h; y++) setV(site, bx, y, bz, T.IRIS);
    if (i === 0) setV(site, bx, base + h, bz, T.IRIS_FLOWER);
  }
  return { r: 1.2 * R, footprint: 1.0 * R };
}

export function plantReeds(site, x, z, rng) {
  const base = Math.round(groundAt(site, x, z)) + 1;
  const n = 4 + Math.floor(rng.float() * 5);
  for (let i = 0; i < n; i++) {
    const bx = Math.round(x + (rng.float() - 0.5) * 2 * R);
    const bz = Math.round(z + (rng.float() - 0.5) * 2 * R);
    const h = (2 + Math.floor(rng.float() * 3)) * R;
    for (let y = base; y < base + h; y++) setV(site, bx, y, bz, T.REED);
  }
  return { r: 1.4 * R, footprint: 1.2 * R };
}

export function paintMoss(site, x, z, rng) {
  const world = site.world;
  const r = (1.6 + rng.float() * 3.2) * R;
  const reach = Math.ceil(r);
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const px = Math.round(x + dx);
      const pz = Math.round(z + dz);
      if (px < 1 || pz < 1 || px >= SX - 1 || pz >= SZ - 1) continue;
      if (Math.hypot(dx, dz) > r) continue;
      const i = gIndex(px, pz);
      if (site.pathMask[i] || site.pondMask[i] || site.streamMask[i]) continue;
      const top = Math.round(site.ground[i]);
      const existing = world.get(px, top, pz);
      if (existing !== T.GRASS && existing !== T.MOSS && existing !== T.DIRT && existing !== T.MOSS_LIGHT) continue;
      world.set(px, top, pz, hash3(px, 41, pz) > 0.72 ? T.MOSS_LIGHT : T.MOSS);
      if (hash3(px, 43, pz) > 0.9) setV(site, px, top + 1, pz, T.MOSS);
    }
  }
  return { r: r + 0.4 * R, footprint: r };
}

export function buildBoulder(site, x, z, r, rng) {
  const base = Math.round(groundAt(site, x, z));
  const ry = r * (0.7 + rng.float() * 0.4);
  blob(site, x, base + ry * 0.45, z, r, ry, r * (0.8 + rng.float() * 0.4), (ix, iy, iz) => {
    const rr = hash3(ix, iy, iz);
    if (iy > base + ry * 0.8 && rr > 0.5) return T.MOSS_ROCK;
    if (iy < base - 0.2 * R && rr > 0.35) return T.ROCK_DARK;
    return rr > 0.7 ? T.ROCK_DARK : T.ROCK;
  }, 0.34);
  return { r: r + 0.5 * R, footprint: r };
}

/** Rocks that anchor the karesansui, the stream bed and the pond shore. */
export function placeRocks(site, rng) {
  for (const r of KARESANSUI_ROCKS) {
    buildBoulder(site, r.x, r.z, r.r * 1.15, rng);
    site.claim(r.x, r.z, r.r + 1.4 * R);
  }
  // Stream: bank stones plus stepping stones across the channel (tobi-ishi).
  for (let t = 0.06; t < 0.94; t += 0.055) {
    const idx = Math.min(STREAM.length - 2, Math.floor(t * (STREAM.length - 1)));
    const a = STREAM[idx];
    const b = STREAM[idx + 1];
    const px = a.x + (b.x - a.x) * (t * (STREAM.length - 1) - idx);
    const pz = a.z + (b.z - a.z) * (t * (STREAM.length - 1) - idx);
    const nx = -(b.z - a.z);
    const nz = b.x - a.x;
    const nl = Math.hypot(nx, nz) || 1;
    for (const side of [-1, 1]) {
      if (!rng.chance(0.75)) continue;
      const off = (STREAM_WIDTH - 0.4 * R) * side;
      const bx = Math.round(px + (nx / nl) * off);
      const bz = Math.round(pz + (nz / nl) * off);
      // Keep the bridge approach clear of boulders.
      if (Math.hypot(bx - BRIDGE.x, bz - BRIDGE.z) < 9 * R) continue;
      buildBoulder(site, bx, bz, (0.8 + rng.float() * 0.8) * R, rng);
    }
  }
  for (const c of site.cascades) {
    buildBoulder(site, Math.round(c.x) - 2 * R, Math.round(c.z), 1.5 * R, rng);
    buildBoulder(site, Math.round(c.x) + 2 * R, Math.round(c.z) + R, 1.3 * R, rng);
  }
  // Pond shore: occasional stones following the outline.
  for (let a = 0; a < Math.PI * 2; a += 0.16) {
    if (!rng.chance(0.3)) continue;
    const x = Math.round(POND.x + Math.cos(a) * 23.5 * R);
    const z = Math.round(POND.z + Math.sin(a) * 17 * R);
    if (x < 4 || z < 4 || x > SX - 5 || z > SZ - 5) continue;
    if (isBuiltGround(x, z)) continue;
    if (site.world.isSolid(x, Math.round(groundAt(site, x, z)) + 1, z)) continue;
    if (site.claim(x, z, 1.6 * R)) buildBoulder(site, x, z, (0.9 + rng.float() * 1.3) * R, rng);
  }
}

function canPlant(site, x, z) {
  if (x < 5 * R || z < 5 * R || x > SX - 6 * R || z > SZ - 6 * R) return false;
  const i = gIndex(x, z);
  if (site.pondMask[i] || site.streamMask[i] || site.pathMask[i]) return false;
  if (isBuiltGround(x, z)) return false;
  if (site.wallMask[i]) return false;
  const gx = groundAt(site, x + 1, z) - groundAt(site, x - 1, z);
  const gz = groundAt(site, x, z + 1) - groundAt(site, x, z - 1);
  if (Math.hypot(gx, gz) > 1.9) return false;
  return true;
}

function pickPlant(site, x, z, rng) {
  const inGrove = inRect(x, z, MAPLE_GROVE);
  const inBamboo = inRect(x, z, BAMBOO);
  const dm = Math.hypot((x - MOUND.cx) / MOUND.rx, (z - MOUND.cz) / MOUND.rz);
  const valley = x < 48 * R && z < 46 * R;
  const shore = nearestWaterDistance(site, x, z) < 4.5 * R;
  const r = rng.float();
  if (inBamboo) return r < 0.72 ? 'bamboo' : r < 0.88 ? 'shrub' : 'moss';
  if (inGrove) return r < 0.62 ? 'maple' : r < 0.78 ? 'shrub' : r < 0.9 ? 'pine' : 'moss';
  if (shore) return r < 0.3 ? 'iris' : r < 0.55 ? 'reed' : r < 0.75 ? 'moss' : 'shrub';
  if (dm < 1) return r < 0.4 ? 'pine' : r < 0.62 ? 'moss' : r < 0.82 ? 'shrub' : 'maple';
  if (valley) return r < 0.42 ? 'pine' : r < 0.72 ? 'moss' : 'shrub';
  return r < 0.3 ? 'shrub' : r < 0.5 ? 'moss' : r < 0.68 ? 'pine' : r < 0.84 ? 'maple' : 'bamboo';
}

function nearestWaterDistance(site, x, z) {
  let best = 99;
  const reach = 5 * R;
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const i = gIndex(clamp(x + dx, 0, SX - 1), clamp(z + dz, 0, SZ - 1));
      if (site.pondMask[i] || site.streamMask[i]) best = Math.min(best, Math.hypot(dx, dz));
    }
  }
  return best;
}

export function plantGarden(site) {
  const rng = site.rng;
  // Island pine first so nothing else takes the space.
  site.claim(ISLAND.x, ISLAND.z, 4.2 * R);
  plantPine(site, ISLAND.x, ISLAND.z, rng);
  plantKarikomi(site, ISLAND.x - 2 * R, ISLAND.z + 2 * R, rng);

  placeRocks(site, rng);

  const counts = {};
  for (let z = 6 * R; z < SZ - 6 * R; z += 3 * R) {
    for (let x = 6 * R; x < SX - 6 * R; x += 3 * R) {
      const px = Math.round(x + (hash3(x, 71, z) - 0.5) * 2.6 * R);
      const pz = Math.round(z + (hash3(x, 89, z) - 0.5) * 2.6 * R);
      if (!canPlant(site, px, pz)) continue;
      const density = fbm2((px * 0.05) / R, (pz * 0.05) / R, 4242, 3);
      if (density < 0.33) continue;
      const kind = pickPlant(site, px, pz, rng);
      if (kind === 'moss' && !site.claim(px, pz, 1.2 * R)) continue;
      if (kind !== 'moss' && !site.claim(px, pz, (kind === 'shrub' ? 1.6 : 2.1) * R)) continue;
      let res;
      if (kind === 'maple') res = plantMaple(site, px, pz, rng);
      else if (kind === 'pine') res = plantPine(site, px, pz, rng);
      else if (kind === 'bamboo') res = plantBamboo(site, px, pz, rng);
      else if (kind === 'shrub') res = plantKarikomi(site, px, pz, rng);
      else if (kind === 'iris') res = plantIris(site, px, pz, rng);
      else if (kind === 'reed') res = plantReeds(site, px, pz, rng);
      else res = paintMoss(site, px, pz, rng);
      counts[kind] = (counts[kind] || 0) + 1;
    }
  }

  // Bamboo grove gets a dense extra pass so it reads as a thicket.
  for (let k = 0; k < 150; k++) {
    const x = Math.round(BAMBOO.x0 + rng.float() * (BAMBOO.x1 - BAMBOO.x0));
    const z = Math.round(BAMBOO.z0 + rng.float() * (BAMBOO.z1 - BAMBOO.z0));
    if (!canPlant(site, x, z)) continue;
    if (!site.claim(x, z, 0.9 * R)) continue;
    plantBamboo(site, x, z, rng);
    counts.bamboo = (counts.bamboo || 0) + 1;
  }

  // Leaf litter under the maples.
  for (const src of site.leafSources) {
    for (let k = 0; k < 26; k++) {
      const x = Math.round(src.x + (rng.float() - 0.5) * 8 * R);
      const z = Math.round(src.z + (rng.float() - 0.5) * 8 * R);
      if (x < 1 || z < 1 || x >= SX - 1 || z >= SZ - 1) continue;
      const i = gIndex(x, z);
      if (site.pathMask[i] || site.pondMask[i] || site.streamMask[i]) continue;
      const top = Math.round(site.ground[i]);
      const cur = site.world.get(x, top, z);
      if (cur === T.GRASS || cur === T.MOSS || cur === T.MOSS_LIGHT) {
        site.world.set(x, top, z, hash3(x, 61, z) > 0.55 ? T.LEAF_PILE : T.MOSS);
      }
    }
  }

  site.plantCounts = counts;
  return counts;
}
