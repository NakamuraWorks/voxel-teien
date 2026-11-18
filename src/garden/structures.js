// Built elements: perimeter wall and hedge, torii, stone lanterns, tsukubai, the plank
// bridge over the stream, the viewing deck and bamboo fences.
// All coordinates are world voxels (layout.js RES); proportions follow the original
// 128-unit design grid and are multiplied by R so physical sizes survive the finer grid.
import { T } from '../core/palette.js';
import { groundAt, gIndex } from './terrain.js';
import { SX, SZ, RES, DECK, BAMBOO, STREAM, STREAM_WIDTH, ROUTE, BRIDGE } from './layout.js';
import { hash3, clamp } from '../core/noise.js';

const R = RES;
const setV = (site, x, y, z, id) => site.world.set(Math.round(x), Math.round(y), Math.round(z), id);
const box = (site, x0, x1, y0, y1, z0, z1, id) => site.world.fill(x0, x1, y0, y1, z0, z1, id);
const surface = (site, x, z) => Math.round(groundAt(site, x, z)) + 1;

function claimAll(site, x, z, r) {
  site.claim(Math.round(x), Math.round(z), Math.max(R, Math.ceil(r)));
}

function addLantern(site, x, y, z, radius = 7 * R) {
  site.lanterns.push({ x, y, z, radius });
}

function addRipple(site, x, y, z, period = 2.6, scale = 1) {
  site.ripples.push({ x, y, z, period, scale, phase: hash3(x, 9, z) });
}

/** Earthen wall with a tiled cap around the whole precinct, plus a hedge at its foot. */
export function buildPerimeter(site) {
  const rng = site.rng;
  const band = 3 * R;
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const edge = Math.min(x, z, SX - 1 - x, SZ - 1 - z);
      if (edge > band + 3 * R) continue;
      if (edge <= band) {
        const i = gIndex(x, z);
        site.wallMask[i] = 1;
        const base = surface(site, x, z);
        const top = base + 8 * R - (edge === band ? R : 0);
        box(site, x, x, base - 2 * R, top, z, z, T.WALL_EARTH);
        box(site, x, x, top + 1, top + 1, z, z, T.SHINGLE);
      } else {
        // Hedge just inside the wall.
        const i = gIndex(x, z);
        if (site.pondMask[i] || site.streamMask[i] || site.pathMask[i]) continue;
        if (x >= 59 * R && x <= 71 * R && z >= SZ - 8 * R) continue; // keep the gate lane clear
        if (hash3(x, 77, z) > 0.45) {
          const base = surface(site, x, z);
          const h = (2 + (hash3(x, 79, z) > 0.7 ? 1 : 0)) * R;
          box(site, x, x, base, base + h, z, z, hash3(x, 81, z) > 0.8 ? T.SHRUB_LIGHT : T.SHRUB);
        }
      }
    }
  }
  // South gate opening on the approach axis.
  for (let z = SZ - band - 1; z < SZ; z++) {
    for (let x = 60 * R; x <= 70 * R; x++) {
      site.wallMask[gIndex(x, z)] = 0;
      site.world.fill(x, x, 0, site.size.y, z, z, T.AIR);
      const ground = Math.round(site.ground[gIndex(x, z)]);
      for (let y = 0; y <= ground; y++) site.world.set(x, y, z, y === ground ? T.STONE : T.DIRT);
    }
  }
}

/** Myojin-style torii. Posts sit on the ground, the lintel curves up at the ends. */
export function buildTorii(site, cx, cz, halfSpan = 5 * R) {
  const base = surface(site, cx, cz);
  const postH = 10 * R;
  for (const side of [-1, 1]) {
    const px = cx + side * halfSpan;
    box(site, px - R, px, base, base + postH, cz - R, cz, T.TORII_RED);
    box(site, px - R, px, base - 1, base - 1, cz - R, cz, T.STONE_DARK); // kamebara
    // Slight inward lean is lost in voxel form; add a ring instead.
    box(site, px - R, px, base + 3 * R, base + 3 * R, cz - R, cz, T.TORII_DARK);
  }
  // Nuki (tie beam) and gakuzuka.
  box(site, cx - halfSpan - R, cx + halfSpan + R, base + 7 * R, base + 7 * R, cz, cz, T.TORII_RED);
  box(site, cx, cx, base + 8 * R, base + 9 * R, cz, cz, T.TORII_RED);
  // Kasagi with an upward sweep, capped by black shimaki.
  for (let dx = -halfSpan - 2 * R; dx <= halfSpan + 2 * R; dx++) {
    const sweep = Math.round(Math.pow(Math.abs(dx) / (halfSpan + 2 * R), 2) * 1.6 * R);
    const y = base + postH + R + sweep;
    box(site, cx + dx, cx + dx, y, y, cz - 2 * R, cz + R, T.TORII_RED);
    box(site, cx + dx, cx + dx, y + 1, y + 1, cz - 2 * R, cz + R, T.TORII_DARK);
  }
  box(site, cx - R, cx + R, base + postH + 2 * R, base + postH + 2 * R, cz - R, cz, T.TORII_WHITE);
  claimAll(site, cx, cz, halfSpan + 3 * R);
  return { x: cx, z: cz, y: base };
}

