// ABOUTME: Core viewer application for the CADScope 3D assembly viewer.
// ABOUTME: Handles Three.js scene, model loading, color sets, scene tree, and camera controls.
import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from "https://unpkg.com/three@0.164.1/examples/jsm/loaders/RGBELoader.js";
import { GLTFLoader } from 'https://unpkg.com/three@0.164.1/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://unpkg.com/three@0.164.1/examples/jsm/loaders/DRACOLoader.js';
import { models } from '../models/models.js';

const hdriLocation = "./assets/bg.hdr";
const loadingPhrases = [
  'Reticulating splines',
  'Realigning the dilithium crystals',
  'Downloading more RAM',
  'Getting more DDR5 from the back of a truck',
  'Bribing the hamsters',
  'Summoning the ancient ones',
  'Consulting the oracle',
  'Sharpening the voxels',
  'Asking Jeeves',
  'Blowing on the cartridge',
  'Synchronizing quantum entanglement buffers',
  'Resolving cascading temporal anomalies',
  'Almost done (lying)',
  'This is taking longer than expected (it isn\u2019t)',
  'Please enjoy this interstitial moment',
];
let scene, camera, renderer, controls, canvas, pmrem;

const loadingManager = new THREE.LoadingManager();

canvas = document.getElementById('viewer');
renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMappingExposure = 0.5;

scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c10);

const BASE_BRIGHTNESS = 1.0;
const DEFAULT_BRIGHTNESS_SCALE = 1.5;

const light = new THREE.AmbientLight(0xffffff);
scene.add(light);
const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, BASE_BRIGHTNESS * DEFAULT_BRIGHTNESS_SCALE);
scene.add(hemi);
  
const dir = new THREE.DirectionalLight(0xffffff, BASE_BRIGHTNESS * DEFAULT_BRIGHTNESS_SCALE);
dir.position.set(5, 10, 7);
scene.add(dir);

const dirFill = new THREE.DirectionalLight(0xffffff, BASE_BRIGHTNESS * DEFAULT_BRIGHTNESS_SCALE);
dirFill.position.set(-5, -10, -7);
scene.add(dirFill);

// Brightness control scales all lights relative to their base intensities
const baseLightIntensities = [
  { light: hemi, base: BASE_BRIGHTNESS },
  { light: dir, base: BASE_BRIGHTNESS },
  { light: dirFill, base: BASE_BRIGHTNESS }
];

document.getElementById('brightnessSlider').addEventListener('input', (e) => {
  const scale = e.target.value / 100;
  for (const { light, base } of baseLightIntensities) {
    light.intensity = base * scale;
  }
});

pmrem = new THREE.PMREMGenerator(renderer);

camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
camera.position.set(0.5, 0.5, 0.5);

controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Store model bounds globally for view controls
let modelCenter = new THREE.Vector3();
let modelSize = 1;

new RGBELoader(loadingManager).load(
  hdriLocation,
  (texture) => {
      const envMap = pmrem.fromEquirectangular(texture).texture;
      scene.environment = envMap;
      texture.dispose();
  },
  (xhr) => {
      if (xhr.total) {
          const pct = Math.min(99, Math.round((xhr.loaded / xhr.total) * 100));
          //loaderUI.set(pct);
      }
  },
  (err) => {
      console.error("HDRI load error:", err);
      //loaderUI.fail("Env map failed");
      // Don’t block forever:
      //setTimeout(() => loaderUI.hide(), 1200);
  }
);

// Draco loader for compressed geometry
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
dracoLoader.setDecoderConfig({ type: 'js' });

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

let currentModel = null;
let currentEntry = null;
let loadGeneration = 0;
// Per-category state: category name -> array of meshes / color picker input
const categoryMeshes = new Map();
const categoryPickers = new Map();
let currentColorSet = null;

// Selection state for tree-to-3D highlighting
let selectedObj = null;
let selectedTreeItem = null;
const savedEmissives = new Map();
const HIGHLIGHT_COLOR = new THREE.Color(0x3388ff);

