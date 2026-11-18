// Corridor flattening and the stepping-stone route (飛石 / 延段).
// All distances and steps are in world voxels (see layout.js RES).
import { T } from '../core/palette.js';
import { ROUTE, BRANCHES, KARESANSUI, PLAZA, DECK, SX, SZ, RES, BRIDGE, distToPolyline } from './layout.js';
import { groundAt, gIndex } from './terrain.js';
import { hash3, clamp, smoothstep } from '../core/noise.js';

function denseSamples(step = 0.5 * RES) {
  const out = [];
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i];
    const b = ROUTE[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  out.push(ROUTE[ROUTE.length - 1]);
  return out;
}

function nearestSample(samples, x, z) {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < samples.length; i++) {
    const dx = samples[i].x - x;
    const dz = samples[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  return { index: bi, dist: Math.sqrt(best) };
}

/**
 * Level the ground along the route so the circuit stays walkable, and mask it so planting
 * keeps clear. Corridor height comes from a wide average of the base terrain, then blends
 * outwards over 3 voxels.
 */
export function flattenRoute(site) {
  const samples = denseSamples(0.6 * RES);
  const heights = samples.map((s) => {
    let sum = 0;
    let n = 0;
    for (let dz = -2 * RES; dz <= 2 * RES; dz++) {
      for (let dx = -2 * RES; dx <= 2 * RES; dx++) {
        const x = clamp(Math.round(s.x + dx), 0, SX - 1);
        const z = clamp(Math.round(s.z + dz), 0, SZ - 1);
        sum += site.ground[gIndex(x, z)];
        n++;
      }
    }
    return sum / n;
  });

  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const near = nearestSample(samples, x + 0.5, z + 0.5);
      if (near.dist > 3.2 * RES) continue;
      const i = near.index;
      const a = heights[Math.max(0, i - 1)];
      const b = heights[i];
      const c = heights[Math.min(heights.length - 1, i + 1)];
      const target = (a + b * 2 + c) / 4;
      const w = 1 - smoothstep(0.6 * RES, 3.2 * RES, near.dist);
      site.ground[gIndex(x, z)] = site.ground[gIndex(x, z)] * (1 - w * 0.9) + target * (w * 0.9);
      if (near.dist < 2.1 * RES) site.pathMask[gIndex(x, z)] = 1;
    }
  }

  for (const branch of BRANCHES) {
    for (let z = Math.max(0, Math.floor(branch.pts[0].z) - 4 * RES); z < Math.min(SZ, branch.pts[branch.pts.length - 1].z + 5 * RES); z++) {
      for (let x = Math.max(0, Math.floor(Math.min(...branch.pts.map((p) => p.x))) - 4 * RES); x < Math.min(SX, Math.max(...branch.pts.map((p) => p.x)) + 5 * RES); x++) {
        const d = distToBranch(branch.pts, x + 0.5, z + 0.5);
        if (d < 2.0 * RES) site.pathMask[gIndex(x, z)] = 1;
      }
    }
  }
}

function distToBranch(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1e-6;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)));
  }
  return Math.min(best, Math.hypot(x - pts[pts.length - 1].x, z - pts[pts.length - 1].z));
}

function inRect(x, z, r) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/** Lay the irregular stepping stones along the route and the decorative branches. */
export function laySteppingStones(site) {
  const stones = [];
  stones.push(...layLine(site, denseRoutePoints(2.0 * RES), { jitter: 0.35 }));
  for (const branch of BRANCHES) {
    stones.push(...layLine(site, branchSamples(branch.pts, 1.9 * RES), { jitter: 0.25 }));
  }
  site.stones = stones;
  return stones;
}

function denseRoutePoints(step) {
  const pts = [];
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i];
    const b = ROUTE[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  pts.push(ROUTE[ROUTE.length - 1]);
  return pts;
}

function branchSamples(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

function layLine(site, pts, opts) {
  const world = site.world;
  const placed = [];
  let last = null;
  for (let s = 0; s < pts.length; s++) {
    const p = pts[s];
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < 1.7 * RES) continue;
    const ix = Math.round(p.x);
    const iz = Math.round(p.z);
    if (ix < 2 || iz < 2 || ix > SX - 3 || iz > SZ - 3) continue;
    if (inRect(ix, iz, KARESANSUI) || inRect(ix, iz, PLAZA) || inRect(ix, iz, DECK)) continue;
    // The bridge carries its own deck; stones under the arch would crowd the walker's head.
    if (Math.hypot(ix - BRIDGE.x, iz - BRIDGE.z) < BRIDGE.half + 2 * RES) continue;
    last = p;

    const seed = s * 31 + 7;
    const jx = (hash3(seed, 5, 9) - 0.5) * 2 * opts.jitter * RES;
    const jz = (hash3(seed, 13, 21) - 0.5) * 2 * opts.jitter * RES;
    const cx = Math.round(p.x + jx);
    const cz = Math.round(p.z + jz);
    const i = gIndex(cx, cz);
    const radius = (1.0 + hash3(seed, 27, 33) * 0.55) * RES;
    const base = Math.round(site.ground[i]);
    const submerged = site.waterDepth[i] > 0;
    const topRow = submerged ? site.waterTop[i] + 1 : base + 1;
    const floorRow = submerged ? base + 1 : base;

    for (let dz = -2 * RES; dz <= 2 * RES; dz++) {
      for (let dx = -2 * RES; dx <= 2 * RES; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 1 || z < 1 || x > SX - 2 || z > SZ - 2) continue;
        const d = Math.hypot(dx - (hash3(x, 3, z) - 0.5) * 0.5 * RES, dz - (hash3(x, 6, z) - 0.5) * 0.5 * RES);
        if (d > radius) continue;
        for (let y = floorRow; y <= topRow; y++) {
          world.set(x, y, z, y === topRow ? T.STONE : T.STONE_DARK);
        }
        // Keep the moss floor from poking through the stone.
        if (!submerged && site.ground[gIndex(x, z)] < topRow - RES) {
          for (let y = Math.round(site.ground[gIndex(x, z)]) + 1; y < topRow; y++) {
            world.set(x, y, z, T.DIRT);
          }
        }
      }
    }
    placed.push({ x: cx, z: cz, y: topRow });
  }
  return placed;
}

