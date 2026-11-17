// Built elements: perimeter wall and hedge, torii, stone lanterns, tsukubai, the plank
// bridge over the stream, the viewing deck and bamboo fences.
import { T } from '../core/palette.js';
import { groundAt, gIndex } from './terrain.js';
import { SX, SZ, DECK, BAMBOO, STREAM, STREAM_WIDTH, ROUTE, BRIDGE } from './layout.js';
import { hash3, clamp } from '../core/noise.js';

const setV = (site, x, y, z, id) => site.world.set(Math.round(x), Math.round(y), Math.round(z), id);
const box = (site, x0, x1, y0, y1, z0, z1, id) => site.world.fill(x0, x1, y0, y1, z0, z1, id);
const surface = (site, x, z) => Math.round(groundAt(site, x, z)) + 1;

function claimAll(site, x, z, r) {
  site.claim(Math.round(x), Math.round(z), Math.max(1, Math.ceil(r)));
}

function addLantern(site, x, y, z, radius = 7) {
  site.lanterns.push({ x, y, z, radius });
}

function addRipple(site, x, y, z, period = 2.6, scale = 1) {
  site.ripples.push({ x, y, z, period, scale, phase: hash3(x, 9, z) });
}

/** Earthen wall with a tiled cap around the whole precinct, plus a hedge at its foot. */
export function buildPerimeter(site) {
  const rng = site.rng;
  const band = 3;
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const edge = Math.min(x, z, SX - 1 - x, SZ - 1 - z);
      if (edge > band + 3) continue;
      if (edge <= band) {
        const i = gIndex(x, z);
        site.wallMask[i] = 1;
        const base = surface(site, x, z);
        const top = base + 8 - (edge === band ? 1 : 0);
        box(site, x, x, base - 2, top, z, z, T.WALL_EARTH);
        box(site, x, x, top + 1, top + 1, z, z, T.SHINGLE);
      } else {
        // Hedge just inside the wall.
        const i = gIndex(x, z);
        if (site.pondMask[i] || site.streamMask[i] || site.pathMask[i]) continue;
        if (x >= 59 && x <= 71 && z >= SZ - 8) continue; // keep the gate lane clear
        if (hash3(x, 77, z) > 0.45) {
          const base = surface(site, x, z);
          const h = 2 + (hash3(x, 79, z) > 0.7 ? 1 : 0);
          box(site, x, x, base, base + h, z, z, hash3(x, 81, z) > 0.8 ? T.SHRUB_LIGHT : T.SHRUB);
        }
      }
    }
  }
  // South gate opening on the approach axis.
  for (let z = SZ - band - 1; z < SZ; z++) {
    for (let x = 60; x <= 70; x++) {
      site.wallMask[gIndex(x, z)] = 0;
      site.world.fill(x, x, 0, SZ, z, z, T.AIR);
      const ground = Math.round(site.ground[gIndex(x, z)]);
      for (let y = 0; y <= ground; y++) site.world.set(x, y, z, y === ground ? T.STONE : T.DIRT);
    }
  }
}

/** Myojin-style torii. Posts sit on the ground, the lintel curves up at the ends. */
export function buildTorii(site, cx, cz, halfSpan = 5) {
  const base = surface(site, cx, cz);
  const postH = 10;
  for (const side of [-1, 1]) {
    const px = cx + side * halfSpan;
    box(site, px - 1, px, base, base + postH, cz - 1, cz, T.TORII_RED);
    box(site, px - 1, px, base - 1, base - 1, cz - 1, cz, T.STONE_DARK); // kamebara
    // Slight inward lean is lost in voxel form; add a ring instead.
    box(site, px - 1, px, base + 3, base + 3, cz - 1, cz, T.TORII_DARK);
  }
  // Nuki (tie beam) and gakuzuka.
  box(site, cx - halfSpan - 1, cx + halfSpan + 1, base + 7, base + 7, cz, cz, T.TORII_RED);
  box(site, cx, cx, base + 8, base + 9, cz, cz, T.TORII_RED);
  // Kasagi with an upward sweep, capped by black shimaki.
  for (let dx = -halfSpan - 2; dx <= halfSpan + 2; dx++) {
    const sweep = Math.round(Math.pow(Math.abs(dx) / (halfSpan + 2), 2) * 1.6);
    const y = base + postH + 1 + sweep;
    box(site, cx + dx, cx + dx, y, y, cz - 2, cz + 1, T.TORII_RED);
    box(site, cx + dx, cx + dx, y + 1, y + 1, cz - 2, cz + 1, T.TORII_DARK);
  }
  box(site, cx - 1, cx + 1, base + postH + 2, base + postH + 2, cz - 1, cz, T.TORII_WHITE);
  claimAll(site, cx, cz, halfSpan + 3);
  return { x: cx, z: cz, y: base };
}

