import test from 'node:test';
import assert from 'node:assert/strict';

// Guards the RES=2 geometry pass: every built member must keep a cross-section that
// scales with RES (a member left at a literal 1 voxel reads as a hairline sliver once the
// grid doubles), curved members must stay joined, and nothing may end up floating.
import { gIndex } from '../src/garden/terrain.js';

const { generateGarden } = await import('../src/garden/generate.js');
const { IS_SOLID, NAMES, T } = await import('../src/core/palette.js');
const { RES, SZ, BRIDGE } = await import('../src/garden/layout.js');

const R = RES;
const site = generateGarden();
const W = site.world;
const get = (x, y, z) => W.get(Math.round(x), Math.round(y), Math.round(z));
const surface = (x, z) => Math.round(site.ground[gIndex(Math.round(x), Math.round(z))]) + 1;
const isOneOf = (...ids) => (id) => ids.includes(id);

/** Length of the contiguous run of `pred` voxels through (x,y,z) along `axis`. */
function runThrough(x, y, z, axis, pred, limit = 60) {
  const at = (k) => {
    const p = [x, y, z];
    p[axis] += k;
    return pred(W.get(...p));
  };
  let n = 1;
  for (const d of [-1, 1]) {
    for (let k = d; Math.abs(k) <= limit; k += d) {
      if (!at(k)) break;
      n++;
    }
  }
  return n;
}

test('torii posts are square in plan and scale with RES', () => {
  const cx = 65 * R;
  const cz = 114 * R;
  const base = surface(cx, cz);
  const red = isOneOf(T.TORII_RED);
  for (const side of [-1, 1]) {
    const px = cx + side * 5 * R;
    const mid = base + 6 * R; // mid-shaft, clear of the footing and the nuki band
    assert.ok(runThrough(px, mid, cz, 0, red) >= 2 * R, `post at ${px} is ${runThrough(px, mid, cz, 0, red)} wide, want >= ${2 * R}`);
    assert.ok(runThrough(px, mid, cz, 2, red) >= 2 * R, 'post is thin in plan');
  }
});

test('torii roof is a thick, unbroken sweep', () => {
  const cx = 65 * R;
  const cz = 114 * R;
  const base = surface(cx, cz);
  const roof = isOneOf(T.TORII_RED, T.TORII_DARK);
  const postTop = base + 2 + 10 * R;
  assert.ok(runThrough(cx, postTop + 2 * R, cz, 1, roof) >= 2 * R, 'kasagi + shimaki thinner than 2R');
  const reach = 5 * R + 2 * R;
  const gaps = [];
  for (let dx = -reach; dx <= reach; dx++) {
    let found = false;
    for (let y = postTop - R; y <= postTop + 5 * R; y++) {
      if (roof(get(cx + dx, y, cz))) {
        found = true;
        break;
      }
    }
    if (!found) gaps.push(cx + dx);
  }
  assert.deepEqual(gaps, [], `kasagi has ${gaps.length} gaps along its run`);
});

test('torii kasagi crowns the shimaki, not the other way round', () => {
  const cx = 65 * R;
  const cz = 114 * R;
  const base = surface(cx, cz);
  const stack = [];
  for (let y = base + 10 * R; y <= base + 16 * R; y++) {
    const id = get(cx, y, cz);
    if (id === T.TORII_RED || id === T.TORII_DARK) stack.push(id);
  }
  assert.ok(stack.length >= 2 * R, `roof stack at the centre is ${stack.length} voxels, want >= ${2 * R}`);
  assert.equal(stack[stack.length - 1], T.TORII_RED, 'the top of the roof is not the kasagi');
  assert.ok(stack.indexOf(T.TORII_DARK) >= 0 && stack.lastIndexOf(T.TORII_DARK) < stack.lastIndexOf(T.TORII_RED),
    'the dark shimaki is not the lower of the two courses');
});

test('lantern hibukuro carries a lit panel on all four faces', () => {
  // The two lantern patterns box the fire differently (2R+1 vs 2R across), so each face is
  // probed across the two columns that could carry it.
  const faces = [
    (p) => [p[0] + R, p[1]], (p) => [p[0] + R - 1, p[1]],
    (p) => [p[0] - R, p[1]], (p) => [p[0] - R + 1, p[1]],
    (p) => [p[0], p[1] + R], (p) => [p[0], p[1] + R - 1],
    (p) => [p[0], p[1] - R], (p) => [p[0], p[1] - R + 1]
  ];
  for (const [lx, lz] of [[82 * R, 40 * R], [47 * R, 84 * R], [67 * R, 42 * R], [30 * R, 50 * R], [58 * R, 38 * R]]) {
    const base = surface(lx, lz);
    for (const side of [0, 1, 2, 3]) {
      const probes = [faces[side * 2], faces[side * 2 + 1]];
      const lit = probes.some((f) => {
        const [px, pz] = f([lx, lz]);
        for (let y = base; y <= base + 14 * R; y++) if (get(px, y, pz) === T.LANTERN_FIRE) return true;
        return false;
      });
      assert.ok(lit, `lantern at (${lx},${lz}) has no fire panel on face ${side}`);
    }
  }
});

