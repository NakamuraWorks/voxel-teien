// Renderer, sky, lights and the day/night cycle. Everything static from the mesher is
// turned into three meshes here: opaque (shadowed), emissive (lantern fire) and water.
import * as THREE from 'three';
import { makeWaterNormals } from './textures.js';
import { WATER_TOP, RES } from '../garden/layout.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSun;
  uniform vec3 uSunColor;
  uniform vec3 uCam;
  varying vec3 vWorld;
  void main() {
    vec3 dir = normalize(vWorld - uCam);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.62));
    float sd = max(dot(dir, normalize(uSun)), 0.0);
    col += uSunColor * pow(sd, 320.0) * 3.0;
    col += uSunColor * pow(sd, 7.0) * 0.18;
    col += uSunColor * pow(sd, 1.6) * 0.05;
    col = mix(col, uGround, smoothstep(0.02, -0.16, dir.y));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Circular keyframes over the day (t=0 is midnight). Colours are sRGB hex. */
const DAY_STOPS = [
  { t: 0.0, zen: 0x05070f, hor: 0x0c1120, ground: 0x05060a, sun: 0x2a3a63, sunI: 0.05, hemiI: 0.14, ambI: 0.16, fog: 0.0092 },
  { t: 0.19, zen: 0x0a1024, hor: 0x26243c, ground: 0x090a12, sun: 0x4a4a7a, sunI: 0.08, hemiI: 0.18, ambI: 0.2, fog: 0.0105 },
  { t: 0.25, zen: 0x2c4a70, hor: 0xd8794a, ground: 0x2a2118, sun: 0xffa860, sunI: 1.15, hemiI: 0.42, ambI: 0.3, fog: 0.0122 },
  { t: 0.33, zen: 0x4d80ae, hor: 0xa8c6d8, ground: 0x33352c, sun: 0xffe4c0, sunI: 2.25, hemiI: 0.62, ambI: 0.34, fog: 0.0085 },
  { t: 0.5, zen: 0x4a86c4, hor: 0xcfe0ea, ground: 0x3c4038, sun: 0xffffff, sunI: 2.95, hemiI: 0.72, ambI: 0.36, fog: 0.0074 },
  { t: 0.66, zen: 0x5a86b4, hor: 0xe0cfa8, ground: 0x3e3a2e, sun: 0xffe0b0, sunI: 2.3, hemiI: 0.62, ambI: 0.34, fog: 0.0086 },
  { t: 0.755, zen: 0x3b4a78, hor: 0xe0683a, ground: 0x2b1d18, sun: 0xff8a3c, sunI: 1.2, hemiI: 0.44, ambI: 0.3, fog: 0.0128 },
  { t: 0.83, zen: 0x1b2440, hor: 0x4a2f45, ground: 0x121018, sun: 0x6a4a6a, sunI: 0.22, hemiI: 0.22, ambI: 0.22, fog: 0.0112 },
  { t: 1.0, zen: 0x05070f, hor: 0x0c1120, ground: 0x05060a, sun: 0x2a3a63, sunI: 0.05, hemiI: 0.14, ambI: 0.16, fog: 0.0092 }
];

const cA = new THREE.Color();
const cB = new THREE.Color();
const outColor = new THREE.Color();
// The night keyframes are near black, so light alone cannot lift them; the moon tint does.
const MOON = new THREE.Color().setHex(0x9db8dc, THREE.SRGBColorSpace);
const NIGHT_GROUND = new THREE.Color().setHex(0x2a3038, THREE.SRGBColorSpace);

function sampleDay(dayT, out) {
  const t = ((dayT % 1) + 1) % 1;
  let i = 0;
  while (i < DAY_STOPS.length - 2 && DAY_STOPS[i + 1].t < t) i++;
  const a = DAY_STOPS[i];
  const b = DAY_STOPS[i + 1];
  const k = (t - a.t) / (b.t - a.t || 1);
  cA.setHex(a.zen, THREE.SRGBColorSpace);
  cB.setHex(b.zen, THREE.SRGBColorSpace);
  out.zenith.lerpColors(cA, cB, k);
  cA.setHex(a.hor, THREE.SRGBColorSpace);
  cB.setHex(b.hor, THREE.SRGBColorSpace);
  out.horizon.lerpColors(cA, cB, k);
  cA.setHex(a.ground, THREE.SRGBColorSpace);
  cB.setHex(b.ground, THREE.SRGBColorSpace);
  out.ground.lerpColors(cA, cB, k);
  cA.setHex(a.sun, THREE.SRGBColorSpace);
  cB.setHex(b.sun, THREE.SRGBColorSpace);
  out.sun.lerpColors(cA, cB, k);
  out.sunI = a.sunI + (b.sunI - a.sunI) * k;
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * k;
  out.ambI = a.ambI + (b.ambI - a.ambI) * k;
  // Keyframe densities are per design voxel; world voxels are RES times finer.
  out.fog = (a.fog + (b.fog - a.fog) * k) / RES;
  return out;
}

export function sunDirection(dayT, target) {
  const a = (((dayT % 1) + 1) % 1 - 0.25) * Math.PI * 2;
  return target.set(Math.cos(a), Math.sin(a), 0.32 * Math.cos(a) + 0.18).normalize();
}

