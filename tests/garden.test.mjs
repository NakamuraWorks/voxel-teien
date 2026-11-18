import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGarden } from '../src/garden/generate.js';
import { buildGeometries, Mesher, sliceRanges } from '../src/core/mesher.js';
import { SX, SY, SZ, ROUTE, DECK, RES } from '../src/garden/layout.js';
import { VIEW } from '../src/game/player.js';
import { T, NAMES, isFoliage } from '../src/core/palette.js';

const started = Date.now();
const site = generateGarden();
const genMs = Date.now() - started;

/** Topmost solid at or below `fromY` — what a walker would land on. */
function surfaceBelow(x, z, fromY) {
  for (let y = Math.min(SY - 1, fromY); y >= 0; y--) {
    if (site.world.isSolid(x, y, z)) return y;
  }
  return -1;
}

const WALKABLE = new Set([
  T.GRASS, T.MOSS, T.MOSS_LIGHT, T.DIRT, T.MUD, T.SAND, T.SAND_RIDGE, T.GRAVEL,
  T.STONE, T.STONE_DARK, T.ROCK, T.ROCK_DARK, T.MOSS_ROCK, T.WOOD, T.WOOD_DARK,
  T.PLANK, T.WALL_EARTH, T.SHINGLE, T.LEAF_PILE
]);

const BODY_HEIGHT = 5 * RES;

/**
 * Replay the route the way a walker would: feet stay on the ground, a step up of at most
 * STEP_UP is allowed, and the body needs BODY_HEIGHT of clear space at every sample.
 */
function walkPath(samples, startY, stepUp = 1.2 * RES) {
  const problems = [];
  let foot = startY;
  let maxStep = 0;
  for (const s of samples) {
    const x = Math.round(s.x);
    const z = Math.round(s.z);
    const candidate = surfaceBelow(x, z, Math.round(foot + stepUp));
    if (candidate < 0) {
      problems.push(`no ground at (${x},${z})`);
      continue;
    }
    const nextFoot = candidate + 1;
    maxStep = Math.max(maxStep, nextFoot - foot);
    foot = nextFoot;
    const id = site.world.get(x, candidate, z);
    if (!WALKABLE.has(id)) {
      problems.push(`foot lands on ${NAMES[id]} at (${x},${z})`);
      continue;
    }
    for (let k = 1; k <= BODY_HEIGHT; k++) {
      const above = site.world.get(x, candidate + k, z);
      if (above !== 0 && above !== T.WATER) {
        problems.push(`body blocked at (${x},${z}) y+${k} by ${NAMES[above]}`);
        break;
      }
    }
  }
  return { problems, maxStep };
}

test(`generation is deterministic (${genMs}ms)`, () => {
  const again = generateGarden();
  let diff = 0;
  for (let i = 0; i < site.world.data.length; i++) {
    if (site.world.data[i] !== again.world.data[i]) diff++;
  }
  assert.equal(diff, 0, 'same seed must produce the identical world');
});

test('world has pond, stream, lanterns and koi', () => {
  let water = 0;
  for (let i = 0; i < site.world.data.length; i++) if (site.world.data[i] === T.WATER) water++;
  assert.ok(water > 4000, `expected a real pond, got ${water} water voxels`);
  assert.ok(site.lanterns.length >= 6, 'stone lanterns should carry light anchors');
  assert.ok(site.koi.length >= 8, `koi stocked: ${site.koi.length}`);
  assert.ok(site.cascades.length === 3);
  assert.ok(site.ripples.length >= 4);
});

test('every pond and stream column has water above its floor', () => {
  let bad = 0;
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const i = z * SX + x;
      if (!site.pondMask[i] && !site.streamMask[i]) continue;
      if (site.waterTop[i] === 0) bad++;
    }
  }
  assert.equal(bad, 0, 'masked columns must have a water surface');
});

test('the strolling route stays walkable end to end', () => {
  const samples = [];
  // Sample the corridor at the walker's half-width so a shoulder cannot clip a trunk.
  const LANES = [-VIEW.half, 0, VIEW.half];
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i];
    const b = ROUTE[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const px = -(b.z - a.z) / (len || 1);
    const pz = (b.x - a.x) / (len || 1);
    const n = Math.max(2, Math.round(len * 2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const cx = a.x + (b.x - a.x) * t;
      const cz = a.z + (b.z - a.z) * t;
      for (const lane of LANES) {
        samples.push({ x: cx + px * lane, z: cz + pz * lane, i });
      }
    }
  }
  const startFoot = surfaceBelow(65 * RES, 121 * RES, SY - 1) + 1;
  const { problems, maxStep } = walkPath(samples, startFoot);
  assert.deepEqual(problems, [], `route not walkable: ${problems.slice(0, 8).join('; ')}`);
  assert.ok(maxStep <= 4, `route has a step of ${maxStep} voxels, too tall to climb`);
});

test('spawn point is dry, solid and has headroom', () => {
  const sx = Math.floor(site.spawn.x);
  const sz = Math.floor(site.spawn.z);
  const y = surfaceBelow(sx, sz, SY - 1);
  assert.ok(y >= 0, 'spawn must land on ground');
  assert.ok(WALKABLE.has(site.world.get(sx, y, sz)), 'spawn floor must be walkable');
  for (let k = 1; k <= BODY_HEIGHT; k++) {
    assert.equal(site.world.get(sx, y + k, sz), 0, `spawn headroom blocked at y+${k}`);
  }
});

