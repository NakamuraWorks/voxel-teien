// Greedy-ish face culling mesher with per-voxel colour jitter and cheap ambient occlusion.
// Produces three geometries: opaque, emissive (lantern light) and water.
import * as THREE from 'three';
import { AIR, T, COLOR_R, COLOR_G, COLOR_B, COLOR_JITTER, IS_SOLID, EMISSIVE } from './palette.js';
import { hash3 } from './noise.js';

// n = cross(u, v) so the (-1,-1) -> (1,-1) -> (1,1) -> (-1,1) quad faces outward.
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], shade: 0.80 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], shade: 0.74 },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], shade: 1.0 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 0.5 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.88 },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], shade: 0.66 }
];
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const AO_TABLE = [0.55, 0.72, 0.87, 1.0];

class GrowBuffer {
  constructor(itemsPerVertex, itemsPerFace) {
    this.perVertex = itemsPerVertex;
    this.perFace = itemsPerFace;
    this.faces = 0;
    this.cap = 4096;
    this.alloc(this.cap);
  }
  alloc(cap) {
    this.pos = new Float32Array(cap * this.perVertex * 3);
    this.nrm = new Float32Array(cap * this.perVertex * 3);
    this.col = new Float32Array(cap * this.perVertex * 3);
    this.extra = new Float32Array(cap * this.perVertex);
    this.idx = new Uint32Array(cap * this.perFace);
  }
  ensure() {
    if (this.faces < this.cap) return;
    this.cap = Math.floor(this.cap * 1.6) + 1024;
    const grow = (src, items) => {
      const next = new src.constructor(this.cap * items);
      next.set(src);
      return next;
    };
    this.pos = grow(this.pos, this.perVertex * 3);
    this.nrm = grow(this.nrm, this.perVertex * 3);
    this.col = grow(this.col, this.perVertex * 3);
    this.extra = grow(this.extra, this.perVertex);
    this.idx = grow(this.idx, this.perFace);
  }
  toGeometry(extraName) {
    const verts = this.faces * 4;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, verts * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(0, verts * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, verts * 3), 3));
    if (extraName) {
      geo.setAttribute(extraName, new THREE.BufferAttribute(this.extra.slice(0, verts), 1));
    }
    geo.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.faces * 6), 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

export class Mesher {
  constructor(world, options = {}) {
    if (!world || typeof world.sizeY !== 'number') {
      throw new TypeError('Mesher needs a VoxelWorld (got an object without sizeY — pass site.world, not site)');
    }
    this.world = world;
    this.ao = options.ao !== false;
    this.opaque = new GrowBuffer(4, 6);
    this.emissive = new GrowBuffer(4, 6);
    this.water = new GrowBuffer(4, 6);
    this.stats = { opaqueFaces: 0, emissiveFaces: 0, waterFaces: 0, visited: 0 };
  }

  /** Solid test used by ambient occlusion: foliage is soft, so it occludes only weakly. */
  occludes(x, y, z) {
    const id = this.world.get(x, y, z);
    if (id === AIR || id === T.WATER) return 0;
    if (IS_SOLID[id] !== 1) return 0;
    return 1;
  }