test('stone lantern poles are R wide, not a single voxel', () => {
  const red = isOneOf(T.LANTERN_STONE);
  for (const [lx, lz] of [[82 * R, 40 * R], [47 * R, 84 * R], [67 * R, 42 * R]]) {
    const base = surface(lx, lz);
    const y = base + 2 * R; // inside the sao, above the footing
    const w = Math.min(runThrough(lx, y, lz, 0, red), runThrough(lx, y, lz, 2, red));
    assert.ok(w >= R, `lantern at (${lx},${lz}) pole is ${w} wide, want >= ${R}`);
  }
  for (const [lx, lz] of [[30 * R, 50 * R], [58 * R, 38 * R]]) {
    const base = surface(lx, lz);
    const y = base + 2 * R;
    const w = Math.min(runThrough(lx, y, lz, 0, red), runThrough(lx, y, lz, 2, red));
    assert.ok(w >= R, `yukimi at (${lx},${lz}) pole is ${w} wide, want >= ${R}`);
  }
});

test('tsukubai holds a water bowl, not one water voxel', () => {
  const cx = 49 * R;
  const cz = 86 * R;
  let water = 0;
  for (let z = cz - 3 * R; z <= cz + 3 * R; z++) {
    for (let x = cx - 3 * R; x <= cx + 3 * R; x++) {
      for (let y = surface(cx, cz); y <= surface(cx, cz) + 4 * R; y++) if (get(x, y, z) === T.WATER) water++;
    }
  }
  assert.ok(water >= 2 * R * R, `bowl holds ${water} water voxels, want >= ${2 * R * R}`);
});

test('earthen wall carries an R-thick tile cap', () => {
  const x = 100;
  const z = SZ - 3;
  const shingle = isOneOf(T.SHINGLE);
  let best = 0;
  for (let y = 0; y < site.size.y; y++) best = Math.max(best, runThrough(x, y, z, 1, shingle));
  assert.ok(best >= R, `tile cap is ${best} thick, want >= ${R}`);
});

test('bamboo fence is a R-thick panel, not a sheet', () => {
  const x = 206; // mid-panel: posts land every 4R from x0=202R
  const z = 88 * R;
  const base = surface(x, z);
  const bamboo = isOneOf(T.BAMBOO);
  assert.ok(runThrough(x, base + 2 * R, z, 2, bamboo) >= R, 'fence panel is thinner than R');
});

test('bridge deck and handrail are R thick', () => {
  const wood = isOneOf(T.WOOD);
  let deck = 0;
  let rail = 0;
  for (let w = -2; w <= 2; w++) {
    const z = BRIDGE.z + w;
    for (let y = 0; y < site.size.y; y++) {
      const v = runThrough(BRIDGE.x, y, z, 1, wood);
      if (v >= R) {
        deck = Math.max(deck, v);
        rail = Math.max(rail, runThrough(BRIDGE.x, y, z, 0, wood));
      }
    }
  }
  assert.ok(deck >= R, `plank is ${deck} thick, want >= ${R}`);
  assert.ok(rail >= R, `handrail is ${rail} thick, want >= ${R}`);
});

test('nothing in the garden floats', () => {
  const { sizeX, sizeY, sizeZ } = W;
  const N = sizeX * sizeY * sizeZ;
  const slice = sizeX * sizeZ;
  const seen = new Uint8Array(N);
  let solids = 0;
  for (let i = 0; i < N; i++) if (IS_SOLID[W.data[i]] === 1) solids++;
  const stack = new Int32Array(solids);
  let sp = 0;
  const seedY = Math.floor(sizeY / 3);
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      for (let y = 0; y <= seedY; y++) {
        const i = (y * sizeZ + z) * sizeX + x;
        if (seen[i] || IS_SOLID[W.data[i]] !== 1) continue;
        seen[i] = 1;
        stack[sp++] = i;
      }
    }
  }
  const DX = [1, -1, 0, 0, 0, 0];
  const DY = [0, 0, 1, -1, 0, 0];
  const DZ = [0, 0, 0, 0, 1, -1];
  while (sp > 0) {
    const i = stack[--sp];
    const y = Math.floor(i / slice);
    const rest = i - y * slice;
    const z = Math.floor(rest / sizeX);
    const x = rest - z * sizeX;
    for (let k = 0; k < 6; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      const nz = z + DZ[k];
      if (nx < 0 || ny < 0 || nz < 0 || nx >= sizeX || ny >= sizeY || nz >= sizeZ) continue;
      const j = (ny * sizeZ + nz) * sizeX + nx;
      if (seen[j] || IS_SOLID[W.data[j]] !== 1) continue;
      seen[j] = 1;
      stack[sp++] = j;
    }
  }
  const floating = new Map();
  for (let i = 0; i < N; i++) {
    if (seen[i] || IS_SOLID[W.data[i]] !== 1) continue;
    const name = NAMES[W.data[i]];
    floating.set(name, (floating.get(name) || 0) + 1);
  }
  assert.deepEqual([...floating.entries()], [], 'detached geometry left in the garden');
});
