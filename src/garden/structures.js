// Built elements: perimeter wall and hedge, torii, stone lanterns, tsukubai, the plank
// bridge over the stream, the viewing deck and bamboo fences.
// All coordinates are world voxels (layout.js RES). Every member is stamped as a cross
// section measured in design proportions × R, so doubling RES thickens posts AND beams
// together; a member written as a literal 1 voxel would stay 16 mm while everything around
// it doubled, which is what made the built pieces read as hairline slivers at RES=2.
import { T } from '../core/palette.js';
import { groundAt, gIndex } from './terrain.js';
import { SX, SZ, RES, DECK, BAMBOO, STREAM, STREAM_WIDTH, ROUTE, BRIDGE } from './layout.js';
import { hash3, clamp } from '../core/noise.js';

const R = RES;
const setV = (site, x, y, z, id) => site.world.set(Math.round(x), Math.round(y), Math.round(z), id);
const box = (site, x0, x1, y0, y1, z0, z1, id) => site.world.fill(x0, x1, y0, y1, z0, z1, id);
const surface = (site, x, z) => Math.round(groundAt(site, x, z)) + 1;

/** Integer voxel range of a member w voxels wide centred on c (even widths straddle c). */
function band(c, w) {
  const a = Math.round(c) - Math.floor(w / 2);
  return [a, a + w - 1];
}

/** A w×d cross-section standing on y0 and ending at y1, centred on (cx,cz). */
function prism(site, cx, cz, y0, y1, w, d, id) {
  const [x0, x1] = band(cx, w);
  const [z0, z1] = band(cz, d);
  box(site, x0, x1, y0, y1, z0, z1, id);
}

/**
 * A beam of cross-section t×d running along X whose bottom edge follows yOf(dx), where dx
 * is the offset from cx. Sampled every half voxel and filled between neighbouring steps,
 * so a curved member stays solid on the finer grid instead of breaking into disconnected
 * 1-voxel staircases.
 */
function sweptBeamX(site, cx, reach, cz, yOf, t, d, id) {
  let prev = null;
  for (let dx = -reach; dx <= reach; dx += 0.5) {
    const x = Math.round(cx + dx);
    const y = Math.round(yOf(dx));
    const lo = prev === null ? y : Math.min(y, prev);
    const hi = prev === null ? y : Math.max(y, prev);
    const [z0, z1] = band(cz, d);
    box(site, x, x, lo, hi + t - 1, z0, z1, id);
    prev = y;
  }
}

/**
 * A pipe of cross-section t×d running along X between two heights. Same half-voxel
 * sampling as sweptBeamX: a leaning member drawn one voxel per step leaves diagonal holes.
 */
function slopedPipeX(site, xFar, xNear, yFar, yNear, cz, t, d, id) {
  const run = Math.abs(xFar - xNear) || 1;
  const dir = xFar > xNear ? -1 : 1;
  for (let s = 0; s <= run; s += 0.5) {
    const x = xFar + dir * s;
    const y = Math.round(yFar + (yNear - yFar) * (s / run));
    prism(site, x, cz, y, y + t - 1, 1, d, id);
  }
}

/**
 * Fire panels flush with the four faces of a solid hibukuro, pw×pd in plan and R tall.
 * Hollowing the box instead left 1-voxel inner walls and hid the flame inside a grey cube,
 * so the lantern read as unlit stone; a flush emissive panel is surface detail on a solid
 * block and glows from every side.
 */
