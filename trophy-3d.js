// ============================================================================
// 3D ŞAMPİYON KUPASI — Faz 4
// Şampiyonlar Kürsüsü sayfasındaki altın kupayı, prosedürel olarak
// oluşturulmuş (harici .glb/.gltf dosyası YOK) döndürülebilir bir 3D nesneye
// çevirir. index.html'deki mevcut <img class="cp-trophy-img"> HER ZAMAN
// varsayılan/görünür kalır; bu script yalnızca kendi sahnesini başarıyla
// kurabilirse görseli gizleyip canvas'ı gösterir. CDN erişilemezse, WebGL
// yoksa veya herhangi bir adım hata verirse: kullanıcı hiçbir hata görmez,
// sadece her zamanki statik altın kupa görseli kalır.
//
// Neden ayrı bir modül dosyası: Three.js r150+ sürümünden itibaren klasik
// <script> (global THREE) yöntemi kaldırıldı, yalnızca ES module import
// destekleniyor. app.js'in geri kalanı klasik senkron <script> etiketleriyle
// yüklendiği için bu tek dosya "type=module" olarak ayrı yükleniyor
// (bkz. index.html, importmap).
// ============================================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const CONTAINER_ID = "cpGoldTrophy3D";
const FALLBACK_IMG_SELECTOR = "#cpGoldTrophyImgFallback";

let current = null; // { container, renderer, rafId, resizeObs }

function disposeCurrent() {
  if (!current) return;
  cancelAnimationFrame(current.rafId);
  current.resizeObs?.disconnect();
  current.renderer.dispose();
  current = null;
}

function buildProfile() {
  return [
    [0.40, 0.00], [0.36, 0.05], [0.30, 0.20], [0.27, 0.42], [0.29, 0.58],
    [0.40, 0.72], [0.60, 0.88], [0.80, 1.08], [0.90, 1.30], [0.93, 1.55],
    [0.97, 1.85], [0.98, 2.00], [0.90, 2.12], [0.80, 2.16]
  ].map(([x, y]) => new THREE.Vector2(x, y));
}

function makeHandle(goldMat, sign) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(sign * 0.86, 1.92, 0),
    new THREE.Vector3(sign * 1.42, 1.75, 0),
    new THREE.Vector3(sign * 1.55, 1.30, 0),
    new THREE.Vector3(sign * 1.38, 0.92, 0),
    new THREE.Vector3(sign * 1.05, 0.80, 0),
    new THREE.Vector3(sign * 0.82, 0.95, 0)
  ]);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.075, 12, false), goldMat);
}

function buildTrophyScene(container) {
  const width = container.clientWidth || 260;
  const height = container.clientHeight || 360;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
  camera.position.set(0, 1.35, 5.4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x2a2416, 1.1));
  const key = new THREE.SpotLight(0xfff0d0, 220, 20, Math.PI / 6, 0.4, 1.2);
  key.position.set(1.8, 5.5, 3.2);
  scene.add(key);
  const fill = new THREE.PointLight(0x88a0ff, 12, 15);
  fill.position.set(-3, 1, 2.5);
  scene.add(fill);
  const rim = new THREE.PointLight(0xffe8b0, 30, 12);
  rim.position.set(-1.5, 2.5, -3);
  scene.add(rim);
  const bounce = new THREE.PointLight(0xffcf83, 8, 10);
  bounce.position.set(0, -1, 2);
  scene.add(bounce);

  const goldMat = new THREE.MeshPhysicalMaterial({
    color: 0xd9ab54, metalness: 1, roughness: 0.28,
    clearcoat: 0.4, clearcoatRoughness: 0.25, reflectivity: 0.9
  });
  const cup = new THREE.Mesh(new THREE.LatheGeometry(buildProfile(), 64), goldMat);

  const ringMat = new THREE.MeshPhysicalMaterial({ color: 0xf0cf83, metalness: 1, roughness: 0.2, clearcoat: 0.5 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.935, 0.035, 16, 48), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.62;

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.3, roughness: 0.55 });
  const baseGroup = new THREE.Group();
  const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.18, 48), baseMat);
  b1.position.y = -0.09;
  const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.58, 0.14, 48), baseMat);
  b2.position.y = 0.03;
  baseGroup.add(b1, b2);

  const trophyGroup = new THREE.Group();
  trophyGroup.add(cup, makeHandle(goldMat, 1), makeHandle(goldMat, -1), ring, baseGroup);
  trophyGroup.position.y = -0.55;
  scene.add(trophyGroup);

  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.185;
  scene.add(shadow);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = Math.PI / 2 - 0.5;
  controls.maxPolarAngle = Math.PI / 2 + 0.35;

  let autoRotate = true;
  let idleTimer = null;
  controls.addEventListener("start", () => { autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener("end", () => { idleTimer = setTimeout(() => { autoRotate = true; }, 2200); });

  let rafId;
  function animate() {
    rafId = requestAnimationFrame(animate);
    if (autoRotate) trophyGroup.rotation.y += 0.006;
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  const resizeObs = new ResizeObserver(() => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resizeObs.observe(container);

  return { container, renderer, rafId: 0, get rafIdLive() { return rafId; }, resizeObs };
}

function scan() {
  const container = document.getElementById(CONTAINER_ID);

  // Önceki örnek artık DOM'da yoksa (sayfa yeniden render edildi, edisyon
  // değişti vb.) temizle -- yoksa WebGL context sızıntısı birikir.
  if (current && (!document.body.contains(current.container) || current.container !== container)) {
    disposeCurrent();
  }

  if (container && !current) {
    try {
      const instance = buildTrophyScene(container);
      current = instance;
      container.classList.add("is-ready");
      const fallbackImg = document.querySelector(FALLBACK_IMG_SELECTOR);
      if (fallbackImg) fallbackImg.style.display = "none";
    } catch (err) {
      // Sessiz düşüş: statik <img> zaten varsayılan olarak görünür durumda.
      console.warn("[trophy-3d] 3D sahne kurulamadı, statik görsele devam ediliyor:", err);
    }
  }
}

if (typeof ResizeObserver === "undefined" || typeof document === "undefined") {
  // Çok eski/olağandışı bir ortam -- hiçbir şey yapma, statik görsel kalır.
} else {
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
}