/** Oshi-doro: the tall four-sided stone lantern. */
export function buildTallLantern(site, cx, cz) {
  const base = surface(site, cx, cz);
  box(site, cx - 1, cx + 1, base, base, cz - 1, cz + 1, T.STONE_DARK);
  box(site, cx, cx, base + 1, base + 3, cz, cz, T.LANTERN_STONE); // kiso + sao
  box(site, cx - 1, cx + 1, base + 4, base + 4, cz - 1, cz + 1, T.LANTERN_STONE); // chibana
  // Hibukuro: hollow box with a fire inside.
  box(site, cx - 1, cx + 1, base + 5, base + 6, cz - 1, cz + 1, T.LANTERN_STONE);
  setV(site, cx, base + 5, cz, T.AIR);
  setV(site, cx, base + 6, cz, T.LANTERN_FIRE);
  setV(site, cx + 1, base + 5, cz, T.AIR);
  setV(site, cx - 1, base + 5, cz, T.AIR);
  setV(site, cx, base + 5, cz + 1, T.AIR);
  setV(site, cx, base + 5, cz - 1, T.AIR);
  // Kasa (roof) with upturned corners.
  box(site, cx - 2, cx + 2, base + 7, base + 7, cz - 2, cz + 2, T.LANTERN_STONE);
  box(site, cx - 1, cx + 1, base + 8, base + 8, cz - 1, cz + 1, T.LANTERN_STONE);
  setV(site, cx, base + 9, cz, T.LANTERN_STONE);
  addLantern(site, cx, base + 6, cz, 9);
  claimAll(site, cx, cz, 2.4);
  return { x: cx, z: cz, y: base };
}

/** Yukimi-doro: the low lantern with a wide hat, set near the water. */
export function buildYukimiDoro(site, cx, cz) {
  const base = surface(site, cx, cz);
  box(site, cx - 1, cx + 1, base, base, cz - 1, cz + 1, T.STONE_DARK);
  box(site, cx, cx, base + 1, base + 2, cz, cz, T.LANTERN_STONE);
  box(site, cx - 1, cx + 1, base + 3, base + 3, cz - 1, cz + 1, T.LANTERN_STONE);
  box(site, cx - 1, cx + 1, base + 4, base + 4, cz - 1, cz + 1, T.LANTERN_STONE);
  setV(site, cx, base + 4, cz, T.LANTERN_FIRE);
  box(site, cx - 3, cx + 3, base + 5, base + 5, cz - 3, cz + 3, T.LANTERN_STONE);
  box(site, cx - 2, cx + 2, base + 6, base + 6, cz - 2, cz + 2, T.LANTERN_STONE);
  box(site, cx - 1, cx + 1, base + 7, base + 7, cz - 1, cz + 1, T.LANTERN_STONE);
  setV(site, cx, base + 8, cz, T.LANTERN_STONE);
  addLantern(site, cx, base + 4, cz, 8);
  claimAll(site, cx, cz, 3.2);
  return { x: cx, z: cz, y: base };
}