function firePanels(site, bx0, bx1, bz0, bz1, y0, y1, pw, pd) {
  const [wx0, wx1] = band((bx0 + bx1) / 2, pw);
  const [wz0, wz1] = band((bz0 + bz1) / 2, pd);
  box(site, bx1, bx1, y0, y1, wz0, wz1, T.LANTERN_FIRE);
  box(site, bx0, bx0, y0, y1, wz0, wz1, T.LANTERN_FIRE);
  box(site, wx0, wx1, y0, y1, bz1, bz1, T.LANTERN_FIRE);
  box(site, wx0, wx1, y0, y1, bz0, bz0, T.LANTERN_FIRE);
}

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
  const band_ = 3 * R;
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const edge = Math.min(x, z, SX - 1 - x, SZ - 1 - z);
      if (edge > band_ + 3 * R) continue;
      if (edge <= band_) {
        const i = gIndex(x, z);
        site.wallMask[i] = 1;
        const base = surface(site, x, z);
        const top = base + 8 * R - (edge === band_ ? R : 0);
        box(site, x, x, base - 2 * R, top, z, z, T.WALL_EARTH);
        // The tile cap is R thick, not a single skin, and overhangs one voxel inwards so
        // the wall reads as a capped wall rather than a shaved column.
        box(site, x, x, top + 1, top + R, z, z, T.SHINGLE);
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
  // Cap overhang: one extra ring of tiles standing on the wall's inner shoulder.
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const edge = Math.min(x, z, SX - 1 - x, SZ - 1 - z);
      if (edge !== band_ + 1) continue;
      const base = surface(site, x, z);
      const top = base + 8 * R - R;
      box(site, x, x, top + 1, top + R, z, z, T.SHINGLE);
    }
  }
  // South gate opening on the approach axis.
  for (let z = SZ - band_ - 1; z < SZ; z++) {
    for (let x = 60 * R; x <= 70 * R; x++) {
      site.wallMask[gIndex(x, z)] = 0;
      site.world.fill(x, x, 0, site.size.y, z, z, T.AIR);
      const ground = Math.round(site.ground[gIndex(x, z)]);
      for (let y = 0; y <= ground; y++) site.world.set(x, y, z, y === ground ? T.STONE : T.DIRT);
    }
  }
}

/**
 * Myojin-style torii. Posts are square in plan and R-wide per design voxel, the nuki and
 * the swept kasagi are R thick, and the gakuzuka is a proper strut instead of a 1-voxel
 * stick. The kasagi sweep is swept, not stepped, so the upturn is continuous.
 */
export function buildTorii(site, cx, cz, halfSpan = 5 * R) {
  const base = surface(site, cx, cz);
  const postW = 2 * R;
  const postH = 10 * R;
  const footY = base + 2; // top of the kamebara; the posts stand on it
  for (const side of [-1, 1]) {
    const px = cx + side * halfSpan;
    prism(site, px, cz, base - 1, base + 1, 3 * R, 3 * R, T.STONE_DARK); // kamebara
    prism(site, px, cz, footY, footY + postH, postW, postW, T.TORII_RED);
    // Dark band marking the joint where the nuki lands.
    prism(site, px, cz, footY + 3 * R, footY + 3 * R + R - 1, postW + 2, postW + 2, T.TORII_DARK);
  }
  // Nuki (tie beam) passing through both posts.
  const nukiY = footY + 7 * R;
  const [nz0, nz1] = band(cz, 2 * R);
  box(site, cx - halfSpan - R, cx + halfSpan + R, nukiY, nukiY + R - 1, nz0, nz1, T.TORII_RED);
  // Kasagi and shimaki: the shimaki is the narrower dark board and the kasagi crowns it,
  // wider, both sweeping up toward the ends. Drawing the dark layer above the red one made
  // the roof read as a dark slab hiding a red line. Both are R thick and the sweep is
  // filled between steps, so the curve never fragments.
  const reach = halfSpan + 2 * R;
  const shimakiY = (dx) => footY + postH + R + Math.round(Math.pow(Math.abs(dx) / reach, 2) * 2.2 * R);
  sweptBeamX(site, cx, reach, cz, shimakiY, R, 3 * R + 1, T.TORII_DARK);
  sweptBeamX(site, cx, reach, cz, (dx) => shimakiY(dx) + R, R, 3 * R + 3, T.TORII_RED);
  // Gakuzuka: the strut between nuki and shimaki, with a white name plate on its face.
  const shimakiLow = Math.round(shimakiY(0));
  prism(site, cx, cz, nukiY + R, shimakiLow - 1, 2 * R, 2 * R, T.TORII_RED);
  const [gx0, gx1] = band(cx, 2 * R);
  box(site, gx0, gx1, shimakiLow - 2 * R, shimakiLow - R - 1, nz0, nz0, T.TORII_WHITE);
  claimAll(site, cx, cz, halfSpan + 3 * R);
  return { x: cx, z: cz, y: base };
}

