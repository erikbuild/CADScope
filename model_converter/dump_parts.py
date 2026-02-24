#!/usr/bin/env python3
"""
Dump part names from a GLB file into a .colors.json template.

Reads the JSON chunk of a GLB to extract node names, cleans them
with the same logic as blender_export.py and viewer.js, and writes
a scaffold .colors.json.

Output has two reference lists:
  _groups  — parent/assembly names (color all children via tier-3 matching)
  _parts   — individual mesh names (for fine-grained control)

Move names into "main_parts" / "accent_parts", then delete the _ keys.

Usage:
    python dump_parts.py model.glb                  # writes model.colors.json next to the GLB
    python dump_parts.py model.glb -o out.json      # explicit output path
"""

import json
import re
import struct
import sys
import os


def clean_node_name(name):
    """Mirror the clean logic in blender_export.py / viewer.js."""
    if not name:
        return name
    clean = name.split("/")[-1]
    clean = re.sub(r"\.step(-\d+)$", r"\1", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\.step$", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s*\(mesh\)\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s*\(group\)\s*", "", clean, flags=re.IGNORECASE)
    return clean.strip()


def strip_numeric_suffix(name):
    """Strip trailing -N suffix, matching viewer.js stripNumericSuffix."""
    return re.sub(r"-\d+$", "", name)


def read_glb_json(path):
    """Read and parse the JSON chunk from a GLB file."""
    with open(path, "rb") as f:
        magic = f.read(4)
        if magic != b"glTF":
            raise ValueError(f"Not a GLB file: {path}")
        version, total_length = struct.unpack("<II", f.read(8))
        chunk_length, chunk_type = struct.unpack("<II", f.read(8))
        if chunk_type != 0x4E4F534A:  # "JSON" in little-endian
            raise ValueError("First GLB chunk is not JSON")
        return json.loads(f.read(chunk_length))


def extract_names(glb_json):
    """Extract group and part names from glTF nodes."""
    nodes = glb_json.get("nodes", [])

    # Build parent map
    parent_of = {}
    for i, n in enumerate(nodes):
        for child_idx in n.get("children", []):
            parent_of[child_idx] = i

    # Collect unique mesh names and their parent (group) names
    mesh_seen = set()
    mesh_names = []
    group_seen = set()
    group_names = []

    for i, n in enumerate(nodes):
        if "mesh" not in n:
            continue

        # Mesh name (tier 1 & 2 matching)
        cleaned = clean_node_name(n.get("name", ""))
        if cleaned:
            key = strip_numeric_suffix(cleaned)
            if key not in mesh_seen:
                mesh_seen.add(key)
                mesh_names.append(key)

        # Parent/group name (tier 3 matching)
        if i in parent_of:
            parent_name = clean_node_name(nodes[parent_of[i]].get("name", ""))
            if parent_name:
                pkey = strip_numeric_suffix(parent_name)
                if pkey not in group_seen:
                    group_seen.add(pkey)
                    group_names.append(pkey)

    mesh_names.sort(key=str.casefold)
    group_names.sort(key=str.casefold)
    return group_names, mesh_names


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__.strip())
        sys.exit(0)

    glb_path = sys.argv[1]
    if not os.path.isfile(glb_path):
        print(f"Error: file not found: {glb_path}", file=sys.stderr)
        sys.exit(1)

    # Output path: -o flag or default to sibling .colors.json
    out_path = None
    if "-o" in sys.argv:
        idx = sys.argv.index("-o")
        if idx + 1 < len(sys.argv):
            out_path = sys.argv[idx + 1]
    if not out_path:
        out_path = re.sub(r"\.glb$", ".colors.json", glb_path, flags=re.IGNORECASE)

    glb_json = read_glb_json(glb_path)
    group_names, mesh_names = extract_names(glb_json)

    template = {
        "main_color": "#FF6600",
        "accent_color": "#00AAFF",
        "main_parts": [],
        "accent_parts": [],
        "_groups": group_names,
        "_parts": mesh_names,
    }

    with open(out_path, "w") as f:
        json.dump(template, f, indent=2)
        f.write("\n")

    print(f"Found {len(group_names)} groups, {len(mesh_names)} parts → {out_path}")
    print("Move names from _groups/_parts into main_parts/accent_parts, then delete the _ keys.")


if __name__ == "__main__":
    main()
