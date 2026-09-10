// ABOUTME: Model manifest defining available assemblies for the viewer.
// ABOUTME: Single source of truth for model paths, display names, colors, and project links.

/**
 * ADDING A NEW MODEL:
 * 1. Convert your STEP file to GLB using model_converter/convert.sh
 * 2. Generate the .colors.json sidecar from the GLB:
 *      model_converter/.venv/bin/python model_converter/build_configurator.py model.glb
 *    (writes model.colors.json + model.scaffold.json; if a sibling
 *     model.spec.yaml exists, also emits model.manifest.json — see
 *     model_converter/SPEC.md)
 * 3. Place files in models/
 * 4. Add an entry below — order in the array determines order in the dropdown
 *
 * FIELDS:
 *   id          - Unique identifier, used in URL query strings
 *   name        - Display name shown in the Assembly dropdown and scene tree root
 *   model       - Path to the .glb file (relative to web root)
 *   colors      - Path to the .colors.json file, or null if none
 *   github      - URL to the project's GitHub repo, or null
 *   github_text - Link text for the GitHub link, or null
 *
 * Sidecar format is documented in README.md ("Color Sets") and
 * model_converter/SPEC.md. Top-level keys are `palette`, `autoAssign`,
 * and `nodes`.
 */
export const models = [
  {
    id: "Prusawire_2026.R1",
    name: "Prusawire 2026.R1",
    model: "models/Prusawire_2026.R1.glb",
    colors: "models/Prusawire_2026.R1.colors.json",
    github: "https://github.com/Positron3D/Prusawire",
    github_text: "Prusawire 2026.R1 by Positron 3D on GitHub"
  },
  {
    id: "Positron_v3.2.2",
    name: "Positron v3.2.2",
    model: "models/Positron_v3.2.2.glb",
    colors: "models/Positron_v3.2.2.colors.json",
    github: "https://github.com/Positron3D/Positron",
    github_text: "Positron V3.2.2 by Positron 3D on GitHub"
  },
  {
    id: "Doron_Velta_R2",
    name: "Doron Velta R2",
    model: "models/Doron_Velta_R2.glb",
    colors: "models/Doron_Velta_R2.colors.json",
    github: "https://github.com/rogerlz/Doron-Velta",
    github_text: "Doron Velta by Rogerio Goncalves on GitHub"
  }
];
