// Procedural textures (no binary assets in this project): tiled water normals, soft glow
// sprites for fireflies and expanding ripple rings.
import * as THREE from 'three';

/** Tileable tangent-space normal map built from a handful of crossing wave trains. */
export function makeWaterNormals(size = 128) {
  const data = new Uint8Array(size * size * 4);
  const waves = [
    { fx: 1, fz: 0, amp: 0.42, speed: 1.0 },
    { fx: 0, fz: 1, amp: 0.36, speed: 0.8 },
    { fx: 1, fz: 1, amp: 0.2, speed: 1.4 },
    { fx: 2, fz: -1, amp: 0.13, speed: 1.9 },
    { fx: -1, fz: 2, amp: 0.1, speed: 2.3 }
  ];
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (z / size) * Math.PI * 2;
      let dx = 0;
      let dz = 0;
      for (const w of waves) {
        const phase = u * w.fx + v * w.fz;
        dx += Math.cos(phase) * w.amp * w.fx;
        dz += Math.cos(phase) * w.amp * w.fz;
      }
      const nx = -dx * 0.45;
      const ny = -dz * 0.45;
      const len = Math.hypot(nx, 1, ny);
      const i = (z * size + x) * 4;
      data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function radialCanvas(size, stops) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function makeGlowTexture(size = 64) {
  const tex = new THREE.CanvasTexture(
    radialCanvas(size, [
      [0, 'rgba(255,255,255,1)'],
      [0.25, 'rgba(255,236,170,0.55)'],
      [1, 'rgba(255,200,120,0)']
    ])
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Thin annulus, used for the surface ripples that spread from koi and waterspouts. */
export function makeRippleTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  for (const [radius, width, alpha] of [
    [0.44, 0.035, 0.95],
    [0.32, 0.028, 0.55],
    [0.2, 0.022, 0.3
    ]
  ]) {
    ctx.beginPath();
    ctx.arc(c, c, size * radius, 0, Math.PI * 2);
    ctx.lineWidth = size * width;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.stroke();
  }
  const fade = ctx.createRadialGradient(c, c, size * 0.1, c, c, size * 0.5);
  fade.addColorStop(0, 'rgba(0,0,0,0.85)');
  fade.addColorStop(0.45, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