/**
 * Oshi-doro: the tall four-sided stone lantern. The sao is R wide (it was a single voxel,
 * which read as a wire under the fire box), every plate is R thick, the kasa is a stepped
 * pyramid, and each face of the hibukuro carries a lit panel.
 */
export function buildTallLantern(site, cx, cz) {
  const base = surface(site, cx, cz);
  const plate = 3 * R + 1; // chibana / ukebana: plates that overhang the fire box
  const body = 2 * R + 1;
  let y = base;
  prism(site, cx, cz, y, y, 3 * R, 3 * R, T.STONE_DARK); // kamebara
  y += 1;
  prism(site, cx, cz, y, y + 3 * R - 1, R, R, T.LANTERN_STONE); // sao
  y += 3 * R;
  prism(site, cx, cz, y, y + R - 1, plate, plate, T.LANTERN_STONE); // chibana
  y += R;
  const [hx0, hx1] = band(cx, body);
  const [hz0, hz1] = band(cz, body);
  box(site, hx0, hx1, y, y + 2 * R - 1, hz0, hz1, T.LANTERN_STONE); // hibukuro
  const wy = y + Math.round(R / 2);
  firePanels(site, hx0, hx1, hz0, hz1, wy, wy + R - 1, R + 1, R + 1);
  const fireY = y + R;
  y += 2 * R;
  prism(site, cx, cz, y, y + R - 1, plate, plate, T.LANTERN_STONE); // ukebana
  y += R;
  // Kasa: a stepped pyramid. A single wide course read as a plank balanced on the box.
  for (const w of [4 * R + 1, 3 * R + 1, 2 * R + 1]) {
    prism(site, cx, cz, y, y + R - 1, w, w, T.LANTERN_STONE);
    y += R;
  }
  prism(site, cx, cz, y, y + R, R, R, T.LANTERN_STONE); // hoju
  addLantern(site, cx, fireY, cz, 9 * R);
  claimAll(site, cx, cz, 2.4 * R);
  return { x: cx, z: cz, y: base };
}

/** Yukimi-doro: the low lantern with a wide hat, set near the water. */
export function buildYukimiDoro(site, cx, cz) {
  const base = surface(site, cx, cz);
  let y = base;
  prism(site, cx, cz, y, y, 3 * R, 3 * R, T.STONE_DARK); // kamebara
  y += 1;
  prism(site, cx, cz, y, y + 2 * R - 1, R, R, T.LANTERN_STONE); // sao
  y += 2 * R;
  prism(site, cx, cz, y, y + R - 1, 2 * R + 1, 2 * R + 1, T.LANTERN_STONE); // ebana
  y += R;
  // Hibukuro: a solid box with a lit panel on each face, so the flame is visible from
  // whichever side the walker approaches.
  const [hx0, hx1] = band(cx, 2 * R);
  const [hz0, hz1] = band(cz, 2 * R);
  box(site, hx0, hx1, y, y + 2 * R - 1, hz0, hz1, T.LANTERN_STONE);
  const wy = y + Math.round(R / 2);
  firePanels(site, hx0, hx1, hz0, hz1, wy, wy + R - 1, R, R);
  y += 2 * R;
  // Kasa: three R-thick courses stepping down to the finial.
  prism(site, cx, cz, y, y + R - 1, 6 * R + 1, 6 * R + 1, T.LANTERN_STONE);
  y += R;
  prism(site, cx, cz, y, y + R - 1, 4 * R + 1, 4 * R + 1, T.LANTERN_STONE);
  y += R;
  prism(site, cx, cz, y, y + R - 1, 2 * R + 1, 2 * R + 1, T.LANTERN_STONE);
  y += R;
  prism(site, cx, cz, y, y + R, R, R, T.LANTERN_STONE); // hoju
  addLantern(site, cx, base + 4 * R, cz, 8 * R);
  claimAll(site, cx, cz, 3.2 * R);
  return { x: cx, z: cz, y: base };
}

/**
 * Stone water basin with a bamboo spout; feeds a surface ripple and the water sound.
 * The bowl is hollowed and filled to just under the rim — a solid block with one water
 * voxel on top reads as a stone cube at the finer grid.
 */