export function createStage(canvas, site, geoms) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9fb3c0, 0.0085 / RES);

  const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.35, 900 * RES);
  camera.rotation.order = 'YXZ';

  // ---- static geometry -------------------------------------------------------
  const opaqueMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const opaque = new THREE.Mesh(geoms.opaque, opaqueMat);
  opaque.castShadow = true;
  opaque.receiveShadow = true;
  scene.add(opaque);

  const emissiveMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const emissive = new THREE.Mesh(geoms.emissive, emissiveMat);
  scene.add(emissive);

  const waterGeo = geoms.water;
  const pos = waterGeo.getAttribute('position');
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = (pos.getX(i) * 0.09) / RES;
    uvs[i * 2 + 1] = (pos.getZ(i) * 0.09) / RES;
  }
  waterGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const waterNormalMap = makeWaterNormals(128);
  waterNormalMap.repeat.set(1, 1);
  const waterMat = new THREE.MeshPhongMaterial({
    color: new THREE.Color().setHex(0x2b6b74, THREE.SRGBColorSpace),
    transparent: true,
    opacity: 0.82,
    shininess: 120,
    specular: new THREE.Color().setHex(0xbfe6ee, THREE.SRGBColorSpace),
    normalMap: waterNormalMap,
    normalScale: new THREE.Vector2(1.5, 1.5),
    depthWrite: false,
    vertexColors: true
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.renderOrder = 2;
  scene.add(water);

  // ---- sky dome --------------------------------------------------------------
  const skyUniforms = {
    uZenith: { value: new THREE.Color(0x4a86c4) },
    uHorizon: { value: new THREE.Color(0xcfe0ea) },
    uGround: { value: new THREE.Color(0x3c4038) },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(0xffffff) },
    uCam: { value: new THREE.Vector3() }
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(480 * RES, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    })
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // ---- lights ----------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xbcd6ea, 0x39402f, 0.62);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x8fa4b8, 0.32);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -58 * RES;
  sun.shadow.camera.right = 58 * RES;
  sun.shadow.camera.top = 58 * RES;
  sun.shadow.camera.bottom = -58 * RES;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320 * RES;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.55 * RES;
  sun.target = new THREE.Object3D();
  scene.add(sun, sun.target);

  // A handful of real lights so the lanterns pool the dark with warm colour.
  const lanternLights = [];
  const picks = site.lanterns.filter((_, i) => i % 2 === 0).slice(0, 5);
  for (const l of picks) {
    const light = new THREE.PointLight(new THREE.Color().setHex(0xffb45a, THREE.SRGBColorSpace), 0, l.radius * 1.6, 1.7);
    light.position.set(l.x, l.y, l.z);
    scene.add(light);
    lanternLights.push(light);
  }

  // ---- day cycle state -------------------------------------------------------
  const day = {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    ground: new THREE.Color(),
    sun: new THREE.Color(),
    sunI: 2,
    hemiI: 0.6,
    ambI: 0.3,
    fog: 0.0085
  };
  const sunDir = new THREE.Vector3(0, 1, 0);
  const state = { dayT: 0.27, lanternsOn: true, night: 0, elapsed: 0 };
  const shadowAnchor = new THREE.Vector3(1e6, 0, 0);

  function applyDay() {
    sampleDay(state.dayT, day);
    sunDirection(state.dayT, sunDir);
    const elevation = sunDir.y;
    state.night = THREE.MathUtils.smoothstep(-elevation, -0.12, 0.22);

    sun.color.copy(day.sun);
    sun.intensity = day.sunI * THREE.MathUtils.clamp(elevation * 4 + 0.25, 0, 1.25);
    hemi.intensity = day.hemiI + state.night * 0.22;
    hemi.color.copy(day.horizon).lerp(MOON, state.night * 0.8);
    hemi.groundColor.copy(day.ground).lerp(NIGHT_GROUND, state.night * 0.7);
    ambient.intensity = day.ambI + state.night * 0.16;
    ambient.color.copy(day.zenith).lerp(day.horizon, 0.4).lerp(MOON, state.night * 0.7);

    skyUniforms.uZenith.value.copy(day.zenith);
    skyUniforms.uHorizon.value.copy(day.horizon);
    skyUniforms.uGround.value.copy(day.ground);
    skyUniforms.uSunColor.value.copy(day.sun);
    skyUniforms.uSun.value.copy(sunDir);

    scene.fog.color.copy(day.horizon).lerp(day.zenith, 0.35).lerp(MOON, state.night * 0.22);
    scene.fog.density = day.fog;

    const glow = 0.55 + state.night * 1.5;
    emissiveMat.color.setScalar(state.lanternsOn ? glow : 0.32);
    const lampI = state.lanternsOn ? state.night * 42 : 0;
    for (const light of lanternLights) light.intensity = lampI;
  }

  function update(dt, focus) {
    state.elapsed += dt;
    applyDay();
    sky.position.copy(camera.position);
    skyUniforms.uCam.value.copy(camera.position);

    waterNormalMap.offset.x += dt * 0.014;
    waterNormalMap.offset.y += dt * 0.009;

    // Keep the shadow texels stable by snapping the follow point to a coarse lattice.
    const ax = Math.round(focus.x / (2 * RES)) * (2 * RES);
    const ay = Math.round(focus.y / (2 * RES)) * (2 * RES);
    const az = Math.round(focus.z / (2 * RES)) * (2 * RES);
    if (Math.abs(ax - shadowAnchor.x) > 3 * RES || Math.abs(az - shadowAnchor.z) > 3 * RES) {
      shadowAnchor.set(ax, ay, az);
    }
    sun.position.set(
      shadowAnchor.x + sunDir.x * 140 * RES,
      shadowAnchor.y + Math.max(sunDir.y, 0.12) * 140 * RES,
      shadowAnchor.z + sunDir.z * 140 * RES
    );
    sun.target.position.copy(shadowAnchor);
    sun.target.updateMatrixWorld();
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  applyDay();

  return {
    renderer,
    scene,
    camera,
    sun,
    hemi,
    water,
    emissive,
    lanternLights,
    sunDir,
    state,
    day,
    update,
    resize,
    applyDay,
    waterTop: WATER_TOP
  };
}
