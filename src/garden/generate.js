// Orchestrates generation in named stages so the browser can paint a progress bar between
// them while tests simply run every stage in one go.
import { VoxelWorld } from '../core/world.js';
import { T } from '../core/palette.js';
import { Rng } from '../core/noise.js';
import { SX, SY, SZ, SEED, WATER_TOP, STREAM } from './layout.js';
import { sculptHeights, carveWater, paintGround, groundAt, gIndex } from './terrain.js';
import { flattenRoute, laySteppingStones, routePolyline, spawnPoint, clearRoute, clearDeckView } from './paths.js';
import { buildStructures } from './structures.js';
import { plantGarden } from './plants.js';

export function createSite(seed = SEED) {
  const world = new VoxelWorld(SX, SY, SZ);
  return {
    seed,
    world,
    claim: (x, z, r) => world.claim(x, z, r),
    rng: new Rng(seed),
    size: { x: SX, y: SY, z: SZ },
    waterTop: new Uint8Array(SX * SZ),
    waterDepth: new Uint8Array(SX * SZ),
    waterSurface: new Uint8Array(SX * SZ),
    ground: new Float32Array(SX * SZ),
    pondMask: new Uint8Array(SX * SZ),
    streamMask: new Uint8Array(SX * SZ),
    basinMask: new Uint8Array(SX * SZ),
    channelMask: new Uint8Array(SX * SZ),
    pathMask: new Uint8Array(SX * SZ),
    wallMask: new Uint8Array(SX * SZ),
    cascadeT: [0.24, 0.5, 0.72],
    cascades: [],
    lanterns: [],
    ripples: [],
    bamboo: [],
    leafSources: [],
    stones: [],
    koi: [],
    waterBody: { x: 64, z: 56, r: 26 }
  };
}

function spawnKoi(site, count = 11) {
  const rng = site.rng;
  for (let k = 0; k < count; k++) {
    for (let tries = 0; tries < 60; tries++) {
      const x = 64 + (rng.float() - 0.5) * 40;
      const z = 56 + (rng.float() - 0.5) * 30;
      const i = gIndex(Math.round(x), Math.round(z));
      if (!site.pondMask[i] || site.waterDepth[i] < 2) continue;
      const top = site.waterTop[i];
      // Stepping stones and shore stones can replace the water column after carving.
      if (site.world.get(Math.round(x), top, Math.round(z)) !== T.WATER) continue;
      site.koi.push({
        x: Math.round(x) + 0.5,
        z: Math.round(z) + 0.5,
        y: top,
        home: { x, z },
        phase: rng.float() * Math.PI * 2,
        speed: 0.5 + rng.float() * 0.8,
        radius: 3 + rng.float() * 6,
        tone: rng.int(0, 2)
      });
      break;
    }
  }
}

/** Ordered generation stages: { label, weight, run }. */
export function gardenStages(site) {
  return [
    {
      label: '地形を鍛造',
      weight: 3,
      run: () => {
        sculptHeights(site);
        flattenRoute(site);
      }
    },
    { label: '池と渓流を掘る', weight: 2, run: () => carveWater(site) },
    { label: '土と苔を敷く', weight: 3, run: () => paintGround(site) },
    { label: '飛石を据える', weight: 1, run: () => laySteppingStones(site) },
    { label: '橋と灯籠を建てる', weight: 2, run: () => buildStructures(site) },
    { label: '木石を植える', weight: 5, run: () => plantGarden(site) },
    { label: '延段を養生する', weight: 1, run: () => { clearRoute(site); clearDeckView(site); } },
    {
      label: '鯉を放つ',
      weight: 1,
      run: () => {
        spawnKoi(site);
        for (const c of site.cascades) {
          site.ripples.push({ x: c.x, y: c.y + 1, z: c.z, period: 1.1, scale: 1.3, phase: 0 });
        }
        site.route = routePolyline(0.6);
        site.spawn = spawnPoint(site);
      }
    }
  ];
}

/** Run every stage immediately (used by node tests and the ?fast path). */
export function generateGarden(seed = SEED) {
  const site = createSite(seed);
  for (const stage of gardenStages(site)) stage.run();
  return site;
}

export { WATER_TOP, STREAM, SX, SY, SZ, groundAt };