/** Oshi-doro: the tall four-sided stone lantern. */
export function buildTallLantern(site, cx, cz) {
  const base = surface(site, cx, cz);
  box(site, cx - R, cx + R, base, base, cz - R, cz + R, T.STONE_DARK);
  box(site, cx, cx, base + R, base + 3 * R, cz, cz, T.LANTERN_STONE); // kiso + sao
  box(site, cx - R, cx + R, base + 4 * R, base + 4 * R, cz - R, cz + R, T.LANTERN_STONE); // chibana
  // Hibukuro: hollow box with a fire inside.
  box(site, cx - R, cx + R, base + 5 * R, base + 6 * R, cz - R, cz + R, T.LANTERN_STONE);
  box(site, cx - R + 1, cx + R - 1, base + 5 * R, base + 6 * R - 1, cz - R + 1, cz + R - 1, T.AIR);
  box(site, cx - 1, cx, base + 5 * R, base + 6 * R - 2, cz - 1, cz, T.LANTERN_FIRE);
  // Kasa (roof) with upturned corners.
  box(site, cx - 2 * R, cx + 2 * R, base + 7 * R, base + 7 * R, cz - 2 * R, cz + 2 * R, T.LANTERN_STONE);
  box(site, cx - R, cx + R, base + 8 * R, base + 8 * R, cz - R, cz + R, T.LANTERN_STONE);
  setV(site, cx, base + 9 * R, cz, T.LANTERN_STONE);
  addLantern(site, cx, base + 6 * R, cz, 9 * R);
  claimAll(site, cx, cz, 2.4 * R);
  return { x: cx, z: cz, y: base };
}

/** Yukimi-doro: the low lantern with a wide hat, set near the water. */
export function buildYukimiDoro(site, cx, cz) {
  const base = surface(site, cx, cz);
  box(site, cx - R, cx + R, base, base, cz - R, cz + R, T.STONE_DARK);
  box(site, cx, cx, base + R, base + 2 * R, cz, cz, T.LANTERN_STONE);
  box(site, cx - R, cx + R, base + 3 * R, base + 3 * R, cz - R, cz + R, T.LANTERN_STONE);
  box(site, cx - R, cx + R, base + 4 * R, base + 4 * R, cz - R, cz + R, T.LANTERN_STONE);
  setV(site, cx, base + 4 * R, cz, T.LANTERN_FIRE);
  box(site, cx - 3 * R, cx + 3 * R, base + 5 * R, base + 5 * R, cz - 3 * R, cz + 3 * R, T.LANTERN_STONE);
  box(site, cx - 2 * R, cx + 2 * R, base + 6 * R, base + 6 * R, cz - 2 * R, cz + 2 * R, T.LANTERN_STONE);
  box(site, cx - R, cx + R, base + 7 * R, base + 7 * R, cz - R, cz + R, T.LANTERN_STONE);
  setV(site, cx, base + 8 * R, cz, T.LANTERN_STONE);
  addLantern(site, cx, base + 4 * R, cz, 8 * R);
  claimAll(site, cx, cz, 3.2 * R);
  return { x: cx, z: cz, y: base };
}

/** Stone water basin with a bamboo spout; feeds a surface ripple and the water sound. */
export function buildTsukubai(site, cx, cz) {
  const base = surface(site, cx, cz);
  box(site, cx - R, cx + R, base, base + R, cz - R, cz + R, T.LANTERN_STONE);
  setV(site, cx, base + R, cz, T.WATER);
  site.world.set(Math.round(cx), base + 2 * R, Math.round(cz), T.AIR);
  // Kakehi: bamboo spout leaning over the basin.
  const bx = cx + 3 * R;
  for (let s = 0; s <= 4 * R; s++) {
    setV(site, bx - s, base + 3 * R + Math.round(s * 0.4), cz - R, T.BAMBOO);
  }
  setV(site, bx, base + R, cz - R, T.BAMBOO);
  setV(site, bx + 1, base, cz - R, T.BAMBOO);
  addRipple(site, cx, base + 2 * R, cz, 2.2, 0.7);
  addLantern(site, cx, base + 3 * R, cz - 4 * R, 6 * R);
  box(site, cx - 1, cx, base, base + 2 * R, cz - 4 * R, cz - 4 * R, T.LANTERN_STONE);
  setV(site, cx, base + 3 * R, cz - 4 * R, T.LANTERN_PAPER);
  claimAll(site, cx, cz, 3 * R);
  return { x: cx, z: cz, y: base };
}