// Isolation state
let isolatedObj = null;
let isolatedTreeItem = null;

function highlightObject(obj) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    if (!child.material._cadScopeCloned) {
      child.material = child.material.clone();
      child.material._cadScopeCloned = true;
    }
    savedEmissives.set(child, child.material.emissive.clone());
    child.material.emissive.copy(HIGHLIGHT_COLOR);
  });
}

function unhighlightObject() {
  savedEmissives.forEach((original, mesh) => {
    mesh.material.emissive.copy(original);
  });
  savedEmissives.clear();
  if (selectedTreeItem) selectedTreeItem.classList.remove('selected');
  selectedObj = null;
  selectedTreeItem = null;
}

// Populate model select from manifest
const modelSelect = document.getElementById('modelSelect');
const githubLink = document.querySelector('.header-links a');
models.forEach((entry, i) => {
  const opt = document.createElement('option');
  opt.value = entry.id;
  opt.textContent = entry.name;
  modelSelect.appendChild(opt);
});

function findModel(id) {
  return models.find(m => m.id === id) || models[0];
}

function updateGithubLink(entry) {
  if (entry.github) {
    githubLink.href = entry.github;
    githubLink.textContent = entry.github_text || 'GitHub';
    githubLink.style.display = '';
  } else {
    githubLink.style.display = 'none';
  }
}

// URL query string support
function updateURL() {
  const params = new URLSearchParams();
  params.set('model', currentEntry ? currentEntry.id : models[0].id);
  if (document.getElementById('colorControls').style.display !== 'none') {
    for (const [name, picker] of categoryPickers) {
      if (name !== 'model') {
        params.set(name, picker.value.slice(1));
      }
    }
  }
  history.replaceState(null, '', '?' + params.toString());
}

const urlParams = new URLSearchParams(window.location.search);
const urlModel = urlParams.get('model');
if (urlModel && models.some(m => m.id === urlModel)) {
  modelSelect.value = urlModel;
}
// URL color overrides are consumed once on initial load, then cleared
let urlColorsConsumed = false;

// Populate URL immediately with current model selection
updateURL();

document.getElementById('copyLinkBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const btn = document.getElementById('copyLinkBtn');
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
});

document.getElementById('resetColorsBtn').addEventListener('click', () => {
  if (!currentColorSet || !currentModel) return;
  for (const [name, cat] of Object.entries(currentColorSet.categories)) {
    const picker = categoryPickers.get(name);
    if (picker) picker.value = cat.color;
    const c = new THREE.Color(cat.color);
    const metalness = cat.metalness ?? 0.0;
    const opacity = cat.opacity ?? 1.0;
    (categoryMeshes.get(name) || []).forEach((mesh) => {
      mesh.material.color.copy(c);
      mesh.material.metalness = metalness;
      mesh.material.opacity = opacity;
      mesh.material.transparent = opacity < 1.0;
    });
  }
  updateURL();
});

function cleanNodeName(name) {
  if (!name) return '';
  // Strip path prefixes (keep text after last /)
  let cleaned = name.includes('/') ? name.substring(name.lastIndexOf('/') + 1) : name;
  // Remove .step suffix (case-insensitive, preserving -N numeric suffixes)
  cleaned = cleaned.replace(/\.step/i, '');
  // Remove (mesh) and (group) suffixes
  cleaned = cleaned.replace(/\s*\(mesh\)\s*/i, '').replace(/\s*\(group\)\s*/i, '');
  // Three.js sanitizeNodeName: spaces → underscores, strip [ ] . : /
  cleaned = cleaned.replace(/ /g, '_').replace(/[\[\].:\/]/g, '');
  return cleaned.trim();
}

function stripNumericSuffix(name) {
  return name.replace(/-\d+$/, '');
}

