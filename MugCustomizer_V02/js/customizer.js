// js/customizer.js
// Fully integrated: Canvas editor (draw + upload) + Three.js (GLTF load, apply texture) + UI toggles

/* ======= DOM ======= */
const editorCanvas = document.getElementById('texture-editor');
const ctx = editorCanvas.getContext('2d', { willReadFrequently: true });
const applyBtn = document.getElementById('apply-texture-btn');
const viewBtn = document.getElementById('view-3d-btn');
const imgUpload = document.getElementById('img-upload');
const btnClear = document.getElementById('btn-clear');
const toolPen = document.getElementById('tool-pen');
const toolEraser = document.getElementById('tool-eraser');
const brushSize = document.getElementById('brush-size');
const brushColor = document.getElementById('brush-color');
const viewerOverlay = document.getElementById('mug-viewer-3d-overlay');
const threeContainer = document.getElementById('three-container');
const loadingSpinner = document.getElementById('loading-spinner');
const closeViewerBtn = document.getElementById('close-3d-viewer');
const toastRoot = document.getElementById('toast-root');

function showToast(text, time = 2000) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = text;
  toastRoot.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; setTimeout(()=>d.remove(),300); }, time);
}

/* ======= Canvas Editor ======= */
// init white background
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);

ctx.lineCap = 'round';
ctx.lineJoin = 'round';
ctx.lineWidth = parseInt(brushSize.value, 10);
ctx.strokeStyle = brushColor.value;

let drawing = false;
let currentTool = 'pen';

function getPos(e) {
  const rect = editorCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const scaleX = editorCanvas.width / rect.width;
  const scaleY = editorCanvas.height / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function startDraw(e) {
  e.preventDefault();
  drawing = true;
  const p = getPos(e);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
}

function draw(e) {
  if (!drawing) return;
  e.preventDefault();
  const p = getPos(e);
  if (currentTool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = Math.max(8, parseInt(brushSize.value, 10));
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = brushColor.value;
    ctx.lineWidth = Math.max(1, parseInt(brushSize.value, 10));
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

function endDraw() {
  if (!drawing) return;
  drawing = false;
  ctx.closePath();
}

editorCanvas.addEventListener('mousedown', startDraw);
editorCanvas.addEventListener('mousemove', draw);
window.addEventListener('mouseup', endDraw);

editorCanvas.addEventListener('touchstart', startDraw, {passive:false});
editorCanvas.addEventListener('touchmove', draw, {passive:false});
editorCanvas.addEventListener('touchend', endDraw);

/* toolbar */
toolPen.addEventListener('click', () => { currentTool = 'pen'; toolPen.classList.add('bg-gray-200'); toolEraser.classList.remove('bg-gray-200'); });
toolEraser.addEventListener('click', () => { currentTool = 'eraser'; toolEraser.classList.add('bg-gray-200'); toolPen.classList.remove('bg-gray-200'); });

brushSize.addEventListener('input', () => { ctx.lineWidth = parseInt(brushSize.value, 10); });
brushColor.addEventListener('input', () => { ctx.strokeStyle = brushColor.value; });

btnClear.addEventListener('click', () => {
  ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);
  showToast('Canvas cleared');
});

/* Upload image: fit to canvas center */
imgUpload.addEventListener('change', (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // center-fit
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0,0,editorCanvas.width,editorCanvas.height);
      const cw = editorCanvas.width, ch = editorCanvas.height;
      const r = Math.min(cw / img.width, ch / img.height);
      const iw = img.width * r, ih = img.height * r;
      const ix = (cw - iw) / 2, iy = (ch - ih) / 2;
      ctx.drawImage(img, ix, iy, iw, ih);
      showToast('Image placed on canvas');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(f);
});

/* ======= Three.js Setup & Model Loading ======= */
let scene, camera, renderer, controls, mugModel, canvasTexture;

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f4f6);

  const w = threeContainer.clientWidth || 900;
  const h = threeContainer.clientHeight || 480;

  camera = new THREE.PerspectiveCamera(60, w / h, 0.05, 100);
  camera.position.set(0, 1.2, 2.8);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(w, h);
  renderer.outputEncoding = THREE.sRGBEncoding;
  threeContainer.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 1.0;
  controls.maxDistance = 6;

  // lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.95);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(4, 10, 4);
  scene.add(dir);

  window.addEventListener('resize', onWindowResize);

  loadModel();
  animate();
}