/** Stone water basin with a bamboo spout; feeds a surface ripple and the water sound. */
export function buildTsukubai(site, cx, cz) {
  const base = surface(site, cx, cz);
  box(site, cx - 1, cx + 1, base, base + 1, cz - 1, cz + 1, T.LANTERN_STONE);
  setV(site, cx, base + 1, cz, T.WATER);
  site.world.set(Math.round(cx), base + 2, Math.round(cz), T.AIR);
  // Kakehi: bamboo spout leaning over the basin.
  const bx = cx + 3;
  for (let s = 0; s <= 4; s++) {
    setV(site, bx - s, base + 3 + Math.round(s * 0.4), cz - 1, T.BAMBOO);
  }
  setV(site, bx, base + 1, cz - 1, T.BAMBOO);
  setV(site, bx + 1, base, cz - 1, T.BAMBOO);
  addRipple(site, cx, base + 2, cz, 2.2, 0.7);
  addLantern(site, cx, base + 3, cz - 4, 6);
  box(site, cx, cx, base, base + 2, cz - 4, cz - 4, T.LANTERN_STONE);
  setV(site, cx, base + 3, cz - 4, T.LANTERN_PAPER);
  claimAll(site, cx, cz, 3);
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
  const bankY = surface(site, cx + walkx * half, cz + walkz * half);
  const peak = bankY + 3;
  for (let u = -half; u <= half; u += 0.5) {
    const x = cx + walkx * u;
    const z = cz + walkz * u;
    const t = u / half;
    const deckY = Math.round(bankY + (peak - bankY) * (1 - t * t));
    for (let w = -BRIDGE.width; w <= BRIDGE.width; w += 0.5) {
      const px = x + perpX * w;
      const pz = z + perpZ * w;
      setV(site, px, deckY, pz, T.WOOD);
      // Stone abutments under the approaches so nobody can walk into the void under the deck.
      if (Math.abs(u) >= 4) {
        const gy = Math.round(groundAt(site, px, pz));
        for (let y = gy + 1; y < deckY; y++) setV(site, px, y, pz, T.STONE_DARK);
      }
      // Piers down to the channel, every second plank position.
      if (Math.abs(w) < 0.3 && Math.abs(Math.round(u * 2) % 4) === 0) {
        const gy = Math.round(groundAt(site, px, pz));
        for (let y = gy + 1; y < deckY; y++) setV(site, px, y, pz, T.WOOD_DARK);
      }
    }
    // Railings outside the planks so the walkable deck stays a clean corridor.
    for (const side of [-1, 1]) {
      const rx = x + perpX * BRIDGE.rail * side;
      const rz = z + perpZ * BRIDGE.rail * side;
      if (Math.abs(Math.round(u * 2) % 4) === 0) {
        setV(site, rx, deckY + 1, rz, T.WOOD_DARK);
        setV(site, rx, deckY + 2, rz, T.WOOD_DARK);
      }
      setV(site, rx, deckY + 3, rz, T.WOOD);
    }
  }
  // Landing stones so the deck meets the path cleanly.
  for (const side of [-1, 1]) {
    const x = Math.round(cx + walkx * (half + 1) * side);
    const z = Math.round(cz + walkz * (half + 1) * side);
    const y = surface(site, x, z);
    box(site, x - 1, x + 1, y, y, z - 1, z + 1, T.STONE);
  }
  claimAll(site, cx, cz, 4);
  return { x: cx, z: cz, y: peak };
}