function applyColorSet(colorSet, model) {
  categoryMeshes.clear();

  // Build per-category part sets, colors, and material properties
  const categories = [];
  for (const [name, cat] of Object.entries(colorSet.categories)) {
    const partSet = new Set(cat.parts || []);
    categories.push({ name, partSet, color: new THREE.Color(cat.color), metalness: cat.metalness ?? 0.0, opacity: cat.opacity ?? 1.0 });
    categoryMeshes.set(name, []);
  }

  // First-match semantics: earlier categories win
  model.traverse((obj) => {
    if (!obj.isMesh) return;

    const cleaned = cleanNodeName(obj.name);
    const stripped = stripNumericSuffix(cleaned);
    const parentCleaned = obj.parent ? cleanNodeName(obj.parent.name) : '';

    for (const cat of categories) {
      if (cat.partSet.has(cleaned) || cat.partSet.has(stripped) || cat.partSet.has(parentCleaned)) {
        obj.material = obj.material.clone();
        obj.material.color.copy(cat.color);
        obj.material.roughness = 0.5;
        obj.material.metalness = cat.metalness;
        obj.material.opacity = cat.opacity;
        obj.material.transparent = cat.opacity < 1.0;
        obj.material.side = THREE.DoubleSide;
        categoryMeshes.get(cat.name).push(obj);
        break;
      }
    }
  });
}

function loadColorSet(entry, model) {
  const colorControls = document.getElementById('colorControls');
  if (!entry.colors) {
    colorControls.style.display = 'none';
    updateURL();
    return;
  }
  const colorPath = entry.colors;
  const thisGeneration = loadGeneration;

  fetch(colorPath).then((res) => {
    if (!res.ok) {
      colorControls.style.display = 'none';
      updateURL();
      return;
    }
    return res.json();
  }).then((colorSet) => {
    if (!colorSet || thisGeneration !== loadGeneration) return;
    currentColorSet = colorSet;

    applyColorSet(colorSet, model);

    // Build color picker UI dynamically from categories
    colorControls.innerHTML = '';
    categoryPickers.clear();
    const heading = document.createElement('h3');
    heading.textContent = 'Colors';
    colorControls.appendChild(heading);
    for (const [name, cat] of Object.entries(colorSet.categories)) {
      if (cat.visible === false) continue;

      const row = document.createElement('div');
      row.className = 'color-row';

      const label = document.createElement('label');
      label.textContent = name;

      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = cat.color;

      // Apply URL override on first load
      if (!urlColorsConsumed && name !== 'model') {
        const urlVal = urlParams.get(name);
        if (urlVal) {
          const override = '#' + urlVal;
          picker.value = override;
          const c = new THREE.Color(override);
          (categoryMeshes.get(name) || []).forEach((mesh) => { mesh.material.color.copy(c); });
        }
      }

      picker.addEventListener('input', () => {
        const c = new THREE.Color(picker.value);
        const meshes = categoryMeshes.get(name) || [];
        meshes.forEach((mesh) => { mesh.material.color.copy(c); });
        updateURL();
      });

      row.appendChild(label);
      row.appendChild(picker);
      colorControls.appendChild(row);
      categoryPickers.set(name, picker);
    }

    urlColorsConsumed = true;
    colorControls.style.display = '';
    updateURL();
  }).catch(() => {
    colorControls.style.display = 'none';
    updateURL();
  });
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (!mat) continue;
        for (const value of Object.values(mat)) {
          if (value && value.isTexture) value.dispose();
        }
        mat.dispose();
      }
    }
  });
}