export function buildTsukubai(site, cx, cz) {
  const base = surface(site, cx, cz);
  const body = 2 * R + 1;
  let y = base;
  prism(site, cx, cz, y, y + R, body, body, T.LANTERN_STONE); // pedestal
  y += R + 1;
  prism(site, cx, cz, y, y + R - 1, body, body, T.LANTERN_STONE); // rim block
  prism(site, cx, cz, y, y + R - 1, R + 1, R + 1, T.AIR); // bowl
  prism(site, cx, cz, y, y + R - 2, R + 1, R + 1, T.WATER); // water a voxel under the lip
  // Kakehi: a bamboo pipe R thick, sloping down so its mouth hangs over the bowl.
  const postX = cx + 3 * R;
  prism(site, postX, cz - R, base, base + 4 * R, R, R, T.BAMBOO);
  slopedPipeX(site, postX, cx + 1, base + 4 * R, base + 2 * R, cz - R, R, R, T.BAMBOO);
  addRipple(site, cx, base + 2 * R, cz, 2.2, 0.7);
  // A small lantern beside the basin, R square rather than a 1-voxel sliver.
  const lx = cx;
  const lz = cz - 4 * R;
  prism(site, lx, lz, base, base + 2 * R, R, R, T.LANTERN_STONE);
  prism(site, lx, lz, base + 2 * R + 1, base + 3 * R, R, R, T.LANTERN_PAPER);
  addLantern(site, lx, base + 3 * R, lz, 6 * R);
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
  // Railing posts sit one voxel clear of the plank edge, so an R-wide post never grows
  // over the walkable deck.
  const railC = BRIDGE.rail + Math.ceil(R / 2);
  // Stringers: two beams along the underside edges of the deck. Without them the span is
  // a thin plank crust over slender posts, which reads as a row of hanging teeth from the
  // bank; a tied beam makes the same piers read as timber bridgework.
  const stringerPrev = [null, null];
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
      // The plank is R thick: a single-voxel deck is a veneer at RES=2.
      box(site, px, px, deckY - R + 1, deckY, pz, pz, T.WOOD);
      // Stone abutments under the approaches, kept a walkable step below the deck so a
      // walker climbing the ramp is never left standing one voxel short with the plank
      // row at shin height.
      if (Math.abs(u) >= 4 * R) {
        const gy = Math.round(groundAt(site, px, pz));
        const top = Math.min(deckY - R, Math.round(site.ground[gIndex(Math.round(px), Math.round(pz))]) + 2);
        for (let y = gy + 1; y <= top; y++) setV(site, px, y, pz, T.STONE_DARK);
      }
      // Piers are stamped as bents below, not as slats here.
    }
    // Stringers run between the abutments only, and are filled between arch steps so the
    // underside reads as a beam instead of a staircase of plank ends.
    for (const side of [-1, 1]) {
      const si = side === -1 ? 0 : 1;
      if (Math.abs(u) >= 4 * R) {
        stringerPrev[si] = null;
        continue;
      }
      const sx = x + perpX * BRIDGE.width * side;
      const sz = z + perpZ * BRIDGE.width * side;
      const y0 = deckY - 2 * R;
      const p = stringerPrev[si];
      box(site, sx, sx, p === null ? y0 : Math.min(y0, p), p === null ? y0 + R - 1 : Math.max(y0 + R - 1, p + R - 1), sz, sz, T.WOOD_DARK);
      stringerPrev[si] = y0;
    }
    // Trestles: bents R+1 thick along the run and as wide as the deck across, standing
    // from the channel bed up to the stringers. One-voxel slats under the deck read as a
    // row of hanging teeth from the bank; stubby bents read as bridgework.
    if (Math.round(u) % (2 * R + 1) === 0 && Math.abs(u) <= half - 3 * R) {
      for (let du = 0; du <= R; du++) {
        for (let wv = -BRIDGE.width + 1; wv <= BRIDGE.width - 1; wv += 0.5) {
          const px = x + walkx * du + perpX * wv;
          const pz = z + walkz * du + perpZ * wv;
          const gy = Math.round(groundAt(site, px, pz));
          for (let y = gy + 1; y <= deckY - 2 * R; y++) setV(site, px, y, pz, T.WOOD_DARK);
        }
      }
    }
    // Railings outside the planks so the walkable deck stays a clean corridor.
    for (const side of [-1, 1]) {
      const rx = x + perpX * railC * side;
      const rz = z + perpZ * railC * side;
      if (Math.round(u) % (2 * R) === 0) {
        prism(site, rx, rz, deckY + 1, deckY + 3 * R - 1, R, R, T.WOOD_DARK);
      }
      // Continuous R-thick handrail: sampled every half voxel so the arch keeps it joined.
      prism(site, rx, rz, deckY + 3 * R, deckY + 4 * R - 1, R, R, T.WOOD);
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
    prism(site, DECK.x1, z, deckY + 1, deckY + 3 * R - 1, R, R, T.WOOD_DARK);
  }
  box(site, DECK.x1 - R + 1, DECK.x1, deckY + 3 * R, deckY + 4 * R - 1, DECK.z0, DECK.z1, T.WOOD);
  // Andon (floor lantern) with paper panels, standing on a plank of its own.
  const ax = DECK.x1 - 2 * R;
  const az = DECK.z1 - 2 * R;
  prism(site, ax, az, deckY + 1, deckY + 1, 2 * R + 2, 2 * R + 2, T.WOOD_DARK);
  prism(site, ax, az, deckY + 2, deckY + 2 * R + 1, 2 * R, 2 * R, T.LANTERN_PAPER);
  prism(site, ax, az, deckY + 2 * R + 2, deckY + 3 * R + 1, 2 * R + 2, 2 * R + 2, T.SHINGLE);
  addLantern(site, ax, deckY + 2 * R, az, 10 * R);
  // Low bench facing the pond: an R-thick plank on a dark apron.
  box(site, DECK.x0 + 2 * R, DECK.x0 + 3 * R, deckY + 1, deckY + R - 1, cz - 2 * R, cz + 2 * R, T.WOOD_DARK);
  box(site, DECK.x0 + 2 * R, DECK.x0 + 3 * R, deckY + R, deckY + 2 * R - 1, cz - 2 * R, cz + 2 * R, T.WOOD);
  claimAll(site, cx, cz, 1 * R);
  site.claim(DECK.x0 - R, DECK.z0 - 3 * R, 2 * R);
  return { x: cx, z: cz, y: deckY };
}