function onWindowResize() {
  const w = threeContainer.clientWidth || 900;
  const h = threeContainer.clientHeight || 480;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function loadModel() {
  loadingSpinner.style.display = 'flex';
  const loader = new THREE.GLTFLoader();
  loader.load('assets/models/mug.glb',
    (gltf) => {
      if (mugModel) scene.remove(mugModel);
      mugModel = gltf.scene;

      // normalize scale based on bounding box
      const box = new THREE.Box3().setFromObject(mugModel);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = maxDim > 0 ? (1.2 / maxDim) : 1;
      mugModel.scale.setScalar(scale);

      // recenter
      box.setFromObject(mugModel);
      const center = box.getCenter(new THREE.Vector3());
      mugModel.position.sub(center); // center model at origin
      mugModel.position.y -= 0.05;

      // prepare materials
      mugModel.traverse((c) => {
        if (c.isMesh) {
          if (c.material) {
            c.material.side = THREE.DoubleSide;
            c.material.needsUpdate = true;
          }
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });

      scene.add(mugModel);
      loadingSpinner.style.display = 'none';
      applyBtn.disabled = false;
      viewBtn.disabled = false;
      showToast('3D model loaded');
    },
    (xhr) => {
      // optional: show progress
    },
    (err) => {
      console.error('GLTF load error', err);
      loadingSpinner.style.display = 'none';
      showToast('Error loading 3D model (see console)');
    }
  );
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

/* ======= Apply canvas texture to model ======= */
function applyCanvasToModel() {
  if (!mugModel) { showToast('Model not loaded yet'); return; }

  if (canvasTexture) { canvasTexture.dispose(); }
  canvasTexture = new THREE.CanvasTexture(editorCanvas);
  canvasTexture.flipY = false; // Usually GLTF UV expects flipY = false
  canvasTexture.encoding = THREE.sRGBEncoding;
  canvasTexture.needsUpdate = true;

  mugModel.traverse((node) => {
    if (node.isMesh) {
      // If material is array
      if (Array.isArray(node.material)) {
        node.material.forEach(m => { m.map = canvasTexture; m.needsUpdate = true; });
      } else if (node.material) {
        node.material.map = canvasTexture;
        // ensure visible colors
        if (node.material.color) node.material.color.setHex(0xffffff);
        node.material.needsUpdate = true;
      }
    }
  });

  showToast('Design applied to mug');
}

/* Fit camera helper (for view button) */
function fitCameraToObject(object, camera, controls) {
  if (!object) return;
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxSize = Math.max(size.x, size.y, size.z);
  const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * camera.fov / 360));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.2;

  // move camera
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize().multiplyScalar(distance);
  camera.position.copy(center).add(dir);
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

/* ======= UI bindings ======= */
applyBtn.addEventListener('click', () => {
  applyCanvasToModel();
  // show viewer overlay in case hidden
  viewerOverlay.classList.remove('hidden');
  setTimeout(() => viewerOverlay.classList.remove('opacity-0'), 10);
});

viewBtn.addEventListener('click', () => {
  // show overlay
  viewerOverlay.classList.remove('hidden');
  setTimeout(() => viewerOverlay.classList.remove('opacity-0'), 10);
  fitCameraToObject(mugModel, camera, controls);
});

closeViewerBtn.addEventListener('click', () => {
  viewerOverlay.classList.add('opacity-0');
  setTimeout(() => viewerOverlay.classList.add('hidden'), 300);
});

/* init */
window.addEventListener('load', () => {
  initThree();
  showToast('Editor ready — draw or upload image');
});