function loadModel(id) {
  const entry = findModel(id);
  currentEntry = entry;

  // Remove and dispose previous model
  if (currentModel) {
    scene.remove(currentModel);
    disposeObject(currentModel);
    currentModel = null;
  }

  // Track load generation so stale callbacks are ignored
  const thisGeneration = ++loadGeneration;

  // Update header GitHub link for this model's project
  updateGithubLink(entry);

  // Hide color controls while loading
  document.getElementById('colorControls').style.display = 'none';

  // Show loading indicator
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  const processingLine = document.getElementById('processingLine');
  const processingText = document.getElementById('processingText');
  overlay.classList.remove('hidden');
  processingLine.classList.add('hidden');
  loadingText.textContent = 'Retrieving 3D model...';

  gltfLoader.load(entry.model, (gltf) => {
    // A newer load was started — discard this result
    if (thisGeneration !== loadGeneration) return;

    currentModel = gltf.scene;
    scene.add(currentModel);

    const box = new THREE.Box3().setFromObject(currentModel);
    modelSize = box.getSize(new THREE.Vector3()).length();
    modelCenter = box.getCenter(new THREE.Vector3());

    // Scale clipping planes to model size
    camera.near = modelSize * 0.001;
    camera.far = modelSize * 100;

    controls.target.copy(modelCenter);
    const direction = new THREE.Vector3();
    direction.subVectors(camera.position, controls.target).normalize();
    camera.position.set(
        modelCenter.x + modelSize,
        modelCenter.y + modelSize,
        modelCenter.z + modelSize
    );
    camera.lookAt(modelCenter);
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();   

    buildTree(currentModel, entry.name);
    loadColorSet(entry, currentModel);
    overlay.classList.add('hidden');
  }, (progress) => {
    if (progress.total) {
      const pct = Math.min(100, progress.loaded / progress.total * 100).toFixed(0);
      loadingText.textContent = `Retrieving 3D model... ${pct}%`;
      if (pct >= 100 && processingLine.classList.contains('hidden')) {
        processingText.textContent = loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)] + '...';
        processingLine.classList.remove('hidden');
      }
    }
  }, (error) => {
    console.error('Error loading model:', error);
    loadingText.textContent = 'Failed to load model.';
  });
}

window.loadModel = loadModel;

// Model selector
modelSelect.addEventListener('change', () => loadModel(modelSelect.value));

// Load the initially selected model
loadModel(modelSelect.value);

