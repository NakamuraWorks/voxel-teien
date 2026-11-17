// Living details: koi under the surface, maple leaves drifting down, fireflies at night and
// the expanding ripple rings at the waterspout, the cascades and wherever the walker wades.
import * as THREE from 'three';
import { T } from '../core/palette.js';
import { groundAt, gIndex } from '../garden/terrain.js';
import { makeGlowTexture, makeRippleTexture } from './textures.js';

const KOI_TONES = [0xe07a2a, 0xeae4d8, 0xb8422e, 0xd8a02f];
const LEAF_TONES = [0xb5372b, 0xcf6a24, 0xd8a02f, 0x8e3324];

export function createActors(site, scene) {
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  // ---- koi -------------------------------------------------------------------
  const SEGMENTS = 5;
  const koiCount = site.koi.length;
  const koiMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.36, 0.24, 0.62),
    new THREE.MeshLambertMaterial({ vertexColors: false }),
    Math.max(1, koiCount * SEGMENTS)
  );
  koiMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  koiMesh.castShadow = false;
  const koi = site.koi.map((k, i) => {
    for (let s = 0; s < SEGMENTS; s++) {
      const tone = s === 1 && i % 3 === 0 ? 0xeae4d8 : KOI_TONES[(k.tone + (s % 2)) % KOI_TONES.length];
      koiMesh.setColorAt(i * SEGMENTS + s, tmpColor.setHex(tone, THREE.SRGBColorSpace));
    }
    return { ...k, ang: k.phase, x: k.x, z: k.z, heading: 0 };
  });
  scene.add(koiMesh);

  // ---- falling maple leaves --------------------------------------------------
  const LEAVES = 190;
  const leafMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.5, 0.08, 0.38),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    LEAVES
  );
  leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const leaves = [];
  for (let i = 0; i < LEAVES; i++) {
    leafMesh.setColorAt(i, tmpColor.setHex(LEAF_TONES[i % LEAF_TONES.length], THREE.SRGBColorSpace));
    leaves.push(newLeaf(true));
  }
  scene.add(leafMesh);

  function newLeaf(anywhere) {
    const src = site.leafSources.length
      ? site.leafSources[Math.floor(Math.random() * site.leafSources.length)]
      : { x: 64 + (Math.random() - 0.5) * 60, z: 40 + (Math.random() - 0.5) * 40, y: 24 };
    const x = src.x + (Math.random() - 0.5) * 9;
    const z = src.z + (Math.random() - 0.5) * 9;
    const floor = Math.round(groundAt(site, x, z)) + 1;
    return {
      x,
      z,
      y: anywhere ? floor + Math.random() * 26 : src.y + 2 + Math.random() * 3,
      floor,
      vy: -0.6 - Math.random() * 0.8,
      spin: Math.random() * Math.PI * 2,
      spinRate: (Math.random() - 0.5) * 3.2,
      sway: Math.random() * Math.PI * 2,
      swayAmp: 0.5 + Math.random() * 1.4,
      size: 0.7 + Math.random() * 0.8
    };
  }

  // ---- fireflies -------------------------------------------------------------
  const FLIES = 110;
  const flyPos = new Float32Array(FLIES * 3);
  const flySeed = [];
  for (let i = 0; i < FLIES; i++) {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 30; tries++) {
      x = 14 + Math.random() * 100;
      z = 14 + Math.random() * 100;
      const idx = gIndex(Math.round(x), Math.round(z));
      if (site.pondMask[idx] || site.streamMask[idx] || site.wallMask[idx]) continue;
      break;
    }
    const y = Math.round(groundAt(site, x, z)) + 2 + Math.random() * 4;
    flyPos[i * 3] = x;
    flyPos[i * 3 + 1] = y;
    flyPos[i * 3 + 2] = z;
    flySeed.push({ x, y, z, p: Math.random() * Math.PI * 2, r: 1 + Math.random() * 3.4, s: 0.25 + Math.random() * 0.5 });
  }
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  const flyMat = new THREE.PointsMaterial({
    size: 1.5,
    map: makeGlowTexture(64),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
    toneMapped: false
  });
  const flies = new THREE.Points(flyGeo, flyMat);
  flies.visible = false;
  scene.add(flies);

  // ---- ripple rings ----------------------------------------------------------
  const RINGS = 26;
  const ringMesh = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.42, 0.5, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: makeRippleTexture(128),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false
    }),
    RINGS
  );
  ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ringMesh.renderOrder = 3;
  const rings = [];
  for (let i = 0; i < RINGS; i++) {
    rings.push({ age: 1, life: 1, x: 0, y: -99, z: 0, scale: 1 });
    ringMesh.setColorAt(i, tmpColor.setRGB(0, 0, 0));
  }
  scene.add(ringMesh);
  let ringCursor = 0;

  function ripple(x, y, z, scale = 1, life = 2.2) {
    const r = rings[ringCursor];
    ringCursor = (ringCursor + 1) % RINGS;
    r.age = 0;
    r.life = life;
    r.x = x;
    r.y = y + 0.06;
    r.z = z;
    r.scale = scale;
  }

  // Anchors from generation: the tsukubai spout and the three stream cascades.
  let anchorTimer = 0;
  const anchorList = site.ripples;
  let koiTimer = 1.4;

  function update(dt, elapsed, night, playerPos) {
    // koi
    for (let i = 0; i < koi.length; i++) {
      const k = koi[i];
      k.ang += dt * k.speed * 0.34;
      const wobble = Math.sin(elapsed * 0.7 + k.phase) * 1.2;
      let tx = k.home.x + Math.cos(k.ang) * (k.radius + wobble);
      let tz = k.home.z + Math.sin(k.ang * 1.25) * (k.radius * 0.72 + wobble * 0.5);
      const idx = gIndex(clampCol(tx), clampCol(tz));
      if (!site.pondMask[idx] || site.waterDepth[idx] < 1) {
        tx = k.home.x;
        tz = k.home.z;
        k.ang += 0.9;
      }
      const dx = tx - k.x;
      const dz = tz - k.z;
      k.x += dx * Math.min(1, dt * 0.9);
      k.z += dz * Math.min(1, dt * 0.9);
      if (Math.hypot(dx, dz) > 0.02) k.heading = Math.atan2(dx, dz);
      const surface = k.y + 0.42;
      for (let s = 0; s < SEGMENTS; s++) {
        const back = (s - 1) * 0.55;
        const sway = Math.sin(elapsed * 5.2 * k.speed + s * 0.9 + k.phase) * 0.12 * s;
        dummy.position.set(
          k.x + Math.sin(k.heading) * back + Math.cos(k.heading) * sway,
          surface - Math.abs(s - 1) * 0.03 + Math.sin(elapsed * 1.4 + k.phase) * 0.05,
          k.z + Math.cos(k.heading) * back - Math.sin(k.heading) * sway
        );
        dummy.rotation.set(0, k.heading + Math.PI / 2, Math.sin(elapsed * 2 + k.phase) * 0.08);
        const sc = s === 0 ? 1.25 : s === SEGMENTS - 1 ? 0.7 : 1;
        dummy.scale.set(sc, sc, s === SEGMENTS - 1 ? 1.4 : 1);
        dummy.updateMatrix();
        koiMesh.setMatrixAt(i * SEGMENTS + s, dummy.matrix);
      }
    }
    koiMesh.instanceMatrix.needsUpdate = true;

    koiTimer -= dt;
    if (koiTimer <= 0 && koi.length) {
      koiTimer = 2.4 + Math.random() * 3.4;
      const k = koi[Math.floor(Math.random() * koi.length)];
      ripple(k.x, k.y + 1, k.z, 0.8 + Math.random() * 0.7, 2.6);
    }

    // leaves
    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i];
      l.sway += dt * 1.5;
      l.spin += dt * l.spinRate;
      l.y += l.vy * dt;
      l.x += Math.sin(l.sway) * l.swayAmp * dt + dt * 0.9;
      l.z += Math.cos(l.sway * 0.8) * l.swayAmp * 0.6 * dt;
      if (l.y < l.floor || l.x < 2 || l.z < 2 || l.x > 125 || l.z > 125) {
        leaves[i] = newLeaf(false);
        continue;
      }
      dummy.position.set(l.x, l.y, l.z);
      dummy.rotation.set(l.spin * 0.6, l.spin, Math.sin(l.sway) * 0.8);
      dummy.scale.setScalar(l.size);
      dummy.updateMatrix();
      leafMesh.setMatrixAt(i, dummy.matrix);
    }
    leafMesh.instanceMatrix.needsUpdate = true;

    // fireflies
    const fliesOn = night > 0.25;
    flies.visible = fliesOn;
    flyMat.opacity = fliesOn ? (night - 0.25) * 1.2 : 0;
    if (fliesOn) {
      for (let i = 0; i < FLIES; i++) {
        const f = flySeed[i];
        const t = elapsed * f.s + f.p;
        flyPos[i * 3] = f.x + Math.cos(t) * f.r;
        flyPos[i * 3 + 1] = f.y + Math.sin(t * 1.7) * 0.8 + 0.6;
        flyPos[i * 3 + 2] = f.z + Math.sin(t * 0.8) * f.r;
      }
      flyGeo.getAttribute('position').needsUpdate = true;
    }

    // ripples
    anchorTimer -= dt;
    if (anchorTimer <= 0 && anchorList.length) {
      anchorTimer = 0.75;
      const a = anchorList[Math.floor(Math.random() * anchorList.length)];
      ripple(a.x + (Math.random() - 0.5) * 1.2, a.y, a.z + (Math.random() - 0.5) * 1.2, a.scale, a.period);
    }
    for (let i = 0; i < RINGS; i++) {
      const r = rings[i];
      if (r.y < -90) continue;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.y = -99;
        ringMesh.setColorAt(i, tmpColor.setRGB(0, 0, 0));
        dummy.position.set(0, -99, 0);
        dummy.scale.setScalar(0.001);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        ringMesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      const grow = 0.5 + k * 3.4;
      dummy.position.set(r.x, r.y, r.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(r.scale * grow);
      dummy.updateMatrix();
      ringMesh.setMatrixAt(i, dummy.matrix);
      const fade = Math.pow(1 - k, 1.7) * 0.85;
      ringMesh.setColorAt(i, tmpColor.setRGB(fade, fade, fade * 0.95));
    }
    ringMesh.instanceMatrix.needsUpdate = true;
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
  }

  function clampCol(v) {
    return Math.max(0, Math.min(127, Math.round(v)));
  }

  return { update, ripple, koi, leaves, flies, nightMat: flyMat };
}
