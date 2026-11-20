import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Wind } from 'lucide-react';

interface ThreeAirLabProps {
  liveAqi: number;
  cityName: string;
  windSpeedKmh: number;
}

type FanMode = 'off' | 'sleep' | 'turbo';
type CameraPreset = 'hero' | 'core' | 'overhead';

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _vec3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _targetCamPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();

function createPerforatedTexture(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, 256, 256);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#d4d4d4';
  bCtx.fillRect(0, 0, 256, 256);

  for (let y = 8; y < 256; y += 16) {
    for (let x = 8; x < 256; x += 16) {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();

      bCtx.fillStyle = '#202020';
      bCtx.beginPath();
      bCtx.arc(x, y, 3.4, 0, Math.PI * 2);
      bCtx.fill();
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 2);

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(4, 2);

  return { map, bump };
}

function createPleatedHepaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  for (let x = 0; x < 256; x += 8) {
    ctx.fillStyle = x % 16 === 0 ? '#e2e8f0' : '#94a3b8';
    ctx.fillRect(x, 0, 4, 128);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x + 4, 0, 4, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.55)');
  grad.addColorStop(0.6, 'rgba(15, 23, 42, 0.2)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export const ThreeAirLab: React.FC<ThreeAirLabProps> = ({ liveAqi, cityName, windSpeedKmh }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [dockOpen, setDockOpen] = useState(true);
  const [explode, setExplode] = useState(0);
  const [fanMode, setFanMode] = useState<FanMode>('turbo');
  const [simAqi, setSimAqi] = useState<number>(liveAqi || 150);
  const [preset, setPreset] = useState<CameraPreset>('hero');

  // Sync mutable UI parameters into refs so the WebGL loop never tears down
  const simStateRef = useRef({
    explode: 0,
    fanMode: 'turbo' as FanMode,
    aqi: liveAqi || 150,
    wind: windSpeedKmh || 8,
    preset: 'hero' as CameraPreset,
    presetDirty: false,
  });

  useEffect(() => {
    setSimAqi(liveAqi || 150);
    simStateRef.current.aqi = liveAqi || 150;
  }, [liveAqi]);

  useEffect(() => {
    simStateRef.current.explode = explode;
  }, [explode]);

  useEffect(() => {
    simStateRef.current.fanMode = fanMode;
  }, [fanMode]);

  useEffect(() => {
    simStateRef.current.aqi = simAqi;
  }, [simAqi]);

  useEffect(() => {
    simStateRef.current.wind = windSpeedKmh || 8;
  }, [windSpeedKmh]);

  useEffect(() => {
    simStateRef.current.preset = preset;
    simStateRef.current.presetDirty = true;
  }, [preset]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h' && document.activeElement?.tagName !== 'INPUT') {
        setDockOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 1200;
    const height = container.clientHeight || 620;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color('#dbe4ee');
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(bgColor.getHex(), 0.045);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 120);
    camera.position.set(4.8, 3.1, 6.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 2.5;
    controls.maxDistance = 14;
    controls.addEventListener('start', () => {
      simStateRef.current.presetDirty = false;
    });

    // Studio warm key + cool hemisphere fill
    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(6, 9, 5);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 25;
      keyLight.shadow.camera.left = -5;
      keyLight.shadow.camera.right = 5;
      keyLight.shadow.camera.top = 5;
      keyLight.shadow.camera.bottom = -5;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x64748b, 0.95);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0x99f6e4, 0.7);
    rimLight.position.set(-5, 4, -4);
    scene.add(rimLight);

    // Architectural studio floor plinth + subtle radial grid
    const floorGeo = new THREE.CircleGeometry(18, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.88,
      metalness: 0.05,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = !isSoftwareGl;
    scene.add(floorMesh);

    const plinthRingGeo = new THREE.CylinderGeometry(3.2, 3.35, 0.06, 48);
    const plinthRingMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.55,
      metalness: 0.1,
    });
    const plinth = new THREE.Mesh(plinthRingGeo, plinthRingMat);
    plinth.position.y = 0.03;
    plinth.receiveShadow = !isSoftwareGl;
    scene.add(plinth);

    const shadowTex = createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const { map: perfMap, bump: perfBump } = createPerforatedTexture();
    perfMap.anisotropy = maxAniso;
    perfBump.anisotropy = maxAniso;
    const hepaTex = createPleatedHepaTexture();
    hepaTex.anisotropy = maxAniso;

    // ------------------------------------------------------------------
    // MODEL 1: Composite 8-part HEPA-13 Air Purifier Tower (bottom-center pivot)
    // ------------------------------------------------------------------
    const purifierGroup = new THREE.Group();
    purifierGroup.position.set(0, 0.06, 0);
    scene.add(purifierGroup);

    const purifierShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75), shadowMat);
    purifierShadow.rotation.x = -Math.PI / 2;
    purifierShadow.position.y = 0.015;
    purifierGroup.add(purifierShadow);

    // Part 1: Beveled base plinth
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.35,
    });
    const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.62, 0.16, 36), baseMat);
    baseMesh.position.y = 0.08;
    baseMesh.castShadow = !isSoftwareGl;
    purifierGroup.add(baseMesh);

    // Part 2: Perforated outer intake drum
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: perfMap,
      bumpMap: perfBump,
      bumpScale: 0.015,
      roughness: 0.62,
      metalness: 0.08,
    });
    const intakeDrum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.54, 0.54, 1.05, 36, 1, false),
      shellMat,
    );
    intakeDrum.position.y = 0.68;
    intakeDrum.castShadow = !isSoftwareGl;
    purifierGroup.add(intakeDrum);

    // Part 3: Inner HEPA-13 pleated cartridge (moves in Exploded View)
    const hepaMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: hepaTex,
      roughness: 0.85,
      metalness: 0.02,
    });
    const hepaCore = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.92, 32), hepaMat);
    hepaCore.position.y = 0.68;
    purifierGroup.add(hepaCore);

    // Part 4: Anodized metallic collar ring
    const metalCollarMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.22,
      metalness: 0.9,
    });
    const collarRing = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.032, 16, 48), metalCollarMat);
    collarRing.rotation.x = Math.PI / 2;
    collarRing.position.y = 1.22;
    purifierGroup.add(collarRing);

    // Part 5: Top Lathe shroud housing (moves in Exploded View)
    const shroudPts = [
      new THREE.Vector2(0.44, 0),
      new THREE.Vector2(0.54, 0.04),
      new THREE.Vector2(0.54, 0.34),
      new THREE.Vector2(0.49, 0.42),
      new THREE.Vector2(0.38, 0.42),
    ];
    const shroudGeo = new THREE.LatheGeometry(shroudPts, 36);
    const shroudMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.28,
      metalness: 0.15,
    });
    const topShroud = new THREE.Mesh(shroudGeo, shroudMat);
    topShroud.position.y = 1.22;
    topShroud.castShadow = !isSoftwareGl;
    purifierGroup.add(topShroud);

    // Part 6: Rotating impeller fan blades
    const impellerGroup = new THREE.Group();
    impellerGroup.position.y = 1.48;
    const hubMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20),
      metalCollarMat,
    );
    impellerGroup.add(hubMesh);
    const bladeGeo = new THREE.BoxGeometry(0.34, 0.02, 0.09);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x0f766e,
      roughness: 0.35,
      metalness: 0.4,
    });
    for (let b = 0; b < 6; b++) {
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      const angle = (b / 6) * Math.PI * 2;
      blade.position.set(Math.cos(angle) * 0.2, 0, Math.sin(angle) * 0.2);
      blade.rotation.y = -angle;
      blade.rotation.x = 0.38;
      impellerGroup.add(blade);
    }
    purifierGroup.add(impellerGroup);

    // Part 7: Status LED ring
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      emissive: 0x14b8a6,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.015, 12, 48), ledMat);
    ledRing.rotation.x = Math.PI / 2;
    ledRing.position.y = 1.65;
    purifierGroup.add(ledRing);

    // Part 8: TubeGeometry leather/steel handle loop
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.54, 1.32, 0),
      new THREE.Vector3(-0.62, 1.56, 0),
      new THREE.Vector3(0, 1.85, 0),
      new THREE.Vector3(0.62, 1.56, 0),
      new THREE.Vector3(0.54, 1.32, 0),
    ]);
    const handleGeo = new THREE.TubeGeometry(handleCurve, 28, 0.022, 10, false);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.65,
      metalness: 0.2,
    });
    const handleMesh = new THREE.Mesh(handleGeo, handleMat);
    purifierGroup.add(handleMesh);

    // ------------------------------------------------------------------
    // MODEL 2: Composite 5-part Ambient Air Quality Sensor Beacon
    // ------------------------------------------------------------------
    const sensorGroup = new THREE.Group();
    sensorGroup.position.set(-1.75, 0.06, -0.75);
    scene.add(sensorGroup);

    const sensorShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), shadowMat);
    sensorShadow.rotation.x = -Math.PI / 2;
    sensorShadow.position.y = 0.015;
    sensorGroup.add(sensorShadow);

    const mastMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.3,
      metalness: 0.85,
    });
    const footDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.06, 24), mastMat);
    footDisc.position.y = 0.03;
    sensorGroup.add(footDisc);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.045, 1.32, 16), mastMat);
    mast.position.y = 0.7;
    mast.castShadow = !isSoftwareGl;
    sensorGroup.add(mast);

    const louverMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.5,
      metalness: 0.05,
    });
    for (let i = 0; i < 4; i++) {
      const louver = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.05, 24), louverMat);
      louver.position.y = 1.18 + i * 0.075;
      sensorGroup.add(louver);
    }

    const solarMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.15,
      metalness: 0.7,
    });
    const solarCap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.28), solarMat);
    solarCap.position.y = 1.54;
    solarCap.rotation.x = 0.22;
    sensorGroup.add(solarCap);

    // ------------------------------------------------------------------
    // MODEL 3: Terracotta Planter & Sansevieria Air-Purifying Plant
    // ------------------------------------------------------------------
    const plantGroup = new THREE.Group();
    plantGroup.position.set(1.75, 0.06, -0.55);
    scene.add(plantGroup);

    const plantShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), shadowMat);
    plantShadow.rotation.x = -Math.PI / 2;
    plantShadow.position.y = 0.015;
    plantGroup.add(plantShadow);

    const potProfile = [
      new THREE.Vector2(0.0, 0),
      new THREE.Vector2(0.24, 0),
      new THREE.Vector2(0.32, 0.42),
      new THREE.Vector2(0.35, 0.44),
      new THREE.Vector2(0.35, 0.52),
      new THREE.Vector2(0.3, 0.52),
    ];
    const potMat = new THREE.MeshStandardMaterial({
      color: 0xc26d4a,
      roughness: 0.85,
      metalness: 0.03,
    });
    const potMesh = new THREE.Mesh(new THREE.LatheGeometry(potProfile, 28), potMat);
    potMesh.castShadow = !isSoftwareGl;
    plantGroup.add(potMesh);

    const soilMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.29, 0.29, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: 0x3b2f2f, roughness: 0.95 }),
    );
    soilMesh.position.y = 0.46;
    plantGroup.add(soilMesh);

    const leafShape = new THREE.Shape();
    leafShape.moveTo(-0.055, 0);
    leafShape.quadraticCurveTo(-0.075, 0.42, 0, 0.82);
    leafShape.quadraticCurveTo(0.075, 0.42, 0.055, 0);
    leafShape.closePath();
    const leafGeo = new THREE.ExtrudeGeometry(leafShape, { depth: 0.012, bevelEnabled: false });

    for (let l = 0; l < 7; l++) {
      const leafMat = new THREE.MeshStandardMaterial({
        color: l % 2 === 0 ? 0x15803d : 0x166534,
        roughness: 0.45 + (l % 3) * 0.1,
        metalness: 0.05,
      });
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const angle = (l / 7) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 0.09, 0.46, Math.sin(angle) * 0.09);
      leaf.rotation.y = -angle;
      leaf.rotation.z = 0.12 + (l % 2) * 0.08;
      leaf.scale.setScalar(0.82 + (l % 3) * 0.14);
      plantGroup.add(leaf);
    }

    // ------------------------------------------------------------------
    // PARTICULATE AEROSOL CLOUD (220 InstancedMesh PM2.5 / Clean Particles)
    // ------------------------------------------------------------------
    const PARTICLE_COUNT = 220;
    const pGeo = new THREE.IcosahedronGeometry(0.028, 0);
    const pMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.1,
    });
    const particles = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_COUNT);
    particles.frustumCulled = false;

    const pData = Array.from({ length: PARTICLE_COUNT }, (_, idx) => {
      const angle = (idx / PARTICLE_COUNT) * Math.PI * 2 * 5;
      const radius = 0.8 + ((idx * 37) % 100) / 36;
      const y = 0.25 + ((idx * 53) % 100) / 45;
      return { angle, radius, y, speed: 0.35 + (idx % 7) * 0.08, phase: idx * 0.4 };
    });
    scene.add(particles);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Smooth damped animation state
    let currentExplode = 0;
    let lastTime = performance.now();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const elapsed = now / 1000;

      const s = simStateRef.current;

      // Damped exploded view separation
      currentExplode = THREE.MathUtils.damp(currentExplode, s.explode, 6, dt);
      hepaCore.position.y = 0.68 + currentExplode * 0.72;
      collarRing.position.y = 1.22 + currentExplode * 1.15;
      topShroud.position.y = 1.22 + currentExplode * 1.38;
      impellerGroup.position.y = 1.48 + currentExplode * 1.55;
      ledRing.position.y = 1.65 + currentExplode * 1.55;
      handleMesh.position.y = currentExplode * 1.72;

      // Fan speed & impeller spin
      const spinSpeed = s.fanMode === 'turbo' ? 9.5 : s.fanMode === 'sleep' ? 2.8 : 0;
      impellerGroup.rotation.y += dt * spinSpeed;

      // Dynamic fog & LED indicator reflecting AQI
      const effectiveAqi =
        s.fanMode === 'turbo'
          ? Math.max(20, s.aqi * 0.25)
          : s.fanMode === 'sleep'
            ? Math.max(30, s.aqi * 0.55)
            : s.aqi;
      const hazeRatio = THREE.MathUtils.clamp(effectiveAqi / 350, 0.05, 1);

      if (effectiveAqi <= 50) _color.setHex(0x16a34a);
      else if (effectiveAqi <= 100) _color.setHex(0xca8a04);
      else if (effectiveAqi <= 200) _color.setHex(0xea580c);
      else _color.setHex(0xdc2626);
      ledMat.color.copy(_color);
      ledMat.emissive.copy(_color);

      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.density = 0.022 + hazeRatio * 0.048;
      }

      // Camera preset damping
      if (s.presetDirty) {
        if (s.preset === 'hero') {
          _targetCamPos.set(4.8, 3.1, 6.2);
          _targetLook.set(0, 1.0, 0);
        } else if (s.preset === 'core') {
          _targetCamPos.set(2.3, 1.9, 2.7);
          _targetLook.set(0, 1.25, 0);
        } else {
          _targetCamPos.set(0.2, 7.8, 3.2);
          _targetLook.set(0, 0.5, 0);
        }
        const dampAlpha = 1 - Math.exp(-4.5 * dt);
        camera.position.lerp(_targetCamPos, dampAlpha);
        controls.target.lerp(_targetLook, dampAlpha);
        if (camera.position.distanceTo(_targetCamPos) < 0.04) {
          s.presetDirty = false;
        }
      }

      // Update InstancedMesh particulate flow
      const suctionPull = s.fanMode === 'turbo' ? 0.55 : s.fanMode === 'sleep' ? 0.25 : 0;
      const windDrift = 0.2 + (s.wind / 30) * 0.8;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const pd = pData[i];
        const curAngle = pd.angle + elapsed * pd.speed * windDrift;
        const r = Math.max(
          0.65,
          pd.radius - suctionPull * 0.25 * Math.sin(elapsed * 1.4 + pd.phase),
        );
        const y = pd.y + Math.sin(elapsed * 1.1 + pd.phase) * 0.14;
        _vec3.set(Math.cos(curAngle) * r, y, Math.sin(curAngle) * r);
        const particleScale = (0.55 + hazeRatio * 1.15) * (s.fanMode === 'turbo' ? 0.72 : 1.0);
        _scale.setScalar(particleScale);
        _mat4.compose(_vec3, _quat, _scale);
        particles.setMatrixAt(i, _mat4);

        if (s.aqi > 200) _color.setHex(0xb45309);
        else if (s.aqi > 100) _color.setHex(0xd97706);
        else _color.setHex(0x0d9488);
        particles.setColorAt(i, _color);
      }
      particles.instanceMatrix.needsUpdate = true;
      if (particles.instanceColor) particles.instanceColor.needsUpdate = true;

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 1200;
      const h = container.clientHeight || 620;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      controls.dispose();
      perfMap.dispose();
      perfBump.dispose();
      hepaTex.dispose();
      shadowTex.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-[calc(100vh-225px)] min-h-[480px] max-h-[640px] rounded-xl overflow-hidden border border-slate-200 bg-slate-200">
      {/* Dedicated isolated WebGL mount */}
      <div ref={mountRef} data-testid="three-air-canvas" className="w-full h-full" />

      {/* Minimal Top-Left Spec Badge (solid surface, zero backdrop-blur) */}
      <div className="absolute top-3 left-3 bg-slate-950/90 text-white px-4 py-2 rounded-lg border border-slate-800 pointer-events-none">
        <p className="text-[11px] font-mono uppercase tracking-wider text-teal-300">
          3D Particulate &amp; HEPA Simulation · {cityName}
        </p>
        <p className="text-sm font-bold font-mono tabular-nums mt-0.5">
          Ambient AQI {simAqi} · Wind {windSpeedKmh} km/h · Fan {fanMode.toUpperCase()}
        </p>
      </div>

      {/* Collapsible Bottom Control Dock (solid/rgba surface, zero backdrop-filter) */}
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(900px,94%)] flex flex-col items-center"
        style={{ zIndex: 20 }}
      >
        <button
          type="button"
          onClick={() => setDockOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1 text-xs font-semibold text-white bg-slate-950/95 border border-slate-700 rounded-t-lg hover:bg-slate-900"
        >
          {dockOpen ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
          {dockOpen ? 'Hide Controls (H)' : 'Show Controls (H)'}
        </button>

        {dockOpen && (
          <div className="w-full bg-slate-950/95 text-slate-100 border border-slate-800 rounded-xl p-3.5 grid grid-cols-1 md:grid-cols-4 gap-3.5 items-center">
            <div>
              <label
                htmlFor="exploded-slider"
                className="flex justify-between text-xs font-medium text-slate-300 mb-1"
              >
                <span>Exploded Purifier</span>
                <span className="font-mono">{Math.round(explode * 100)}%</span>
              </label>
              <input
                id="exploded-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={explode}
                onChange={(e) => setExplode(Number(e.target.value))}
                className="w-full accent-teal-400"
              />
            </div>

            <div>
              <label
                htmlFor="sim-aqi-slider"
                className="flex justify-between text-xs font-medium text-slate-300 mb-1"
              >
                <span>Ambient AQI Load</span>
                <span className="font-mono">{simAqi}</span>
              </label>
              <input
                id="sim-aqi-slider"
                type="range"
                min={20}
                max={450}
                step={5}
                value={simAqi}
                onChange={(e) => setSimAqi(Number(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1">
                <Wind className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
                Purifier Speed
              </span>
              <div className="flex gap-1">
                {(['off', 'sleep', 'turbo'] as FanMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFanMode(mode)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md capitalize ${
                      fanMode === mode
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-300 mb-1.5">Camera View</span>
              <div className="flex gap-1">
                {(['hero', 'core', 'overhead'] as CameraPreset[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md capitalize ${
                      preset === p
                        ? 'bg-slate-100 text-slate-900'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