/**
 * Itsutsuhashi: five flat planks zig-zagged across the stream. The deck arches so the
 * crossing reads from a distance and the sound of the water sits under the walker.
 */
export function buildBridge(site) {
  const from = ROUTE[7];
  const to = ROUTE[9];
  let walkx = to.x - from.x;
  let walkz = to.z - from.z;
  const wl = Math.hypot(walkx, walkz) || 1;
  walkx /= wl;
  walkz /= wl;
  // Width axis is perpendicular to the walking direction.
  const perpX = -walkz;
  const perpZ = walkx;
  const cx = BRIDGE.x;
  const cz = BRIDGE.z;
  const half = BRIDGE.half;
  // The arch must meet BOTH banks: the east side sits on a raised terrace, and anchoring
  // the curve to one end would leave the approach side floating above the path.
  const bankW = surface(site, cx - walkx * half, cz - walkz * half);
  const bankE = surface(site, cx + walkx * half, cz + walkz * half);
  const peak = Math.max(bankW, bankE) + 3 * R;
  // Planks sample every half voxel in u/w; integer-only sampling rounds to a rotated
  // lattice that leaves diagonal holes the walker falls through.
  for (let u = -half; u <= half; u += 0.5) {
    const x = cx + walkx * u;
    const z = cz + walkz * u;
    const t = u / half;
    const bankY = bankW + (bankE - bankW) * ((u + half) / (2 * half));
    const deckY = Math.round(bankY + (3 * R) * (1 - t * t));
    for (let w = -BRIDGE.width; w <= BRIDGE.width; w += 0.5) {
      const px = x + perpX * w;
      const pz = z + perpZ * w;
      setV(site, px, deckY, pz, T.WOOD);
      // Stone abutments under the approaches, kept a walkable step below the deck so a
      // walker climbing the ramp is never left standing one voxel short with the plank
      // row at shin height.
      if (Math.abs(u) >= 4 * R) {
        const gy = Math.round(groundAt(site, px, pz));
        const top = Math.min(deckY - 1, Math.round(site.ground[gIndex(Math.round(px), Math.round(pz))]) + 2);
        for (let y = gy + 1; y <= top; y++) setV(site, px, y, pz, T.STONE_DARK);
      }
      // Piers down to the channel, every second plank position, same step cap.
      if (Math.abs(w) < 0.3 && Math.round(u) % (2 * R) === 0) {
        const gy = Math.round(groundAt(site, px, pz));
        const top = Math.min(deckY - 1, Math.round(site.ground[gIndex(Math.round(px), Math.round(pz))]) + 2);
        for (let y = gy + 1; y <= top; y++) setV(site, px, y, pz, T.WOOD_DARK);
      }
    }
    // Railings outside the planks so the walkable deck stays a clean corridor.
    for (const side of [-1, 1]) {
      const rx = x + perpX * BRIDGE.rail * side;
      const rz = z + perpZ * BRIDGE.rail * side;
      if (Math.round(u) % (2 * R) === 0) {
        box(site, rx, rx, deckY + R, deckY + 2 * R, rz, rz, T.WOOD_DARK);
      }
      setV(site, rx, deckY + 3 * R, rz, T.WOOD);
    }
  }
  // Landing stones so the deck meets the path cleanly.
  for (const side of [-1, 1]) {
    const x = Math.round(cx + walkx * (half + R) * side);
    const z = Math.round(cz + walkz * (half + R) * side);
    const y = surface(site, x, z);
    box(site, x - R, x + R, y, y, z - R, z + R, T.STONE);
  }
  claimAll(site, cx, cz, 4 * R);
  return { x: cx, z: cz, y: peak };
}

