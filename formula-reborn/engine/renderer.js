import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js";
import { buildTrack } from "../tracks/track-builder.js";
import { CameraController } from "./camera-controller.js";

function qualityProfile(name = "auto") {
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches;
  const cores = Number(navigator.hardwareConcurrency || 4);
  const memory = Number(navigator.deviceMemory || 4);
  const selected = name === "auto"
    ? (coarse || cores <= 4 || memory <= 4 ? "performance" : "balanced")
    : name;

  return {
    performance: { pixelRatio: 0.85, shadows: false, antialias: false, far: 900 },
    balanced: { pixelRatio: 1.1, shadows: true, antialias: true, far: 1250 },
    quality: { pixelRatio: 1.5, shadows: true, antialias: true, far: 1600 }
  }[selected] || { pixelRatio: 1.0, shadows: true, antialias: true, far: 1200 };
}

function createFormulaCar({ ghost = false } = {}) {
  const group = new THREE.Group();
  group.name = ghost ? "ghost-car" : "player-car";

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: ghost ? 0x56d9ff : 0xe0ad35,
    metalness: 0.58,
    roughness: 0.26,
    transparent: ghost,
    opacity: ghost ? 0.34 : 1,
    depthWrite: !ghost
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x111820,
    metalness: 0.38,
    roughness: 0.45,
    transparent: ghost,
    opacity: ghost ? 0.24 : 1,
    depthWrite: !ghost
  });
  const tyreMaterial = new THREE.MeshStandardMaterial({
    color: 0x050608,
    roughness: 0.82,
    transparent: ghost,
    opacity: ghost ? 0.24 : 1,
    depthWrite: !ghost
  });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.20, 4.7), darkMaterial);
  floor.position.y = 0.32;
  group.add(floor);

  const central = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.56, 3.5), bodyMaterial);
  central.position.set(0, 0.58, 0.08);
  group.add(central);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 2.0), bodyMaterial);
  nose.position.set(0, 0.49, 2.46);
  group.add(nose);

  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.46, 1.12), darkMaterial);
  cockpit.position.set(0, 0.92, -0.20);
  group.add(cockpit);

  const frontWing = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.12, 0.48), bodyMaterial);
  frontWing.position.set(0, 0.28, 3.25);
  group.add(frontWing);

  const rearWing = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.18, 0.42), bodyMaterial);
  rearWing.position.set(0, 1.05, -2.05);
  group.add(rearWing);

  const rearPost = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.82, 0.18), darkMaterial);
  rearPost.position.set(0, 0.68, -1.96);
  group.add(rearPost);

  const tyreGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.34, 18);
  tyreGeometry.rotateZ(Math.PI / 2);
  const wheelPositions = [
    [-1.05, 0.43, 2.02],
    [1.05, 0.43, 2.02],
    [-1.12, 0.48, -1.55],
    [1.12, 0.48, -1.55]
  ];
  for (const [x, y, z] of wheelPositions) {
    const tyre = new THREE.Mesh(tyreGeometry, tyreMaterial);
    tyre.position.set(x, y, z);
    tyre.castShadow = !ghost;
    group.add(tyre);
  }

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 20, Math.PI * 1.4), darkMaterial);
  halo.rotation.x = Math.PI / 2;
  halo.rotation.z = Math.PI * 0.30;
  halo.position.set(0, 1.16, 0.12);
  group.add(halo);

  group.traverse(object => {
    if (object.isMesh) {
      object.castShadow = !ghost;
      object.receiveShadow = !ghost;
    }
  });

  return group;
}

function addLighting(scene, track, profile) {
  const hemi = new THREE.HemisphereLight(
    track.environment === "volcanic" ? 0xffb07b : 0xc8edff,
    track.environment === "harbour" ? 0x252b31 : 0x26352b,
    track.environment === "volcanic" ? 1.5 : 1.75
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(
    track.environment === "volcanic" ? 0xff9a5a : 0xffffff,
    track.environment === "volcanic" ? 2.4 : 2.1
  );
  sun.position.set(-180, 250, 110);
  sun.castShadow = profile.shadows;
  if (profile.shadows) {
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -180;
    sun.shadow.camera.right = 180;
    sun.shadow.camera.top = 180;
    sun.shadow.camera.bottom = -180;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 650;
    sun.shadow.bias = -0.00025;
  }
  scene.add(sun);

  if (track.environment === "volcanic") {
    const glow = new THREE.PointLight(0xff4a24, 34, 420, 1.4);
    glow.position.set(80, 60, -80);
    scene.add(glow);
  }
}

export class FormulaRenderer {
  constructor(container, track, settings = {}) {
    if (!container) throw new Error("Formula Reborn renderer container is missing.");
    this.container = container;
    this.track = track;
    this.profile = qualityProfile(settings.quality || "auto");
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(track.sky);
    this.scene.fog = new THREE.FogExp2(track.fog, track.environment === "harbour" ? 0.0022 : 0.00135);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, this.profile.far);
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.profile.antialias,
      powerPreference: "high-performance"
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = track.environment === "volcanic" ? 1.1 : 1.0;
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(this.profile.pixelRatio, window.devicePixelRatio || 1));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.domElement.className = "fr45-webgl";
    container.appendChild(this.renderer.domElement);

    addLighting(this.scene, track, this.profile);
    this.trackModel = buildTrack(this.scene, track, { sampleCount: 960 });
    this.playerCar = createFormulaCar();
    this.ghostCar = createFormulaCar({ ghost: true });
    this.ghostCar.visible = false;
    this.scene.add(this.playerCar, this.ghostCar);

    this.cameraController = new CameraController(this.camera, settings);
    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    this.resize();
  }

  resize() {
    const width = Math.max(320, this.container.clientWidth || window.innerWidth);
    const height = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  syncVehicle(physics) {
    this.playerCar.position.set(physics.position.x, physics.position.y, physics.position.z);
    this.playerCar.rotation.set(0, physics.yaw, 0);
  }

  syncGhost(sample) {
    if (!sample) {
      this.ghostCar.visible = false;
      return;
    }
    this.ghostCar.visible = true;
    this.ghostCar.position.set(sample.x, sample.y, sample.z);
    this.ghostCar.rotation.set(0, sample.yaw, 0);
  }

  updateCamera(telemetry, dt, input) {
    this.cameraController.update(this.playerCar, telemetry, dt, input);
  }

  cycleCamera() {
    return this.cameraController.cycleMode();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this.onResize);
    this.trackModel?.dispose?.();
    this.scene.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
      else object.material?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}

export { createFormulaCar };
