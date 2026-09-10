# CADScope

![Version](https://img.shields.io/badge/version-1.9.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Three.js](https://img.shields.io/badge/Three.js-0.164.1-black)
![Platform](https://img.shields.io/badge/platform-browser-orange)

A browser-based 3D viewer for CAD assemblies, built with Three.js. Converts STEP files to Draco-compressed GLB with per-part colors and displays them in an interactive viewer with a scene hierarchy, preset camera views, and shareable configurations.

Live at [cadscope.erik.build](https://cadscope.erik.build).

## Using the viewer

Serve the project root and open it — no build step:

```sh
python3 -m http.server 8000
open http://localhost:8000/
```

Pick an assembly from the dropdown, or link straight to one with `?model=<id>`
using an id from `models/models.js`.

### Controls

- **Left-drag** — Orbit
- **Middle/right-drag** — Pan
- **Scroll** — Zoom
- **View buttons** (top-right) — Preset angles, zoom, and a brightness slider

### Sidebar

- **Assembly** — Switch models. Large models download on demand, with a progress bar; mobile browsers get a size warning first rather than an automatic 40–100 MB fetch.
- **Copy URL** — Share what you're looking at. Color changes, hidden nodes, and the isolated node are packed into the link.
- **Reset Defaults** — Restore the model's shipped colors and visibility.
- **Color pickers** — Change per-category colors live (shown when the model has a color set).
- **Model hierarchy** — Expand/collapse nodes and toggle visibility, with a search box for finding parts by name. The root node shows the model's `name` from `models.js`. Labels are prettified (underscores → spaces, lowercase words capitalized, CAD duplicate suffixes like `(2)`/`003`/`v2` stripped); a sidecar `displayName` overrides this, and hovering shows the raw node name. `setRawNames(true)` in the browser console temporarily shows unmodified names — handy while authoring spec paths and `autoAssign` globs; `setRawNames(false)` restores.
- **Isolate** (⊚, hover a tree row) — Hide everything except that node and its ancestors/descendants, framing it in view. Click again to restore.

### Title bar

- **Enable SpaceMouse** — 3Dconnexion 6-axis navigation; off by default (see below).
- **Theme switch** — Dark (default) or light; remembered per browser.
- **Settings** (gear) — SpaceMouse axis mapping and a Special section.

### SpaceMouse

CADScope talks to 3Dconnexion's own driver, so your device settings — speed, sensitivity, per-app profiles — apply as configured, and the driver's built-in buttons (Fit, Top, Front, …) work without extra setup.

Requirements:

- 3Dconnexion's **3DxWare driver installed and running** on the same machine as the browser. The viewer connects to the driver's local WebSocket service, so the browser may ask to allow local network access.
- A **Chromium-based browser** (Chrome, Edge).
- The **tab must be focused** — the driver routes motion to the frontmost application.

Enable it with the title-bar toggle; the choice persists per browser. Without the driver the viewer stays dormant, logging a single console line. The settings modal maps each puck direction (Right, Left, In, Out, Down, Up) to a motion action, mirroring the driver's own Axes screen — mapping a direction to its opposite inverts that axis, and a quick checkbox swaps In-Out with Down-Up.

## Adding a model

1. Convert a STEP file to GLB (below) and place it in `models/`.
2. Generate the color sidecar (below).
3. Add an entry to `models/models.js` — array order sets dropdown order:

```js
{
  id: "Milo_V2.RC3",                            // used in ?model= links
  name: "Milo V2 RC3",                          // dropdown + tree root label
  model: "models/Milo_V2.RC3.glb",
  colors: "models/Milo_V2.RC3.colors.json",     // or null
  github: "https://github.com/MillenniumMachines/Milo-V2.0",
  github_text: "Milo V2 by Millennium Machines on GitHub"
}
```

Models converted from third-party CAD carry their original licenses — record attribution in `models/NOTICE.md` alongside the license text.

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

# STEP modeled with Y as the vertical axis (Fusion "Y up" designs)
./model_converter/convert.sh --y-up models/input.step models/output.glb
```

The converter assumes Z-up STEP input. If the model loads lying on its side, re-run with `--y-up`.

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
| `build_configurator.py` | Authoring tool: emits the scaffold and starter spec, then generates the viewer sidecar and configurator manifest |
| `dump_parts.py` | Backwards-compatibility shim that calls `build_configurator.py --scaffold-only` |

## Authoring a model spec

A `<model>.spec.yaml` next to the GLB is the source of truth for how a model is presented. `build_configurator.py` reads it and generates `<model>.colors.json` (the viewer sidecar) and `<model>.manifest.json` (for configurable models shipped in different part combinations).

One-time setup — install the Python deps in a venv next to the converter scripts:

```sh
python3 -m venv model_converter/.venv
model_converter/.venv/bin/pip install -r model_converter/requirements.txt
```

**First run** (no sibling spec) writes:

- **`model.scaffold.json`** — reference dump of `_groups`, `_parts`, and `_nodes` (path → name, in tree order). Always overwritten; use it as a paste source while editing the spec.
- **`model.spec.yaml`** — starter spec with a seeded palette and empty rules. Only written if absent, so your edits survive re-runs.

```sh
model_converter/.venv/bin/python model_converter/build_configurator.py model.glb
```

Then fill in the spec: define palette categories, write `autoAssign` glob rules against names from the scaffold, and add per-node overrides keyed by scaffold paths.

**Second run** (spec present) regenerates `model.colors.json` and `model.manifest.json`. Validate without writing — including an `autoAssign` coverage report — via:

```sh
model_converter/.venv/bin/python model_converter/build_configurator.py --check model.glb
```

**Full schema reference: [`model_converter/SPEC.md`](model_converter/SPEC.md)**, covering the palette, visibility DSL, configurable options, and STL download groups. The essentials:

- **`palette`** — named categories with color and material properties. Each gets a sidebar swatch unless `showInPicker: false`; `showInTree: false` drops its nodes from the hierarchy while still rendering them.
- **`autoAssign`** — ordered glob rules assigning categories by node name, first match wins. Globs match a node's **leaf name** (`*` any sequence, `?` one character), and a category propagates to descendant meshes — categorize a whole assembly with one entry.
- **`nodes`** — per-node overrides keyed by slash-joined path from the visual root: `displayName`, `category`, `hidden`, conditional `visible`, and STL paths. A per-node `category` always beats an `autoAssign` match.

### Node keys: paths vs. bare leaves

The canonical key format for `nodes` is the slash-joined path from the visual root. Bare leaf names (no slash) are accepted as a forgiveness fallback — they resolve via the same name-cleaning logic as the conversion pipeline (strips path prefixes, `.step` suffixes, `(mesh)`/`(group)` suffixes) and will retry with a trailing `-N` numeric suffix stripped. Bare-leaf keys log a console warning to nudge you toward paths.

## Development

The viewer is dependency-free ES modules — no bundler, no install step. Logic that can be tested without a browser lives in small modules under `assets/` with suites in `tests/`:

```sh
node --test tests/*.test.js                                        # viewer modules
model_converter/.venv/bin/python -m unittest discover -s model_converter -q   # converter
```

| Path | Contents |
|------|----------|
| `index.html`, `assets/viewer.js` | Page shell and the viewer (scene, tree, controls, panels) |
| `assets/` modules | `settings`, `spacemouse`, `coralwave`, `prettify`, `share_codec`, `cadscope_state`, `theme` |
| `models/` | GLBs, specs, generated sidecars, `models.js`, and `NOTICE.md` |
| `model_converter/` | STEP→GLB pipeline, spec parser, and `SPEC.md` |

Large binaries (`.step`) and generated scaffolds stay out of git; see `.gitignore`.

## License

MIT for the code — see [LICENSE](LICENSE). Converted models keep their upstream licenses; see [`models/NOTICE.md`](models/NOTICE.md).

## Future Possibilities...

??? ask! pull request!
