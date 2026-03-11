# CADScope

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Three.js](https://img.shields.io/badge/Three.js-0.161.0-black)
![Platform](https://img.shields.io/badge/platform-browser-orange)

A browser-based 3D Viewer for CAD Assemblies, built with Three.js. Converts STEP files to Draco-compressed GLB with per-part colors and displays them in an interactive viewer with a scene hierarchy and preset camera views.

## Viewing

1. Place a GLB file (preferrably draco compressed) in `models/` (the viewer loads the path set in `index.html`)
2. Serve the project root: `python -m http.server 8000`
3. Open http://localhost:8000/index.html

### Controls

- **Left-drag** — Orbit
- **Middle/right-drag** — Pan
- **Scroll** — Zoom
- **View buttons** (top-right) — Preset angles + zoom
- **Scene hierarchy** (left sidebar) — Expand/collapse nodes, toggle visibility. The root node displays the model's `name` from `models.js`
- **Color pickers** (left sidebar) — Change per-category part colors in real-time (when a color set file exists)

## Converting STEP to GLB

**Prerequisites:**
- Python 3 (for STEP color extraction; stdlib only)
- [Blender 5.0+](https://www.blender.org/download/) at `/Applications/Blender.app`
- [FreeCAD 1.0+](https://www.freecad.org/downloads.php) at `/Applications/FreeCAD.app`
--> you'll need to modify this to run on Linux or Windows; YMMV.

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
| `dump_parts.py` | Extracts node names from a GLB into a `.colors.json` template |

## Color Sets

Color sets let you visualize different color schemes on 3D-printed assemblies by grouping parts into named categories (e.g. "Main", "Accent", "Extrusions"). A color picker appears in the sidebar for each category defined in the color set file.

### Quick Setup

To scaffold a `.colors.json` from an existing GLB, use `dump_parts.py`:

```sh
python3 model_converter/dump_parts.py model.glb              # writes model.colors.json next to the GLB
python3 model_converter/dump_parts.py model.glb -o out.json  # explicit output path
```

This extracts all node names from the GLB and writes a template with empty categories plus two reference lists (`_groups` and `_parts`). Move names into category `parts` arrays, then delete the `_` keys.

Models without a `.colors.json` file simply won't show the color pickers — no errors.

### Manual Setup
Create a JSON file next to the GLB, named `{model}.colors.json`:

```json
{
  "categories": {
    "Main": {
      "color": "#FF6600",
      "parts": ["PartNameA", "PartNameB"]
    },
    "Accent": {
      "color": "#00AAFF",
      "parts": ["PartNameC", "PartNameD"]
    }
  }
}
```

Add as many categories as you need — each one gets its own color picker in the sidebar. If a part matches multiple categories, the first one in file order wins.

For example, `models/Positron_v3.2.2.glb` looks for `models/Positron_v3.2.2.colors.json`.

Part names should match what you see in the sidebar hierarchy. The viewer uses the same name-cleaning logic as the conversion pipeline (strips path prefixes, `.step` suffixes, `(mesh)`/`(group)` suffixes) and will also try matching with trailing numeric suffixes (`-1`, `-2`, etc.) stripped, then fall back to the parent node name.

## Future Possibilities...

??? ask! pull request!

## Credits

The general look and feel was shamelessly copied, with love, from the VERY GOOD [A4T Configurator](https://a4t.dwtas.net/) for the [A4T from Armchair Heavy Industries](https://github.com/Armchair-Heavy-Industries/A4T).