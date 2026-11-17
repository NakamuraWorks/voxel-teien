// Voxel storage + primitive painting helpers. Pure data: no DOM, no three.js scene code,
// so the same generator can run inside node tests.
import { AIR, IS_SOLID, T } from './palette.js';
import { clamp } from './noise.js';

export class VoxelWorld {
  constructor(sizeX, sizeY, sizeZ) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.sizeZ = sizeZ;
    this.data = new Uint8Array(sizeX * sizeY * sizeZ);
    // One flag per column: a structure or tree already claims this ground column.
    this.claimed = new Uint8Array(sizeX * sizeZ);
    this.changes = 0;
  }

  index(x, y, z) {
    return (y * this.sizeZ + z) * this.sizeX + x;
  }

  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sizeX && y < this.sizeY && z < this.sizeZ;
  }

  /** Out-of-bounds reads return AIR so the mesher can render the outer skin. */
  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sizeX || y >= this.sizeY || z >= this.sizeZ) return AIR;
    return this.data[(y * this.sizeZ + z) * this.sizeX + x];
  }

  set(x, y, z, id) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sizeX || y >= this.sizeY || z >= this.sizeZ) return false;
    const i = (y * this.sizeZ + z) * this.sizeX + x;
    if (this.data[i] === id) return false;
    this.data[i] = id;
    this.changes++;
    return true;
  }

  fill(x0, x1, y0, y1, z0, z1, id) {
    const xa = Math.round(Math.min(x0, x1));
    const xb = Math.round(Math.max(x0, x1));
    const ya = Math.round(Math.min(y0, y1));
    const yb = Math.round(Math.max(y0, y1));
    const za = Math.round(Math.min(z0, z1));
    const zb = Math.round(Math.max(z0, z1));
    for (let y = ya; y <= yb; y++) {
      for (let z = za; z <= zb; z++) {
        for (let x = xa; x <= xb; x++) this.set(x, y, z, id);
      }
    }
  }

  /** Solid check that treats out-of-bounds below the world as solid so nothing floats away. */
  isSolid(x, y, z) {
    if (y < 0) return true;
    if (x < 0 || z < 0 || x >= this.sizeX || z >= this.sizeZ) return true;
    if (y >= this.sizeY) return false;
    return IS_SOLID[this.data[(y * this.sizeZ + z) * this.sizeX + x]] === 1;
  }

  /** Highest solid voxel y in a column, or -1. */
  topY(x, z, fromY = this.sizeY - 1) {
    for (let y = fromY; y >= 0; y--) {
      if (this.isSolid(x, y, z)) return y;
    }
    return -1;
  }

  isWater(x, y, z) {
    return this.get(x, y, z) === T.WATER;
  }

  /** Claim ground columns (used to keep trees and structures apart). */
  claim(cx, cz, radius) {
    const r = Math.ceil(radius);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const x = Math.round(cx + dx);
        const z = Math.round(cz + dz);
        if (x < 0 || z < 0 || x >= this.sizeX || z >= this.sizeZ) return false;
        if (this.claimed[z * this.sizeX + x]) return false;
      }
    }
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const x = Math.round(cx + dx);
        const z = Math.round(cz + dz);
        this.claimed[z * this.sizeX + x] = 1;
      }
    }
    return true;
  }

  isClaimed(cx, cz, radius = 0) {
    const r = Math.ceil(radius);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const x = Math.round(cx + dx);
        const z = Math.round(cz + dz);
        if (x < 0 || z < 0 || x >= this.sizeX || z >= this.sizeZ) return true;
        if (this.claimed[z * this.sizeX + x]) return true;
      }
    }
    return false;
  }

  /** Ground is walkable when it is solid, its top is not foliage, and there is headroom. */
  isWalkable(cx, cz, clearance = 6) {
    const x = Math.round(clamp(cx, 0, this.sizeX - 1));
    const z = Math.round(clamp(cz, 0, this.sizeZ - 1));
    const y = this.topY(x, z);
    if (y < 0) return false;
    if (this.get(x, y, z) === T.WATER) return false;
    for (let k = 1; k <= clearance; k++) {
      if (this.isSolid(x, y + k, z)) return false;
    }
    return true;
  }

  /** Bounding box of everything solid, handy for shadow/frustum sizing. */
  solidBounds() {
    const min = [this.sizeX, this.sizeY, this.sizeZ];
    const max = [0, 0, 0];
    for (let y = 0; y < this.sizeY; y++) {
      for (let z = 0; z < this.sizeZ; z++) {
        for (let x = 0; x < this.sizeX; x++) {
          if (!IS_SOLID[this.data[(y * this.sizeZ + z) * this.sizeX + x]]) continue;
          if (x < min[0]) min[0] = x;
          if (y < min[1]) min[1] = y;
          if (z < min[2]) min[2] = z;
          if (x > max[0]) max[0] = x;
          if (y > max[1]) max[1] = y;
          if (z > max[2]) max[2] = z;
        }
      }
    }
    return { min, max };
  }
}