function buildTree(sceneRoot, rootLabel) {
  unhighlightObject();
  isolatedObj = null;
  isolatedTreeItem = null;
  const treeContainer = document.getElementById('tree');
  treeContainer.innerHTML = '';

  // Skip the glTF "Scene" wrapper — start from its first child
  const root = (sceneRoot.children.length === 1 && sceneRoot.name === 'Scene')
    ? sceneRoot.children[0]
    : sceneRoot;

  // Map Three.js objects to their tree item DOM elements for syncing
  const objToTreeItem = new Map();

  function syncTreeItemVisibility(treeItem, visible) {
    const cb = treeItem._checkbox;
    if (cb) {
      cb.checked = visible;
      if (visible) {
        treeItem.classList.remove('hidden');
      } else {
        treeItem.classList.add('hidden');
      }
    }
  }

  function isAncestorOf(ancestor, obj) {
    let current = obj.parent;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  }

  function isolateNode(obj, treeItem) {
    if (isolatedObj === obj) {
      // Un-isolate: restore everything to visible
      unisolateAll();
      return;
    }

    // Clear previous isolation marker
    if (isolatedTreeItem) isolatedTreeItem.classList.remove('isolated');

    isolatedObj = obj;
    isolatedTreeItem = treeItem;
    treeItem.classList.add('isolated');

    // Walk the entire scene tree and set visibility
    function setVisibility(node) {
      const item = objToTreeItem.get(node);
      if (node === obj || isAncestorOf(obj, node)) {
        // Descendant of isolated node or the node itself — show
        node.visible = true;
        if (item) syncTreeItemVisibility(item, true);
      } else if (isAncestorOf(node, obj)) {
        // Ancestor of isolated node — show (so descendants render)
        node.visible = true;
        if (item) syncTreeItemVisibility(item, true);
      } else {
        // Everything else — hide
        node.visible = false;
        if (item) syncTreeItemVisibility(item, false);
      }
      if (node.children) {
        node.children.forEach(child => setVisibility(child));
      }
    }

    setVisibility(root);
  }

  function unisolateAll() {
    if (isolatedTreeItem) isolatedTreeItem.classList.remove('isolated');
    isolatedObj = null;
    isolatedTreeItem = null;

    // Restore all nodes to visible
    function restoreVisibility(node) {
      node.visible = true;
      const item = objToTreeItem.get(node);
      if (item) syncTreeItemVisibility(item, true);
      if (node.children) {
        node.children.forEach(child => restoreVisibility(child));
      }
    }

    restoreVisibility(root);
  }

  function createTreeItem(obj, parentElement, depth = 0) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'tree-item';
    objToTreeItem.set(obj, itemDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'tree-item-content';

    // Toggle arrow for items with children
    const toggleSpan = document.createElement('span');
    toggleSpan.className = 'tree-toggle';
    if (obj.children && obj.children.length > 0) {
      toggleSpan.textContent = depth === 0 ? '▼' : '▶';
    }
    contentDiv.appendChild(toggleSpan);

    // Visibility checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'tree-checkbox';
    checkbox.checked = obj.visible;
    checkbox.addEventListener('change', (e) => {
      obj.visible = e.target.checked;
      if (e.target.checked) {
        itemDiv.classList.remove('hidden');
      } else {
        itemDiv.classList.add('hidden');
      }
    });
    contentDiv.appendChild(checkbox);
    itemDiv._checkbox = checkbox;

    // Object name — click to highlight in 3D view
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = (depth === 0 && rootLabel) ? rootLabel : (obj.name || obj.type || 'Object');
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selectedObj === obj) {
        unhighlightObject();
      } else {
        unhighlightObject();
        selectedObj = obj;
        selectedTreeItem = itemDiv;
        itemDiv.classList.add('selected');
        highlightObject(obj);
      }
    });
    contentDiv.appendChild(label);

    // Isolate button — appears on hover, isolates this node
    const isolateBtn = document.createElement('span');
    isolateBtn.className = 'tree-isolate-btn';
    isolateBtn.textContent = '⊚';
    isolateBtn.title = 'Isolate this node';
    isolateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isolateNode(obj, itemDiv);
    });
    contentDiv.appendChild(isolateBtn);

    itemDiv.appendChild(contentDiv);

    // Children container
    if (obj.children && obj.children.length > 0) {
      const childrenDiv = document.createElement('div');
      childrenDiv.className = 'tree-children' + (depth === 0 ? ' expanded' : '');

      // Add toggle functionality
      toggleSpan.addEventListener('click', () => {
        childrenDiv.classList.toggle('expanded');
        toggleSpan.textContent = childrenDiv.classList.contains('expanded') ? '▼' : '▶';
      });

      // Recursively add children
      obj.children.forEach(child => {
        createTreeItem(child, childrenDiv, depth + 1);
      });

      itemDiv.appendChild(childrenDiv);
    }

    parentElement.appendChild(itemDiv);
  }

  createTreeItem(root, treeContainer);
}

// Scene tree search — filters and highlights matching nodes
const treeSearch = document.getElementById('treeSearch');
const treeSearchClear = document.getElementById('treeSearchClear');
const searchWrapper = treeSearch.parentElement;
let searchDebounce = null;

function onSearchInput() {
  searchWrapper.classList.toggle('has-value', treeSearch.value.length > 0);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => filterTree(treeSearch.value), 150);
}
treeSearch.addEventListener('input', onSearchInput);

treeSearchClear.addEventListener('click', () => {
  treeSearch.value = '';
  searchWrapper.classList.remove('has-value');
  filterTree('');
  treeSearch.focus();
});

