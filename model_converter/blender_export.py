"""
Blender Python script: Import GLB from FreeCAD, apply colors, and export
as Draco-compressed GLB.

Usage (run via Blender's embedded Python):
    blender --background --python blender_export.py -- [--no-draco] [--colors colors.json] input.glb output.glb
"""

import bpy
import sys
import os
import re
import json


def clean_node_name(name):
    """Clean up node names from FreeCAD GLB export."""
    if not name:
        return name

    # Extract just the final component (after the last /)
    clean = name.split("/")[-1]

    # Remove .step extension (case insensitive), preserving trailing "-N" if present
    # e.g. "Part.step-1" → "Part-1", "Part.step" → "Part"
    clean = re.sub(r"\.step(-\d+)$", r"\1", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\.step$", "", clean, flags=re.IGNORECASE)

    # Remove (mesh) and (group) suffixes
    clean = re.sub(r"\s*\(mesh\)\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s*\(group\)\s*", "", clean, flags=re.IGNORECASE)

    return clean.strip()


def strip_numeric_suffix(name):
    """Strip FreeCAD/Blender numeric suffixes for fallback matching."""
    # Blender duplicate: "Name.001" → "Name"
    m = re.match(r'^(.+)\.\d{3}$', name)
    if m:
        return m.group(1)
    # FreeCAD duplicate: "Name001" → "Name" (3+ trailing digits after non-digit)
    m = re.match(r'^(.*[^\d])\d{3}$', name)
    if m:
        return m.group(1)
    # STEP instance: "Name-1" → "Name"
    m = re.match(r'^(.+)-\d+$', name)
    if m:
        return m.group(1)
    return name


def apply_colors(colors_path):
    """Apply per-part colors from a JSON sidecar file to Blender objects."""
    with open(colors_path, 'r') as f:
        data = json.load(f)

    materials_data = data.get('materials', {})
    objects_data = data.get('objects', {})

    if not materials_data or not objects_data:
        print("No color data to apply")
        return

    # Create one Blender material per unique color
    bl_materials = {}
    for color_name, rgb in materials_data.items():
        mat = bpy.data.materials.new(name=color_name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        bl_materials[color_name] = mat

    # Build lookup: cleaned part name → color name
    # Apply clean_node_name() to JSON keys (they come from PRODUCT_DEFINITION names)
    name_to_color = {}
    for part_name, color_name in objects_data.items():
        cleaned = clean_node_name(part_name)
        name_to_color[cleaned] = color_name

    # Also build stripped-suffix lookup for fallback
    stripped_to_color = {}
    for name, color_name in name_to_color.items():
        stripped = strip_numeric_suffix(name)
        if stripped not in stripped_to_color:
            stripped_to_color[stripped] = color_name

    # Apply materials to mesh objects
    applied = 0
    unmatched = []
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or obj.data is None:
            continue

        name = obj.name
        color_name = name_to_color.get(name)

        if not color_name:
            # Try without numeric suffix
            color_name = stripped_to_color.get(strip_numeric_suffix(name))

        if not color_name and obj.parent:
            # Try parent name
            color_name = name_to_color.get(obj.parent.name)
            if not color_name:
                color_name = stripped_to_color.get(strip_numeric_suffix(obj.parent.name))

        if color_name and color_name in bl_materials:
            obj.data.materials.clear()
            obj.data.materials.append(bl_materials[color_name])
            applied += 1
        else:
            unmatched.append(name)

    print(f"Applied colors to {applied} objects")
    if unmatched:
        preview = unmatched[:10]
        extra = f" (and {len(unmatched) - 10} more)" if len(unmatched) > 10 else ""
        print(f"Unmatched objects ({len(unmatched)}): {preview}{extra}")


def parse_args():
    """Parse arguments after '--' in the Blender command line."""
    try:
        sep = sys.argv.index("--")
    except ValueError:
        print("Error: pass arguments after '--'")
        print("Usage: blender -b -P blender_export.py -- [--no-draco] [--colors colors.json] input.glb output.glb")
        sys.exit(1)

    args = sys.argv[sep + 1:]
    no_draco = False
    colors_path = None
    paths = []

    i = 0
    while i < len(args):
        if args[i] == '--no-draco':
            no_draco = True
            i += 1
        elif args[i] == '--colors' and i + 1 < len(args):
            colors_path = args[i + 1]
            i += 2
        else:
            paths.append(args[i])
            i += 1

    if len(paths) < 2:
        print("Error: need input and output paths")
        print("Usage: blender -b -P blender_export.py -- [--no-draco] [--colors colors.json] input.glb output.glb")
        sys.exit(1)

    return paths[0], paths[1], no_draco, colors_path


def clear_scene():
    """Remove all default objects from the scene."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    bpy.ops.outliner.orphans_purge(do_recursive=True)


def main():
    input_path, output_path, no_draco, colors_path = parse_args()

    input_path = os.path.abspath(input_path)
    output_path = os.path.abspath(output_path)

    if not os.path.isfile(input_path):
        print(f"Error: input file not found: {input_path}")
        sys.exit(1)

    print(f"\n--- Blender GLB Export ---")
    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print(f"Draco:  {'disabled' if no_draco else 'enabled'}")
    print(f"Colors: {colors_path or 'none'}\n")

    # Clear the default scene
    clear_scene()

    # Import GLB from FreeCAD
    print("Importing glTF...")
    bpy.ops.import_scene.gltf(filepath=input_path)

    # Clean up object names
    renamed = 0
    for obj in bpy.data.objects:
        old_name = obj.name
        new_name = clean_node_name(old_name)
        if new_name and new_name != old_name:
            obj.name = new_name
            renamed += 1

    # Also clean mesh data-block names
    for mesh in bpy.data.meshes:
        old_name = mesh.name
        new_name = clean_node_name(old_name)
        if new_name and new_name != old_name:
            mesh.name = new_name

    obj_count = len(bpy.data.objects)
    print(f"Imported {obj_count} objects, renamed {renamed}")

    # Apply colors from JSON sidecar (STEP pipeline only)
    if colors_path and os.path.isfile(colors_path):
        print("Applying colors...")
        apply_colors(colors_path)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    # Export GLB
    print("Exporting GLB...")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_draco_mesh_compression_enable=not no_draco,
        export_draco_mesh_compression_level=6,
        export_normals=True,
        export_materials="EXPORT",
    )

    # Summary
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    input_mb = os.path.getsize(input_path) / (1024 * 1024)
    print(f"\nDone!")
    print(f"  Objects: {obj_count}")
    print(f"  Input:   {input_mb:.1f} MB")
    print(f"  Output:  {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
