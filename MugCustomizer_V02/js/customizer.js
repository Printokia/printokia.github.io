// js/customizer.js
// Enhanced customizer: centered PBR mug + 3-light setup + canvas editor with transformable image layer + UV overlay

/* ===========================================================
   DOM references (must match your index.html IDs from UI A)
   =========================================================== */
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
const editorWrapper = document.getElementById('texture-editor-panel');

/* ===========================================================
   Small helper: Toast messages
   =========================================================== */
function showToast(text, timeout = 2000) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  toastRoot.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, timeout);
}

/* ===========================================================
   Canvas layers:
     - drawingLayer: freehand strokes (preserved)
     - imageLayer: uploaded image object (transformable)
     - final/editorCanvas: composite of layers + UV overlay
   =========================================================== */
const drawingLayer = document.createElement('canvas');
drawingLayer.width = editorCanvas.width;
drawingLayer.height = editorCanvas.height;
const dCtx = drawingLayer.getContext('2d', { willReadFrequently: true });

const imageLayer = document.createElement('canvas');
imageLayer.width = editorCanvas.width;
imageLayer.height = editorCanvas.height;
const iCtx = imageLayer.getContext('2d', { willReadFrequently: true });

// initialize white background on drawing layer
dCtx.fillStyle = '#ffffff';
dCtx.fillRect(0, 0, drawingLayer.width, drawingLayer.height);

// state for image object (single image supported for now)
let imageObj = null; // {img, x, y, scale, rot, w, h, isDragging, anchorOffset}

/* ===========================================================
   UV overlay config
   (this is a visual guide on editorCanvas — adjust to match UV)
   =========================================================== */
const uvArea = {
  x: Math.round(editorCanvas.width * 0.08),
  y: Math.round(editorCanvas.height * 0.18),
  w: Math.round(editorCanvas.width * 0.84),
  h: Math.round(editorCanvas.height * 0.64),
  strokeStyle: '#000000',
  dash: [8, 6],
  alpha: 0.45
};

/* ===========================================================
   Freehand drawing (on drawingLayer)
   =========================================================== */
let drawing = false;
let currentTool = 'pen';
dCtx.lineCap = 'round';
dCtx.lineJoin = 'round';
dCtx.lineWidth = parseInt(brushSize.value, 10);
dCtx.strokeStyle = brushColor.value;

