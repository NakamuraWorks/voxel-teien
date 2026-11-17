// Voxel palette: id table, colours (already converted to the renderer's linear working
// space) and per-material flags. Imported by world generation, the mesher and the tests,
// so it must stay free of DOM usage.
import * as THREE from 'three';

const DEFS = [
  // name, hex, colour jitter, solid, sound, emissive strength
  ['AIR', 0x000000, 0, false, 'none', 0],
  ['GRASS', 0x6f9450, 0.06, true, 'soft', 0],
  ['MOSS', 0x4e7a45, 0.07, true, 'soft', 0],
  ['MOSS_LIGHT', 0x7fa85c, 0.07, true, 'soft', 0],
  ['DIRT', 0x6b4f3a, 0.05, true, 'soft', 0],
  ['MUD', 0x4a3a2d, 0.04, true, 'soft', 0],
  ['SAND', 0xded4bd, 0.035, true, 'sand', 0],
  ['SAND_RIDGE', 0xc6b99e, 0.03, true, 'sand', 0],
  ['GRAVEL', 0x9a978d, 0.08, true, 'gravel', 0],
  ['STONE', 0x9c9c97, 0.05, true, 'stone', 0],
  ['STONE_DARK', 0x6f7175, 0.05, true, 'stone', 0],
  ['ROCK', 0x8a8c90, 0.07, true, 'stone', 0],
  ['ROCK_DARK', 0x5f6266, 0.07, true, 'stone', 0],
  ['MOSS_ROCK', 0x74876a, 0.08, true, 'stone', 0],
  ['WOOD', 0x9a744c, 0.05, true, 'wood', 0],
  ['WOOD_DARK', 0x5d4531, 0.05, true, 'wood', 0],
  ['PLANK', 0xb98f5f, 0.045, true, 'wood', 0],
  ['BARK', 0x6b4d38, 0.07, true, 'wood', 0],
  ['BARK_DARK', 0x493424, 0.07, true, 'wood', 0],
  ['PINE', 0x2f5d40, 0.09, true, 'soft', 0],
  ['PINE_DARK', 0x234832, 0.09, true, 'soft', 0],
  ['MAPLE_RED', 0xb5372b, 0.1, true, 'soft', 0],
  ['MAPLE_ORANGE', 0xcf6a24, 0.1, true, 'soft', 0],
  ['MAPLE_GOLD', 0xd8a02f, 0.1, true, 'soft', 0],
  ['SHRUB', 0x3f6d3f, 0.08, true, 'soft', 0],
  ['SHRUB_LIGHT', 0x588a4c, 0.08, true, 'soft', 0],
  ['BAMBOO', 0xa9b94e, 0.06, true, 'wood', 0],
  ['BAMBOO_LEAF', 0x5d8a3c, 0.1, true, 'soft', 0],
  ['IRIS', 0x4e7a55, 0.07, true, 'soft', 0],
  ['IRIS_FLOWER', 0x7a5aa8, 0.07, true, 'soft', 0],
  ['REED', 0xb0a06a, 0.08, true, 'soft', 0],
  ['TORII_RED', 0xb33a2c, 0.035, true, 'wood', 0],
  ['TORII_DARK', 0x2f2a2a, 0.03, true, 'wood', 0],
  ['TORII_WHITE', 0xe8e6df, 0.03, true, 'stone', 0],
  ['LANTERN_STONE', 0xb3b2ab, 0.045, true, 'stone', 0],
  ['LANTERN_FIRE', 0xffb45a, 0.02, true, 'stone', 2.4],
  ['LANTERN_PAPER', 0xffe6b0, 0.02, true, 'stone', 1.8],
  ['WATER', 0x2f6f7a, 0, false, 'none', 0],
  ['KOI_ORANGE', 0xe07a2a, 0.05, false, 'none', 0],
  ['KOI_WHITE', 0xeae4d8, 0.05, false, 'none', 0],
  ['KOI_RED', 0xb8422e, 0.05, false, 'none', 0],
  ['LEAF_PILE', 0xa5492a, 0.12, true, 'soft', 0],
  ['WALL_EARTH', 0x8d7a5f, 0.05, true, 'soft', 0],
  ['SHINGLE', 0x4a4a52, 0.05, true, 'wood', 0]
];

export const T = {};
export const NAMES = [];
export const AIR = 0;
const rgbR = [];
const rgbG = [];
const rgbB = [];
const jitter = [];
const solid = [];
const emissive = [];
const sound = [];

DEFS.forEach(([name, hex, j, isSolid, soundKind, emis], index) => {
  T[name] = index;
  NAMES[index] = name;
  const c = index === 0 ? { r: 0, g: 0, b: 0 } : new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  rgbR[index] = c.r;
  rgbG[index] = c.g;
  rgbB[index] = c.b;
  jitter[index] = j;
  solid[index] = isSolid ? 1 : 0;
  emissive[index] = emis;
  sound[index] = soundKind;
});

export const PALETTE_SIZE = DEFS.length;
export const COLOR_R = new Float32Array(rgbR);
export const COLOR_G = new Float32Array(rgbG);
export const COLOR_B = new Float32Array(rgbB);
export const COLOR_JITTER = new Float32Array(jitter);
export const IS_SOLID = new Uint8Array(solid);
export const EMISSIVE = new Float32Array(emissive);
export const SOUND_OF = sound;

/** Types that belong to a "plant" so generation can keep them off paths and water. */
const FOLIAGE = new Set([
  T.PINE, T.PINE_DARK, T.MAPLE_RED, T.MAPLE_ORANGE, T.MAPLE_GOLD,
  T.SHRUB, T.SHRUB_LIGHT, T.BAMBOO, T.BAMBOO_LEAF, T.IRIS, T.IRIS_FLOWER, T.REED
]);

export function isFoliage(id) {
  return FOLIAGE.has(id);
}

export function isSolid(id) {
  return IS_SOLID[id] === 1;
}

export function soundOf(id) {
  return SOUND_OF[id] || 'soft';
}