/**
 * Takegaki: split-bamboo fence, used beside the grove and below the deck. The panel is R
 * thick across the run — a single-voxel line is a sheet of paper at the finer grid — and
 * the posts are R square, standing R above the panel. Thickness grows AWAY from the design
 * line (east for a north-south run, south for an east-west one): straddling it would push
 * the posts a voxel into the bamboo path the gaps were cut for.
 */
export function buildBambooFence(site, x0, z0, x1, z1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const z = Math.round(z0 + (z1 - z0) * t);
    if (x < 2 || z < 2 || x > SX - 3 || z > SZ - 3) continue;
    const base = surface(site, x, z);
    if (site.pondMask[gIndex(x, z)] || site.streamMask[gIndex(x, z)]) continue;
    const px1 = alongX ? x : x + R - 1;
    const pz1 = alongX ? z + R - 1 : z;
    const post = s % (4 * R) === 0;
    if (post) {
      box(site, x, px1, base, base + 5 * R, z, pz1, T.WOOD_DARK);
      continue;
    }
    // Stalks R wide with a 1-voxel slit between them: a closed panel reads as a green
    // board, and split bamboo lets slivers of light through.
    if (s % (R + 1) < R) box(site, x, px1, base, base + 4 * R, z, pz1, T.BAMBOO);
    // Two woven straps. A bamboo binding is ~5 cm, so one voxel is the honest thickness
    // here — making them R thick turns the panel into dark banding. They run through the
    // slits too, so the stalks stay one bonded panel.
    for (const strap of [R, 3 * R]) {
      box(site, x, px1, base + strap, base + strap, z, pz1, T.WOOD_DARK);
    }
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