function getCanvasPos(e, canvasElem) {
  const rect = canvasElem.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const scaleX = canvasElem.width / rect.width;
  const scaleY = canvasElem.height / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function startDraw(e) {
  // if imageObj exists and is being dragged, drawing shouldn't start
  if (imageObj && imageObj.isDragging) return;
  drawing = true;
  const p = getCanvasPos(e, editorCanvas);
  dCtx.beginPath();
  dCtx.moveTo(p.x, p.y);
}

function drawFreehand(e) {
  if (!drawing) return;
  const p = getCanvasPos(e, editorCanvas);
  if (currentTool === 'eraser') {
    dCtx.globalCompositeOperation = 'destination-out';
    dCtx.lineWidth = Math.max(8, parseInt(brushSize.value, 10));
    dCtx.lineTo(p.x, p.y);
    dCtx.stroke();
    dCtx.globalCompositeOperation = 'source-over';
  } else {
    dCtx.globalCompositeOperation = 'source-over';
    dCtx.strokeStyle = brushColor.value;
    dCtx.lineWidth = Math.max(1, parseInt(brushSize.value, 10));
    dCtx.lineTo(p.x, p.y);
    dCtx.stroke();
  }
  compositeEditorCanvas();
}

function endDraw() {
  if (!drawing) return;
  drawing = false;
  dCtx.closePath();
}

editorCanvas.addEventListener('mousedown', (e) => {
  if (isPointInImageObj(e)) { // clicking on image -> start dragging image
    beginImageDrag(e);
  } else {
    startDraw(e);
  }
});
editorCanvas.addEventListener('mousemove', (e) => {
  if (imageObj && imageObj.isDragging) imageDrag(e);
  else drawFreehand(e);
});
window.addEventListener('mouseup', (e) => {
  if (imageObj && imageObj.isDragging) endImageDrag(e);
  else endDraw();
});

editorCanvas.addEventListener('touchstart', (e) => {
  if (isPointInImageObj(e)) beginImageDrag(e); else startDraw(e);
}, { passive: false });
editorCanvas.addEventListener('touchmove', (e) => {
  if (imageObj && imageObj.isDragging) imageDrag(e); else drawFreehand(e);
}, { passive: false });
editorCanvas.addEventListener('touchend', (e) => {
  if (imageObj && imageObj.isDragging) endImageDrag(e); else endDraw();
});

/* toolbar interactions */
toolPen.addEventListener('click', () => { currentTool = 'pen'; toolPen.classList.add('bg-gray-200'); toolEraser.classList.remove('bg-gray-200'); });
toolEraser.addEventListener('click', () => { currentTool = 'eraser'; toolEraser.classList.add('bg-gray-200'); toolPen.classList.remove('bg-gray-200'); });

brushSize.addEventListener('input', () => { dCtx.lineWidth = parseInt(brushSize.value, 10); });
brushColor.addEventListener('input', () => { dCtx.strokeStyle = brushColor.value; });

btnClear.addEventListener('click', () => {
  dCtx.clearRect(0, 0, drawingLayer.width, drawingLayer.height);
  dCtx.fillStyle = '#ffffff'; dCtx.fillRect(0, 0, drawingLayer.width, drawingLayer.height);
  imageObj = null;
  clearImageLayer();
  compositeEditorCanvas();
  showToast('Canvas cleared');
});

/* ===========================================================
   Image transform support (basic)
   - upload image, fits into UV area by default
   - provide sliders for scale & rotation + arrows for nudge
   - click and drag on image to move
   =========================================================== */

// create transform panel dynamically and inject under editorWrapper
function createTransformPanel() {
  const panel = document.createElement('div');
  panel.id = 'transform-panel';
  panel.style.marginTop = '8px';
  panel.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;">
      <div style="display:flex;gap:6px;align-items:center;">
        <label style="font-size:12px;color:#444">Selected Image:</label>
        <span id="transform-info" style="font-size:12px;color:#666">—</span>
      </div>
      <div style="margin-left:auto;display:flex;gap:6px;align-items:center;">
        <label style="font-size:12px;color:#444">Scale</label>
        <input id="img-scale" type="range" min="0.1" max="3" step="0.01" value="1"/>
        <label style="font-size:12px;color:#444">Rotate</label>
        <input id="img-rotate" type="range" min="-180" max="180" step="1" value="0"/>
      </div>
    </div>
    <div style="display:flex;gap:6px;align-items:center;margin-top:8px;">
      <button id="nudge-left" class="px-2 py-1 bg-gray-100 rounded">◀</button>
      <button id="nudge-up" class="px-2 py-1 bg-gray-100 rounded">▲</button>
      <button id="nudge-down" class="px-2 py-1 bg-gray-100 rounded">▼</button>
      <button id="nudge-right" class="px-2 py-1 bg-gray-100 rounded">▶</button>
      <button id="remove-image" class="ml-4 px-3 py-1 bg-red-500 text-white rounded">Remove</button>
    </div>
  `;
  editorWrapper.appendChild(panel);

  return {
    scale: document.getElementById('img-scale'),
    rotate: document.getElementById('img-rotate'),
    info: document.getElementById('transform-info'),
    nudgeLeft: document.getElementById('nudge-left'),
    nudgeRight: document.getElementById('nudge-right'),
    nudgeUp: document.getElementById('nudge-up'),
    nudgeDown: document.getElementById('nudge-down'),
    remove: document.getElementById('remove-image')
  };
}

const transformUI = createTransformPanel();
transformUI.scale.style.display = 'none';
transformUI.rotate.style.display = 'none';
transformUI.nudgeLeft.style.display = transformUI.nudgeRight.style.display = transformUI.nudgeUp.style.display = transformUI.nudgeDown.style.display = transformUI.remove.style.display = 'none';

function clearImageLayer() {
  iCtx.clearRect(0, 0, imageLayer.width, imageLayer.height);
}

function drawImageLayer() {
  clearImageLayer();
  if (!imageObj) return;
  iCtx.save();
  // translate to image center then rotate and scale and draw
  iCtx.translate(imageObj.x, imageObj.y);
  iCtx.rotate(imageObj.rot * Math.PI / 180);
  iCtx.scale(imageObj.scale, imageObj.scale);
  iCtx.drawImage(imageObj.img, -imageObj.w / 2, -imageObj.h / 2, imageObj.w, imageObj.h);
  iCtx.restore();
}

function compositeEditorCanvas() {
  // final editor canvas = white background + drawingLayer + imageLayer + uv overlay
  ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
  // base white (in case drawing is cleared)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);

  // draw drawing layer (freehand)
  ctx.drawImage(drawingLayer, 0, 0);
  // draw image layer (transformed image)
  ctx.drawImage(imageLayer, 0, 0);

  // draw dotted UV overlay
  ctx.save();
  ctx.globalAlpha = uvArea.alpha;
  ctx.strokeStyle = uvArea.strokeStyle;
  ctx.setLineDash(uvArea.dash);
  ctx.lineWidth = 2;
  ctx.strokeRect(uvArea.x + 0.5, uvArea.y + 0.5, uvArea.w, uvArea.h);
  ctx.restore();
}

function isPointInImageObj(e) {
  if (!imageObj) return false;
  const p = getCanvasPos(e, editorCanvas);
  // reverse transform: transform point into image local space
  const dx = p.x - imageObj.x;
  const dy = p.y - imageObj.y;
  const angle = -imageObj.rot * Math.PI / 180;
  const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
  const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
  const hw = (imageObj.w * imageObj.scale) / 2;
  const hh = (imageObj.h * imageObj.scale) / 2;
  return rx >= -hw && rx <= hw && ry >= -hh && ry <= hh;
}

function beginImageDrag(e) {
  if (!imageObj) return;
  imageObj.isDragging = true;
  const p = getCanvasPos(e, editorCanvas);
  imageObj.anchorOffset = { x: p.x - imageObj.x, y: p.y - imageObj.y };
}

function imageDrag(e) {
  if (!imageObj || !imageObj.isDragging) return;
  const p = getCanvasPos(e, editorCanvas);
  imageObj.x = p.x - imageObj.anchorOffset.x;
  imageObj.y = p.y - imageObj.anchorOffset.y;
  drawImageLayer();
  compositeEditorCanvas();
  updateTransformUI();
}

function endImageDrag(e) {
  if (!imageObj) return;
  imageObj.isDragging = false;
  imageObj.anchorOffset = null;
}

/* upload image handler */
imgUpload.addEventListener('change', (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Fit uploaded image into UV area by default
      const maxW = uvArea.w * 0.9;
      const maxH = uvArea.h * 0.9;
      const r = Math.min(maxW / img.width, maxH / img.height);
      const iw = img.width * r;
      const ih = img.height * r;
      const cx = uvArea.x + uvArea.w / 2;
      const cy = uvArea.y + uvArea.h / 2;

      imageObj = {
        img: img,
        x: cx,
        y: cy,
        scale: 1,
        rot: 0,
        w: iw,
        h: ih,
        isDragging: false,
        anchorOffset: null
      };

      // copy drawn image at appropriate scale so drawing operations won't mutate original
      drawImageLayer();
      compositeEditorCanvas();
      showToast('Image uploaded. Use transform panel to adjust.');

      // show transform UI
      transformUI.scale.style.display = '';
      transformUI.rotate.style.display = '';
      transformUI.info.textContent = `${Math.round(imageObj.w)}×${Math.round(imageObj.h)}`;
      transformUI.nudgeLeft.style.display = transformUI.nudgeRight.style.display = transformUI.nudgeUp.style.display = transformUI.nudgeDown.style.display = transformUI.remove.style.display = '';
      transformUI.scale.value = imageObj.scale;
      transformUI.rotate.value = imageObj.rot;

      // hook transform UI
      transformUI.scale.oninput = (ev) => {
        if (imageObj) {
          imageObj.scale = parseFloat(ev.target.value);
          drawImageLayer(); compositeEditorCanvas();
        }
      };
      transformUI.rotate.oninput = (ev) => {
        if (imageObj) {
          imageObj.rot = parseFloat(ev.target.value);
          drawImageLayer(); compositeEditorCanvas();
        }
      };
      transformUI.nudgeLeft.onclick = () => { if (imageObj) { imageObj.x -= 2; drawImageLayer(); compositeEditorCanvas(); } };
      transformUI.nudgeRight.onclick = () => { if (imageObj) { imageObj.x += 2; drawImageLayer(); compositeEditorCanvas(); } };
      transformUI.nudgeUp.onclick = () => { if (imageObj) { imageObj.y -= 2; drawImageLayer(); compositeEditorCanvas(); } };
      transformUI.nudgeDown.onclick = () => { if (imageObj) { imageObj.y += 2; drawImageLayer(); compositeEditorCanvas(); } };
      transformUI.remove.onclick = () => {
        imageObj = null; clearImageLayer(); compositeEditorCanvas();
        transformUI.scale.style.display = 'none'; transformUI.rotate.style.display = 'none';
        transformUI.nudgeLeft.style.display = transformUI.nudgeRight.style.display = transformUI.nudgeUp.style.display = transformUI.nudgeDown.style.display = transformUI.remove.style.display = 'none';
      };

    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

/* ===========================================================
   Initial composite draw
   =========================================================== */
compositeEditorCanvas();

/* ===========================================================
   Three.js: 3-light PBR-like setup + model center/fit helpers
   =========================================================== */

let scene, camera, renderer, controls;
let mugModel = null;
let canvasTexture = null;

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f4f6);

  // container size
  const w = threeContainer.clientWidth || 900;
  const h = threeContainer.clientHeight || 480;

  camera = new THREE.PerspectiveCamera(55, w / h, 0.05, 100);
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
  controls.minDistance = 0.8;
  controls.maxDistance = 6;

  // Improved lighting: ambient + 3-light rig (key, fill, rim)
  const ambient = new THREE.HemisphereLight(0xffffff, 0x666666, 0.35);
  scene.add(ambient);

  // Key light (directional)
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(2.5, 4.5, 2.0);
  key.castShadow = false;
  scene.add(key);

  // Fill light (soft)
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-2.0, 1.5, 1.8);
  scene.add(fill);

  // Rim / backlight
  const rim = new THREE.DirectionalLight(0xffffff, 0.35);
  rim.position.set(-1.5, 3.0, -3.0);
  scene.add(rim);

  // small ground plane reflection hint (not visible but helps normals)
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.0;
  ground.visible = false; // optional - keep false to avoid extra render cost
  scene.add(ground);

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

function centerAndNormalizeModel(model) {
  // compute bounding box and normalize scale and position
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? (1.2 / maxDim) : 1;
  model.scale.setScalar(scale);

  // recalc box and center after scale
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center); // move center to origin

  // compute min Y and lift so bottom sits near y = 0
  box.setFromObject(model);
  const minY = box.min.y;
  model.position.y -= (minY - 0.02); // small offset so it sits slightly above ground

  return { box, size };
}

function loadModel() {
  loadingSpinner.style.display = 'flex';
  const loader = new THREE.GLTFLoader();
  loader.load('assets/models/mug.glb',
    (gltf) => {
      // remove previous
      if (mugModel) scene.remove(mugModel);

      mugModel = gltf.scene;
      const _info = centerAndNormalizeModel(mugModel);

      // Convert or ensure surfaces render with PBR-like ceramic material when applying textures later
      mugModel.traverse((c) => {
        if (c.isMesh) {
          // keep original material but prepare it for map replacement later
          // we will not replace now; keep it to preserve model look until user Apply
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });

      scene.add(mugModel);
      loadingSpinner.style.display = 'none';
      applyBtn.disabled = false;
      viewBtn.disabled = false;
      showToast('3D model loaded and centered');
      // make camera fit
      fitCameraToObject(mugModel, camera, controls);
    },
    (xhr) => {
      // progress
    },
    (err) => {
      console.error('GLTF load err', err);
      loadingSpinner.style.display = 'none';
      showToast('Error loading 3D model — check console');
    }
  );
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

/* ===========================================================
   Apply composed editorCanvas (drawing + image) as map on mug
   - Use MeshPhysicalMaterial with clearcoat to achieve ceramic sheen
   - Keep texturing non-destructive by creating a new material instance per mesh
   =========================================================== */
function applyCanvasToModel() {
  if (!mugModel) { showToast('Model not ready'); return; }
  // final composed canvas (we already composite editorCanvas in compositeEditorCanvas())
  compositeEditorCanvas(); // ensure latest

  // dispose previous texture
  if (canvasTexture) { canvasTexture.dispose(); canvasTexture = null; }

  // create texture
  canvasTexture = new THREE.CanvasTexture(editorCanvas);
  canvasTexture.flipY = false;
  canvasTexture.encoding = THREE.sRGBEncoding;
  canvasTexture.needsUpdate = true;

  mugModel.traverse((node) => {
    if (node.isMesh) {
      // Build a ceramic-looking MeshPhysicalMaterial that uses our canvas
      // Preserve some original PBR maps maybe — but to keep things simple we create new material
      const ceramic = new THREE.MeshPhysicalMaterial({
        map: canvasTexture,
        color: 0xffffff,
        metalness: 0.02,
        roughness: 0.35,      // low roughness for glossy ceramic
        clearcoat: 0.6,       // extra glossy layer
        clearcoatRoughness: 0.08,
        reflectivity: 0.2,
        side: THREE.DoubleSide
      });

      // If the model already had ao/normal maps and you want to keep them:
      // if (node.material && node.material.normalMap) ceramic.normalMap = node.material.normalMap;

      // assign
      node.material = ceramic;
      node.material.needsUpdate = true;
    }
  });

  showToast('Design applied with ceramic material');
}

/* helper: fit camera */
function fitCameraToObject(object, camera, controls) {
  if (!object) return;
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);

  // distance formula
  const fov = camera.fov * (Math.PI / 180);
  let distance = Math.abs(maxSize / Math.sin(fov / 2));
  distance *= 0.6; // tweak factor to bring closer

  // choose direction: keep camera at same direction but move from target
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize().multiplyScalar(distance);
  camera.position.copy(center).add(dir);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

/* ===========================================================
   UI Bindings: apply/view/close
   =========================================================== */
applyBtn.addEventListener('click', () => {
  applyCanvasToModel();
  // auto show
  viewerOverlay.classList.remove('hidden');
  setTimeout(() => viewerOverlay.classList.remove('opacity-0'), 10);
});

viewBtn.addEventListener('click', () => {
  viewerOverlay.classList.remove('hidden');
  setTimeout(() => viewerOverlay.classList.remove('opacity-0'), 10);
  fitCameraToObject(mugModel, camera, controls);
});

closeViewerBtn.addEventListener('click', () => {
  viewerOverlay.classList.add('opacity-0');
  setTimeout(() => viewerOverlay.classList.add('hidden'), 300);
});

/* ===========================================================
   Kick off
   =========================================================== */
window.addEventListener('load', () => {
  // initial composite to draw UV overlay
  compositeEditorCanvas();

  // initialize Three.js
  initThree();

  showToast('Editor ready — draw inside dotted UV area or upload image');

  // small accessibility: keyboard nudges when image selected
  window.addEventListener('keydown', (ev) => {
    if (!imageObj) return;
    const step = ev.shiftKey ? 10 : 2;
    switch (ev.key) {
      case 'ArrowLeft': imageObj.x -= step; break;
      case 'ArrowRight': imageObj.x += step; break;
      case 'ArrowUp': imageObj.y -= step; break;
      case 'ArrowDown': imageObj.y += step; break;
    }
    drawImageLayer(); compositeEditorCanvas();
  });
});