function filterTree(query) {
  const tree = document.getElementById('tree');
  const allItems = tree.querySelectorAll('.tree-item');
  const q = query.trim().toLowerCase();

  if (!q) {
    // Clear search state and collapse all except top-level node
    allItems.forEach(item => {
      item.classList.remove('search-match', 'search-hidden');
    });
    tree.querySelectorAll('.tree-children').forEach(div => {
      const isTopLevel = div.parentElement.parentElement === tree;
      const toggle = div.parentElement.querySelector(':scope > .tree-item-content > .tree-toggle');
      if (isTopLevel) {
        div.classList.add('expanded');
        if (toggle) toggle.textContent = '▼';
      } else {
        div.classList.remove('expanded');
        if (toggle) toggle.textContent = '▶';
      }
    });
    return;
  }

  // Bottom-up: process deepest nodes first so we can propagate upward.
  // querySelectorAll returns document order (top-down), so reverse it.
  const items = Array.from(allItems).reverse();

  items.forEach(item => {
    const label = item.querySelector(':scope > .tree-item-content > .tree-label');
    const nameMatches = label && label.textContent.toLowerCase().includes(q);
    const childItems = item.querySelectorAll(':scope > .tree-children > .tree-item:not(.search-hidden)');
    const hasVisibleChild = childItems.length > 0;

    if (nameMatches || hasVisibleChild) {
      item.classList.remove('search-hidden');
      item.classList.toggle('search-match', nameMatches);

      // Auto-expand to reveal matches in children
      if (hasVisibleChild) {
        const childrenDiv = item.querySelector(':scope > .tree-children');
        const toggle = item.querySelector(':scope > .tree-item-content > .tree-toggle');
        if (childrenDiv && !childrenDiv.classList.contains('expanded')) {
          childrenDiv.classList.add('expanded');
          if (toggle) toggle.textContent = '▼';
        }
      }
    } else {
      item.classList.add('search-hidden');
      item.classList.remove('search-match');
    }
  });
}

// View control function
window.setView = function(view) {
  const distance = modelSize * 1.5;
  controls.target.copy(modelCenter);

  switch(view) {
    case 'top':
      camera.position.set(modelCenter.x, modelCenter.y + distance, modelCenter.z);
      camera.up.set(0, 0, -1);
      break;
    case 'bottom':
      camera.position.set(modelCenter.x, modelCenter.y - distance, modelCenter.z);
      camera.up.set(0, 0, 1);
      break;
    case 'front':
      camera.position.set(modelCenter.x, modelCenter.y, modelCenter.z + distance);
      camera.up.set(0, 1, 0);
      break;
    case 'back':
      camera.position.set(modelCenter.x, modelCenter.y, modelCenter.z - distance);
      camera.up.set(0, 1, 0);
      break;
    case 'right':
      camera.position.set(modelCenter.x + distance, modelCenter.y, modelCenter.z);
      camera.up.set(0, 1, 0);
      break;
    case 'left':
      camera.position.set(modelCenter.x - distance, modelCenter.y, modelCenter.z);
      camera.up.set(0, 1, 0);
      break;
    case 'home':
      camera.position.set(
        modelCenter.x + modelSize,
        modelCenter.y + modelSize,
        modelCenter.z + modelSize
      );
      camera.up.set(0, 1, 0);
      break;
  }

  camera.lookAt(modelCenter);
  camera.updateProjectionMatrix();
  controls.update();
};

// Zoom function
window.zoom = function(factor) {
  // Calculate direction from target to camera
  const direction = new THREE.Vector3();
  direction.subVectors(camera.position, controls.target);

  // Scale the direction by the factor
  const newDistance = direction.length() * (1 + factor);

  // Prevent zooming too close or too far
  const minDistance = modelSize * 0.1;
  const maxDistance = modelSize * 10;

  if (newDistance >= minDistance && newDistance <= maxDistance) {
    direction.normalize().multiplyScalar(newDistance);
    camera.position.copy(controls.target).add(direction);
    camera.updateProjectionMatrix();
  }
};

// Reset zoom to default distance
window.resetZoom = function() {
  const direction = new THREE.Vector3();
  direction.subVectors(camera.position, controls.target).normalize();
  camera.position.copy(controls.target).add(direction.multiplyScalar(modelSize * 1.5));
  camera.updateProjectionMatrix();
};


function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