/** Materials that must be cut out of the walking corridor after planting. */
const OBSTRUCTING = new Set([
  T.MAPLE_RED, T.MAPLE_ORANGE, T.MAPLE_GOLD, T.PINE, T.PINE_DARK, T.SHRUB, T.SHRUB_LIGHT,
  T.BAMBOO, T.BAMBOO_LEAF, T.IRIS, T.IRIS_FLOWER, T.REED, T.BARK, T.BARK_DARK, T.LEAF_PILE
]);

/**
 * After planting, prune anything that blocks the walking corridor: leaves, branches, trunks
 * and bamboo within ~2.4 voxels of the route (a walker is 1.24 wide), from just under the
 * moss floor up past head height.
 */
export function clearRoute(site, clearance = 8 * RES, corridor = 2.4 * RES) {
  const pts = routePolyline(0.4 * RES).concat(...BRANCHES.map((b) => branchSamples(b.pts, 0.4 * RES)));
  let cut = 0;
  const reach = Math.ceil(corridor);
  for (const p of pts) {
    const cx = Math.round(p.x);
    const cz = Math.round(p.z);
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 1 || z < 1 || x > SX - 2 || z > SZ - 2) continue;
        if (Math.hypot(dx, dz) > corridor) continue;
        const i = gIndex(x, z);
        if (site.wallMask[i]) continue;
        const base = Math.round(site.ground[i]);
        // Start below the surface: shrub mounds sink into the ground and would otherwise
        // leave a leafy stump for the walker to stand on.
        for (let y = Math.max(0, base - 2 * RES); y <= base + clearance; y++) {
          if (OBSTRUCTING.has(site.world.get(x, y, z))) {
            site.world.set(x, y, z, T.AIR);
            cut++;
          }
        }
      }
    }
  }
  site.clearedVoxels = cut;
  return cut;
}

/** Sampled route for the minimap and the auto tour (dense, in voxel units). */
export function routePolyline(step = 0.6 * RES) {
  return denseRoutePoints(step);
}

/**
 * The engawa exists to sit on and look at the pond. Two passes, both after planting: a low
 * apron is sheared to just below the floor on the deck's open sides, and everything planted
 * inside the sight line from the deck to the pond is taken out at the root so the view of the
 * water is actually open. Runs in the same stage as the route pruning.
 */
export function clearDeckView(site, band = 6 * RES, corridor = 7 * RES) {
  const d = DECK;
  const cx = (d.x0 + d.x1) / 2;
  const cz = (d.z0 + d.z1) / 2;
  const deckY = Math.round(groundAt(site, cx, cz)) + 2 * RES;
  const pond = site.waterBody;
  const sight = [{ x: cx, z: cz }, { x: pond.x, z: pond.z }];
  let cut = 0;
  const cutFrom = (x, z, floor, ceil) => {
    for (let y = floor; y <= ceil; y++) {
      if (OBSTRUCTING.has(site.world.get(x, y, z))) {
        site.world.set(x, y, z, T.AIR);
        cut++;
      }
    }
  };

  for (let z = d.z0 - band; z <= d.z1 + band; z++) {
    for (let x = d.x0 - band; x <= d.x1 + band; x++) {
      if (x < 1 || z < 1 || x > SX - 2 || z > SZ - 2) continue;
      const inside = x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1;
      if (!inside && x > d.x1) continue; // the wall side stays planted
      cutFrom(x, z, inside ? deckY + RES : deckY - RES, site.size.y - 1);
    }
  }

  const x0 = Math.max(1, Math.min(cx, pond.x) - corridor);
  const x1 = Math.min(SX - 2, Math.max(cx, pond.x) + corridor);
  const z0 = Math.max(1, Math.min(cz, pond.z) - corridor - 6 * RES);
  const z1 = Math.min(SZ - 2, Math.max(cz, pond.z) + corridor + 6 * RES);
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) continue;
      if (distToPolyline(x + 0.5, z + 0.5, sight) > corridor) continue;
      // Whole plant, not just the part at eye height: a trunk cut halfway leaves a canopy
      // floating over the pond.
      cutFrom(x, z, Math.round(site.ground[gIndex(x, z)]) + 1, site.size.y - 1);
    }
  }

  site.deckClearedVoxels = cut;
  return cut;
}

/** Where the player starts: just inside the torii, facing north into the garden. */
export function spawnPoint(site) {
  const x = 65 * RES;
  const z = 119 * RES;
  const y = Math.round(groundAt(site, x, z)) + 2 * RES;
  return { x: x + RES / 2, y, z: z + RES / 2, yaw: 0 };
}