/** Raised viewing deck ( engawa ) with steps, a low railing and a floor lantern. */
export function buildDeck(site) {
  const cx = (DECK.x0 + DECK.x1) / 2;
  const cz = (DECK.z0 + DECK.z1) / 2;
  const deckY = Math.round(groundAt(site, cx, cz)) + 2;
  // Posts.
  for (let x = DECK.x0; x <= DECK.x1; x += 3) {
    for (let z = DECK.z0; z <= DECK.z1; z += 3) {
      const gy = Math.round(groundAt(site, x, z));
      for (let y = gy + 1; y < deckY; y++) setV(site, x, y, z, T.WOOD_DARK);
    }
  }
  // Platform.
  box(site, DECK.x0, DECK.x1, deckY, deckY, DECK.z0, DECK.z1, T.PLANK);
  box(site, DECK.x0, DECK.x1, deckY, deckY, DECK.z1, DECK.z1, T.WOOD_DARK);
  box(site, DECK.x0, DECK.x1, deckY, deckY, DECK.z0, DECK.z0, T.WOOD_DARK);
  box(site, DECK.x0, DECK.x0, deckY, deckY, DECK.z0, DECK.z1, T.WOOD_DARK);
  // Railing along the east (wall) side only, keeping the pond view open.
  for (let z = DECK.z0; z <= DECK.z1; z += 2) {
    setV(site, DECK.x1, deckY + 1, z, T.WOOD_DARK);
    setV(site, DECK.x1, deckY + 2, z, T.WOOD_DARK);
  }
  box(site, DECK.x1, DECK.x1, deckY + 3, deckY + 3, DECK.z0, DECK.z1, T.WOOD);
  // Steps down to the north-west corner where the route arrives.
  box(site, DECK.x0, DECK.x0 + 3, deckY - 1, deckY - 1, DECK.z0 - 2, DECK.z0 - 1, T.PLANK);
  box(site, DECK.x0, DECK.x0 + 3, deckY - 2, deckY - 2, DECK.z0 - 3, DECK.z0 - 2, T.PLANK);
  // Andon (floor lantern) with paper panels.
  const ax = DECK.x1 - 2;
  const az = DECK.z1 - 2;
  box(site, ax, ax + 1, deckY + 1, deckY + 3, az, az + 1, T.LANTERN_PAPER);
  box(site, ax - 1, ax + 2, deckY + 4, deckY + 4, az - 1, az + 2, T.SHINGLE);
  setV(site, ax, deckY, az, T.WOOD_DARK);
  addLantern(site, ax, deckY + 2, az, 10);
  // Low bench facing the pond.
  box(site, DECK.x0 + 2, DECK.x0 + 3, deckY + 1, deckY + 1, cz - 2, cz + 2, T.WOOD);
  claimAll(site, cx, cz, 1);
  site.claim(DECK.x0 - 1, DECK.z0 - 3, 2);
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
    const post = s % 4 === 0;
    setV(site, x, base, z, post ? T.BAMBOO : T.BAMBOO);
    setV(site, x, base + 1, z, T.BAMBOO);
    setV(site, x, base + 2, z, post ? T.WOOD_DARK : T.BAMBOO);
    setV(site, x, base + 3, z, T.BAMBOO);
    if (post) setV(site, x, base + 4, z, T.WOOD_DARK);
  }
}

/** Island lantern, kept clear of the pine canopy on the island. */
const ISLAND_LANTERN = { x: 67, z: 42 };

/** Everything built, in one call. Returns anchors the runtime layer needs. */
export function buildStructures(site) {
  buildPerimeter(site);
  const torii = buildTorii(site, 65, 114, 5);
  buildTorii(site, 65, 124, 4); // stands in the gate opening of the earthen wall
  const deck = buildDeck(site);
  const bridge = buildBridge(site);
  buildTallLantern(site, 82, 40);
  buildTallLantern(site, 47, 84);
  buildYukimiDoro(site, 30, 50);
  buildYukimiDoro(site, 58, 38);
  buildTsukubai(site, 49, 86);
  // Bamboo fences, broken where the route passes through so no post blocks a shoulder.
  buildBambooFence(site, 101, 88, 122, 88);
  buildBambooFence(site, 93, 90, 93, 95);
  buildBambooFence(site, 93, 102, 93, 120);
  buildTallLantern(site, ISLAND_LANTERN.x, ISLAND_LANTERN.z);
  site.structures = { torii, deck, bridge };
  return site.structures;
}