/** Raised viewing deck ( engawa ) with steps, a low railing and a floor lantern. */
export function buildDeck(site) {
  const cx = (DECK.x0 + DECK.x1) / 2;
  const cz = (DECK.z0 + DECK.z1) / 2;
  const deckY = Math.round(groundAt(site, cx, cz)) + 2 * R;
  // Raise a gravel apron 2 world voxels under the platform footprint (plus a north-west
  // margin) so the route crossing the deck corner steps straight onto the planks. At
  // RES=2 the design's open post-and-beam void let a walker's head hit the platform.
  const apronTop = deckY - 2;
  for (let x = DECK.x0 - 2 * R; x <= DECK.x1; x++) {
    for (let z = DECK.z0 - 2 * R; z <= DECK.z1; z++) {
      if (x < 1 || z < 1 || x > SX - 2 || z > SZ - 2) continue;
      const i = gIndex(x, z);
      const gy = Math.round(site.ground[i]);
      if (gy >= apronTop) continue;
      for (let y = gy + 1; y <= apronTop; y++) site.world.set(x, y, z, y === apronTop ? T.GRAVEL : T.DIRT);
      site.ground[i] = apronTop;
    }
  }
  // Platform.
  box(site, DECK.x0, DECK.x1, deckY, deckY, DECK.z0, DECK.z1, T.PLANK);
  box(site, DECK.x0, DECK.x1, deckY, deckY, DECK.z1, DECK.z1, T.WOOD_DARK);
  box(site, DECK.x0, DECK.x1, deckY, deckY, DECK.z0, DECK.z0, T.WOOD_DARK);
  box(site, DECK.x0, DECK.x0, deckY, deckY, DECK.z0, DECK.z1, T.WOOD_DARK);
  // Railing along the east (wall) side only, keeping the pond view open.
  for (let z = DECK.z0; z <= DECK.z1; z += 2 * R) {
    box(site, DECK.x1, DECK.x1, deckY + R, deckY + 2 * R, z, z, T.WOOD_DARK);
  }
  box(site, DECK.x1, DECK.x1, deckY + 3 * R, deckY + 3 * R, DECK.z0, DECK.z1, T.WOOD);
  // Andon (floor lantern) with paper panels.
  const ax = DECK.x1 - 2 * R;
  const az = DECK.z1 - 2 * R;
  box(site, ax, ax + R, deckY + R, deckY + 3 * R, az, az + R, T.LANTERN_PAPER);
  box(site, ax - R, ax + 2 * R, deckY + 4 * R, deckY + 4 * R, az - R, az + 2 * R, T.SHINGLE);
  setV(site, ax, deckY, az, T.WOOD_DARK);
  addLantern(site, ax, deckY + 2 * R, az, 10 * R);
  // Low bench facing the pond.
  box(site, DECK.x0 + 2 * R, DECK.x0 + 3 * R, deckY + R, deckY + R, cz - 2 * R, cz + 2 * R, T.WOOD);
  claimAll(site, cx, cz, 1 * R);
  site.claim(DECK.x0 - R, DECK.z0 - 3 * R, 2 * R);
  return { x: cx, z: cz, y: deckY };
}

/** Takegaki: split-bamboo fence, used beside the grove and below the deck. */
export function buildBambooFence(site, x0, z0, x1, z1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const z = Math.round(z0 + (z1 - z0) * t);
    if (x < 2 || z < 2 || x > SX - 3 || z > SZ - 3) continue;
    const base = surface(site, x, z);
    if (site.pondMask[gIndex(x, z)] || site.streamMask[gIndex(x, z)]) continue;
    const post = s % (4 * R) === 0;
    box(site, x, x, base, base + 4 * R, z, z, T.BAMBOO);
    if (post) setV(site, x, base + 2 * R, z, T.WOOD_DARK);
    if (post) setV(site, x, base + 4 * R, z, T.WOOD_DARK);
  }
}

/** Island lantern, kept clear of the pine canopy on the island. */
const ISLAND_LANTERN = { x: 67 * RES, z: 42 * RES };

/** Everything built, in one call. Returns anchors the runtime layer needs. */
export function buildStructures(site) {
  buildPerimeter(site);
  const torii = buildTorii(site, 65 * R, 114 * R, 5 * R);
  buildTorii(site, 65 * R, 124 * R, 4 * R); // stands in the gate opening of the earthen wall
  const deck = buildDeck(site);
  const bridge = buildBridge(site);
  buildTallLantern(site, 82 * R, 40 * R);
  buildTallLantern(site, 47 * R, 84 * R);
  buildYukimiDoro(site, 30 * R, 50 * R);
  buildYukimiDoro(site, 58 * R, 38 * R);
  buildTsukubai(site, 49 * R, 86 * R);
  // Bamboo fences, broken where the route passes through so no post blocks a shoulder.
  buildBambooFence(site, 101 * R, 88 * R, 122 * R, 88 * R);
  buildBambooFence(site, 93 * R, 90 * R, 93 * R, 95 * R);
  buildBambooFence(site, 93 * R, 102 * R, 93 * R, 120 * R);
  buildTallLantern(site, ISLAND_LANTERN.x, ISLAND_LANTERN.z);
  site.structures = { torii, deck, bridge };
  return site.structures;
}