  buildSlice(y0, y1) {
    const w = this.world;
    const sx = w.sizeX;
    const sz = w.sizeZ;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(w.sizeY, Math.floor(y1)); y++) {
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
          const id = w.get(x, y, z);
          if (id === AIR) continue;
          this.stats.visited++;
          if (id === T.WATER) {
            this.emit(x, y, z, id, this.water, { ao: false, shadeAll: 1, onlyAirNeighbours: true, water: true });
          } else if (EMISSIVE[id] > 0) {
            this.emit(x, y, z, id, this.emissive, { ao: false, shadeAll: 1, onlyAirNeighbours: false });
          } else {
            this.emit(x, y, z, id, this.opaque, { ao: this.ao, shadeAll: null, onlyAirNeighbours: false });
          }
        }
      }
    }
  }

  emit(x, y, z, id, out, opts) {
    const w = this.world;
    const baseR = COLOR_R[id];
    const baseG = COLOR_G[id];
    const baseB = COLOR_B[id];
    const jit = COLOR_JITTER[id];
    const seed = hash3(x * 7 + 1, y * 13 + 3, z * 19 + 5);
    const jr = 1 + (seed - 0.5) * 2 * jit;
    const jg = 1 + (hash3(x, y + 977, z) - 0.5) * 2 * jit;
    const jb = 1 + (hash3(x, y, z + 3301) - 0.5) * 2 * jit;

    for (let f = 0; f < 6; f++) {
      const face = FACES[f];
      const nx = x + face.n[0];
      const ny = y + face.n[1];
      const nz = z + face.n[2];
      const neighbour = w.get(nx, ny, nz);
      if (neighbour === id) continue;
      if (opts.onlyAirNeighbours) {
        if (neighbour !== AIR) continue;
      } else {
        // Transparent neighbours still need the facing surface drawn.
        if (neighbour !== AIR && neighbour !== T.WATER) continue;
        if (IS_SOLID[id] !== 1) continue;
      }

      const shade = opts.shadeAll !== null ? opts.shadeAll : face.shade;
      const vertexShade = [1, 1, 1, 1];
      if (opts.ao) {
        for (let c = 0; c < 4; c++) {
          const [du, dv] = CORNERS[c];
          const s1 = this.occludes(
            x + face.n[0] + face.u[0] * du + face.v[0] * 0,
            y + face.n[1] + face.u[1] * du + face.v[1] * 0,
            z + face.n[2] + face.u[2] * du + face.v[2] * 0
          );
          const s2 = this.occludes(
            x + face.n[0] + face.v[0] * dv,
            y + face.n[1] + face.v[1] * dv,
            z + face.n[2] + face.v[2] * dv
          );
          const co = this.occludes(
            x + face.n[0] + face.u[0] * du + face.v[0] * dv,
            y + face.n[1] + face.u[1] * du + face.v[1] * dv,
            z + face.n[2] + face.u[2] * du + face.v[2] * dv
          );
          const level = s1 && s2 ? 0 : 3 - (s1 + s2 + co);
          vertexShade[c] = AO_TABLE[level];
        }
      }

      const start = out.faces * 4;
      for (let c = 0; c < 4; c++) {
        const [du, dv] = CORNERS[c];
        const i = (start + c) * 3;
        out.pos[i] = x + 0.5 + (face.n[0] + face.u[0] * du + face.v[0] * dv) * 0.5;
        out.pos[i + 1] = y + 0.5 + (face.n[1] + face.u[1] * du + face.v[1] * dv) * 0.5;
        out.pos[i + 2] = z + 0.5 + (face.n[2] + face.u[2] * du + face.v[2] * dv) * 0.5;
        out.nrm[i] = face.n[0];
        out.nrm[i + 1] = face.n[1];
        out.nrm[i + 2] = face.n[2];
        const amount = shade * vertexShade[c];
        out.col[i] = baseR * jr * amount;
        out.col[i + 1] = baseG * jg * amount;
        out.col[i + 2] = baseB * jb * amount;
        out.extra[start + c] = face.n[1] > 0.5 ? 1 : 0;
      }
      const i0 = out.faces * 6;
      const flip = opts.ao && vertexShade[0] + vertexShade[2] > vertexShade[1] + vertexShade[3];
      if (flip) {
        out.idx[i0] = start + 1;
        out.idx[i0 + 1] = start + 2;
        out.idx[i0 + 2] = start + 3;
        out.idx[i0 + 3] = start + 1;
        out.idx[i0 + 4] = start + 3;
        out.idx[i0 + 5] = start + 0;
      } else {
        out.idx[i0] = start + 0;
        out.idx[i0 + 1] = start + 1;
        out.idx[i0 + 2] = start + 2;
        out.idx[i0 + 3] = start + 0;
        out.idx[i0 + 4] = start + 2;
        out.idx[i0 + 5] = start + 3;
      }
      out.faces++;
      out.ensure();
      if (out === this.opaque) this.stats.opaqueFaces++;
      else if (out === this.emissive) this.stats.emissiveFaces++;
      else this.stats.waterFaces++;
    }
  }

  finish() {
    return {
      opaque: this.opaque.toGeometry(),
      emissive: this.emissive.toGeometry(),
      water: this.water.toGeometry('aTop'),
      stats: this.stats
    };
  }
}

/** One-shot helper used by tests and small maps. */
export function buildGeometries(world, options) {
  const mesher = new Mesher(world, options);
  mesher.buildSlice(0, world.sizeY);
  return mesher.finish();
}

/**
 * Contiguous integer row ranges covering [0, sizeY). Loading uses these so painting the
 * progress bar between slices cannot skip a row, which a fractional boundary would.
 */
export function sliceRanges(sizeY, slices) {
  const out = [];
  for (let i = 0; i < slices; i++) {
    const y0 = Math.floor((i * sizeY) / slices);
    const y1 = i === slices - 1 ? sizeY : Math.floor(((i + 1) * sizeY) / slices);
    if (y1 > y0) out.push({ y0, y1 });
  }
  return out;
}
