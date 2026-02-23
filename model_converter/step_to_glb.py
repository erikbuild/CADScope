"""
FreeCAD Python script: Convert STEP to GLB with full assembly hierarchy.

Usage (run via FreeCAD's CLI):
    freecadcmd -c "exec(open('step_to_glb.py').read())" -- input.step output.glb

Produces an uncompressed GLB that preserves the STEP assembly tree.
Pipe through Blender for Draco compression (see convert.sh).
"""

import FreeCAD
import Import
import sys
import os
import time


def parse_args():
    """Parse arguments after '--' in the command line."""
    try:
        sep = sys.argv.index("--")
    except ValueError:
        print("Error: pass arguments after '--'")
        print("Usage: freecadcmd step_to_glb.py -- input.step output.glb")
        sys.exit(1)

    args = sys.argv[sep + 1:]
    paths = [a for a in args if not a.startswith("--")]

    if len(paths) < 2:
        print("Error: need input and output paths")
        print("Usage: freecadcmd step_to_glb.py -- input.step output.glb")
        sys.exit(1)

    return os.path.abspath(paths[0]), os.path.abspath(paths[1])


def main():
    input_path, output_path = parse_args()

    if not os.path.isfile(input_path):
        print(f"Error: input file not found: {input_path}")
        sys.exit(1)

    print(f"\n--- STEP to GLB (FreeCAD) ---")
    print(f"Input:  {input_path}")
    print(f"Output: {output_path}\n")

    doc = FreeCAD.newDocument("convert")

    # Import STEP
    print("Importing STEP...")
    t0 = time.time()
    Import.insert(input_path, "convert")
    t1 = time.time()
    print(f"Import took {t1 - t0:.1f}s, {len(doc.Objects)} objects")

    # Tessellate all shapes so glTF export includes geometry
    print("Tessellating...")
    count = 0
    for obj in doc.Objects:
        if hasattr(obj, "Shape") and obj.Shape.Faces:
            obj.Shape.tessellate(0.1)
            count += 1
    t2 = time.time()
    print(f"Tessellated {count} shapes in {t2 - t1:.1f}s")

    # Find root App::Part objects for export
    roots = [o for o in doc.Objects if o.TypeId == "App::Part" and not o.InList]
    if not roots:
        roots = [o for o in doc.Objects if not o.InList]
    print(f"Exporting roots: {[r.Label for r in roots]}")

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    # Export to GLB (uncompressed — Blender adds Draco later)
    print("Exporting GLB...")
    Import.export(roots, output_path)
    t3 = time.time()
    print(f"Export took {t3 - t2:.1f}s")

    input_mb = os.path.getsize(input_path) / (1024 * 1024)
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\nDone!")
    print(f"  Input:   {input_mb:.1f} MB")
    print(f"  Output:  {size_mb:.1f} MB")


main()