test('lanterns and koi are not buried inside solid rock', () => {
  for (const l of site.lanterns) {
    const id = site.world.get(Math.round(l.x), Math.round(l.y), Math.round(l.z));
    assert.notEqual(id, T.ROCK, `lantern light at ${l.x},${l.y},${l.z} is buried in rock`);
  }
  for (const k of site.koi) {
    const id = site.world.get(Math.floor(k.x), k.y, Math.floor(k.z));
    assert.equal(id, T.WATER, `koi at ${k.x},${k.z} must be in water, found ${NAMES[id]}`);
  }
});

test('meshing produces finite geometry for opaque, emissive and water', () => {
  const t0 = Date.now();
  const { opaque, emissive, water, stats } = buildGeometries(site.world);
  const pos = opaque.getAttribute('position');
  assert.ok(stats.opaqueFaces > 40000, `opaque faces: ${stats.opaqueFaces}`);
  assert.ok(stats.waterFaces > 900, `water faces: ${stats.waterFaces}`);
  assert.ok(stats.emissiveFaces > 20, `emissive faces: ${stats.emissiveFaces}`);
  for (const attr of [pos, opaque.getAttribute('normal'), opaque.getAttribute('color')]) {
    for (let i = 0; i < attr.array.length; i++) {
      assert.ok(Number.isFinite(attr.array[i]), 'geometry contains a non-finite value');
      if (attr.itemSize === 3 && i % 300000 === 299999) break;
    }
  }
  assert.ok(water.getAttribute('aTop'), 'water needs the aTop attribute for ripples');
  console.log(
    `   meshed in ${Date.now() - t0}ms — opaque ${stats.opaqueFaces}, water ${stats.waterFaces}, emissive ${stats.emissiveFaces} faces`
  );
});

test('sliced meshing covers every row and matches the one-shot build', () => {
  const ranges = sliceRanges(SY, 10);
  let rows = 0;
  let prev = 0;
  for (const r of ranges) {
    assert.equal(r.y0, prev, `slice rows must be contiguous, got ${prev} then ${r.y0}`);
    assert.ok(Number.isInteger(r.y0) && Number.isInteger(r.y1), `slice bounds must be integers: ${r.y0}..${r.y1}`);
    rows += r.y1 - r.y0;
    prev = r.y1;
  }
  assert.equal(prev, SY, 'slices must reach the top row');
  assert.equal(rows, SY, 'every row must be meshed exactly once');

  const mesher = new Mesher(site.world);
  for (const r of ranges) mesher.buildSlice(r.y0, r.y1);
  const sliced = mesher.finish();
  const once = buildGeometries(site.world);
  assert.deepEqual(sliced.stats, once.stats, 'sliced meshing lost faces (a row was skipped)');
  for (const key of ['opaque', 'emissive', 'water']) {
    const a = sliced[key].getAttribute('position').array;
    const b = once[key].getAttribute('position').array;
    assert.equal(a.length, b.length, `${key}: vertex count differs from one-shot build`);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) assert.fail(`${key}: vertex ${i} differs (${a[i]} vs ${b[i]})`);
    const col = sliced[key].getAttribute('color').array;
    for (let i = 0; i < col.length; i++) {
      if (!Number.isFinite(col[i])) assert.fail(`${key}: non-finite colour at ${i} — a voxel id was unknown to the palette`);
    }
  }
});

test('Mesher refuses a site instead of a world', () => {
  assert.throws(() => new Mesher(site), /VoxelWorld/);
});

test('the viewing deck looks over a low apron, not a hedge wall', () => {
  // The gravel apron raises site.ground under the deck, so read the platform height from
  // the build report instead of re-deriving it from the ground field.
  const deckY = site.structures.deck.y;
  const blocked = [];
  for (let z = DECK.z0 - 6 * RES; z <= DECK.z1 + 6 * RES; z++) {
    for (let x = DECK.x0 - 6 * RES; x <= DECK.x1; x++) {
      if (x >= DECK.x0 && x <= DECK.x1 && z >= DECK.z0 && z <= DECK.z1) continue;
      for (let y = deckY; y <= deckY + 9 * RES; y++) {
        const id = site.world.get(x, y, z);
        if (isFoliage(id)) blocked.push(`(${x},${z}) y${y} ${NAMES[id]}`);
      }
    }
  }
  assert.deepEqual(blocked.slice(0, 8), [], `planting blocks the engawa view (${blocked.length} voxels)`);
  for (const [x, z] of [[DECK.x0 + 2 * RES, DECK.z0 + 2 * RES], [111 * RES, 66 * RES], [DECK.x1 - RES, DECK.z0 + RES]]) {
    for (let k = 1; k <= BODY_HEIGHT; k++) {
      const id = site.world.get(x, deckY + k, z);
      assert.ok(id === T.AIR || id === T.WATER, `deck at (${x},${z}) has ${NAMES[id]} overhead at y+${k}`);
    }
  }
  assert.ok(site.deckClearedVoxels > 0, 'the apron pruning should have cut something');

  // The sight line from the engawa to the pond has to stay open at standing eye height.
  const eye = deckY + 4 * RES;
  const PLANTS = new Set([T.BARK, T.BARK_DARK]);
  const closed = [];
  const from = { x: (DECK.x0 + DECK.x1) / 2, z: (DECK.z0 + DECK.z1) / 2 };
  const to = site.waterBody;
  const steps = Math.max(2, Math.round(Math.hypot(to.x - from.x, to.z - from.z)));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const z = Math.round(from.z + (to.z - from.z) * t);
    for (let y = deckY - RES; y <= eye + 4 * RES; y++) {
      const id = site.world.get(x, y, z);
      if (isFoliage(id) || PLANTS.has(id)) closed.push(`(${x},${z}) y${y} ${NAMES[id]}`);
    }
  }
  assert.deepEqual(closed.slice(0, 8), [], `the engawa sight line is planted over (${closed.length} voxels)`);
});
