# PosiViewer3D

A browser-based 3D viewer for the V0.2R1 3D printer assembly, built with Three.js. Converts STEP/USDZ CAD files to Draco-compressed GLB and displays them in an interactive viewer with a scene hierarchy and preset camera views.

## Project Structure

```
posiviewer3d.html              # Main 3D viewer (Three.js + OrbitControls + Draco)
model_converter/
  ├── convert.sh               # CAD → GLB conversion wrapper
  ├── extract_step_colors.py   # STEP color parser (standalone Python 3)
  ├── step_to_glb.py           # FreeCAD script: STEP → GLB (preserves hierarchy)
  ├── convert_usdz.py          # Blender script: import + apply colors + Draco → GLB
  └── Assem1.glb               # Converted/compressed model (~17 MB)
Samples/
  ├── V0.2R1_Master_Assembly.step   # Source STEP file (179 MB)
  └── V0.2R1_Master_Assembly.usdz   # Source USDZ file (33 MB)
```

## Viewing the Model

1. Copy (or symlink) the GLB into a `models/` directory at the project root — the viewer loads from `/models/Assem1.glb`:

   ```sh
   mkdir -p models
   cp model_converter/Assem1.glb models/
   ```

2. Start a local HTTP server:

   ```sh
   python -m http.server 8000
   ```

3. Open http://localhost:8000/posiviewer3d.html

### Viewer Controls

- **Left-drag** — Orbit
- **Middle/right-drag** — Pan
- **Scroll** — Zoom
- **View buttons** (top-right) — Preset angles: Top, Front, Right, Bottom, Back, Left, Iso, Home
- **Scene hierarchy** (left sidebar) — Expand/collapse nodes, toggle visibility with checkboxes

## Converting CAD to GLB

The `convert.sh` script converts STEP or USDZ files to Draco-compressed GLB. STEP conversion preserves the full assembly hierarchy (subassemblies, parts).

**Prerequisites:**
- Python 3 (for STEP color extraction; uses only the standard library)
- [Blender 5.0+](https://www.blender.org/download/) installed at `/Applications/Blender.app`
- [FreeCAD 1.0+](https://www.freecad.org/downloads.php) installed at `/Applications/FreeCAD.app` (for STEP files only)

```sh
cd model_converter

# Convert STEP (recommended — preserves assembly hierarchy)
./convert.sh ../models/V0.2R1_Master_Assembly.step ../models/V0.2R1_Master_Assembly.glb

# Convert USDZ (flat hierarchy — assembly structure is lost in USDZ format)
./convert.sh ../models/V0.2R1_Master_Assembly.usdz ../models/output.glb

# Disable Draco compression
./convert.sh --no-draco ../models/V0.2R1_Master_Assembly.step ../models/output.glb
```

The script automatically cleans node names (strips path prefixes, `.step` extensions, and `(mesh)`/`(group)` suffixes).

## Conversion Pipeline

```
STEP → extract colors (Python) → FreeCAD (geometry + hierarchy) → Blender (apply colors + Draco) → GLB
USDZ → Blender (import + Draco) → GLB
```

For STEP files, per-part material colors are extracted directly from the STEP text (ISO 10303-21) before the FreeCAD stage. This is needed because FreeCAD's headless mode (`freecadcmd`) doesn't initialize the GUI layer where STEP colors are stored. The extracted colors are passed to Blender via a JSON sidecar and applied as Principled BSDF materials. Color extraction is non-fatal — if it fails, the pipeline still produces a valid GLB (just without colors).

You can also run the color extractor standalone to inspect a STEP file's materials:

```sh
python3 model_converter/extract_step_colors.py models/input.step /tmp/colors.json
```

## Dependencies

**posiviewer3d.html** (CDN, no build step):
- Three.js v0.161.0 (GLTFLoader, DRACOLoader, OrbitControls)
- Draco WASM decoders from Google CDN
