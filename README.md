# CADScope

A browser-based 3D Viewer for CAD Assemblies (originally, the Prusawire 3D Printer), built with Three.js. Converts STEP files to Draco-compressed GLB with per-part colors and displays them in an interactive viewer with a scene hierarchy and preset camera views.

## Viewing

1. Place a GLB file (preferrably draco compressed) in `models/` (the viewer loads the path set in `index.html`)
2. Serve the project root: `python -m http.server 8000`
3. Open http://localhost:8000/index.html

### Controls

- **Left-drag** — Orbit
- **Middle/right-drag** — Pan
- **Scroll** — Zoom
- **View buttons** (top-right) — Preset angles + zoom
- **Scene hierarchy** (left sidebar) — Expand/collapse nodes, toggle visibility

## Converting STEP to GLB

**Prerequisites:**
- Python 3 (for STEP color extraction; stdlib only)
- [Blender 5.0+](https://www.blender.org/download/) at `/Applications/Blender.app`
- [FreeCAD 1.0+](https://www.freecad.org/downloads.php) at `/Applications/FreeCAD.app`

```sh
./model_converter/convert.sh models/input.step models/output.glb

# Without Draco compression
./model_converter/convert.sh --no-draco models/input.step models/output.glb
```

### Pipeline

```
STEP → extract colors (Python) → FreeCAD (geometry + hierarchy) → Blender (apply colors + Draco) → GLB
```

Per-part colors are parsed directly from the STEP text (ISO 10303-21) since FreeCAD's headless mode can't access them. Colors are passed to Blender via a JSON sidecar and applied as Principled BSDF materials. Color extraction is non-fatal — if it fails, the pipeline still produces a valid GLB without colors.

You can inspect a STEP file's materials standalone:

```sh
python3 model_converter/extract_step_colors.py input.step /tmp/colors.json
```

### Converter scripts

| File | Role |
|------|------|
| `convert.sh` | Orchestrates the three-stage pipeline |
| `extract_step_colors.py` | Parses STEP text for color-to-part mappings (Python 3, no dependencies) |
| `step_to_glb.py` | FreeCAD script: STEP import, tessellation, uncompressed GLB export |
| `blender_export.py` | Blender script: GLB import, name cleaning, color application, Draco export |


### Future Possibilities...

- Would be cool to be able to select an item in the hierarchy and have it highlighted in the render
- Color Visualizer: Change color of [main] and [accent] parts.
    - Save configs/combinations?