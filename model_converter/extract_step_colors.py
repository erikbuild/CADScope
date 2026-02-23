#!/usr/bin/env python3
"""
Extract per-part color assignments from a STEP file.

Parses ISO 10303-21 (STEP) text to build a mapping from part names
to RGB colors, without requiring a CAD kernel. Outputs JSON suitable
for the Blender import stage.

Usage:
    python3 extract_step_colors.py input.step output.json
"""

import re
import json
import sys
import os
from collections import defaultdict

# Entity types we need to parse (everything else is skipped for speed)
RELEVANT_TYPES = frozenset({
    'STYLED_ITEM',
    'PRESENTATION_STYLE_ASSIGNMENT',
    'SURFACE_STYLE_USAGE',
    'SURFACE_SIDE_STYLE',
    'SURFACE_STYLE_FILL_AREA',
    'FILL_AREA_STYLE',
    'FILL_AREA_STYLE_COLOUR',
    'COLOUR_RGB',
    'DRAUGHTING_PRE_DEFINED_COLOUR',
    'ADVANCED_BREP_SHAPE_REPRESENTATION',
    'SHAPE_REPRESENTATION',
    'SHAPE_DEFINITION_REPRESENTATION',
    'PRODUCT_DEFINITION_SHAPE',
    'PRODUCT_DEFINITION',
    'SHAPE_REPRESENTATION_RELATIONSHIP',
    'REPRESENTATION_RELATIONSHIP',
    'MAPPED_ITEM',
    'REPRESENTATION_MAP',
})

# Pre-defined STEP colours (ISO 10303-46)
PREDEFINED_COLOURS = {
    'red':     [1.0, 0.0, 0.0],
    'green':   [0.0, 1.0, 0.0],
    'blue':    [0.0, 0.0, 1.0],
    'yellow':  [1.0, 1.0, 0.0],
    'magenta': [1.0, 0.0, 1.0],
    'cyan':    [0.0, 1.0, 1.0],
    'black':   [0.0, 0.0, 0.0],
    'white':   [1.0, 1.0, 1.0],
}

ENTITY_RE = re.compile(r'#(\d+)\s*=\s*([A-Z_][A-Z0-9_]*)\s*\(')
REF_RE = re.compile(r'#(\d+)')


def parse_step_entities(path):
    """Stream-parse a STEP file, collecting only relevant entity types."""
    entities = {}
    buffer = ''
    in_data = False

    with open(path, 'r', errors='replace') as f:
        for line in f:
            stripped = line.strip()

            if stripped == 'DATA;':
                in_data = True
                continue
            if stripped == 'ENDSEC;':
                if in_data:
                    in_data = False
                continue
            if not in_data:
                continue

            buffer += ' ' + stripped

            # Process complete entities (terminated by ;)
            while ';' in buffer:
                entity_str, buffer = buffer.split(';', 1)
                entity_str = entity_str.strip()
                if not entity_str:
                    continue

                m = ENTITY_RE.match(entity_str)
                if not m:
                    continue

                eid = int(m.group(1))
                etype = m.group(2)

                if etype not in RELEVANT_TYPES:
                    continue

                # Extract args string (everything between outer parens)
                paren_start = entity_str.index('(', m.start(2))
                args_str = entity_str[paren_start + 1:]
                if args_str.endswith(')'):
                    args_str = args_str[:-1]

                entities[eid] = (etype, args_str)

    return entities


def extract_refs(args_str):
    """Extract all #NNN references from an args string."""
    return [int(m.group(1)) for m in REF_RE.finditer(args_str)]


def extract_first_name(args_str):
    """Extract the first single-quoted string from args."""
    m = re.search(r"'([^']*)'", args_str)
    return m.group(1) if m else ''


def resolve_color(eid, entities, cache):
    """
    Follow the style chain from a PRESENTATION_STYLE_ASSIGNMENT
    down to a COLOUR_RGB or DRAUGHTING_PRE_DEFINED_COLOUR.

    Returns (color_name, [r, g, b]) or None.
    """
    if eid in cache:
        return cache[eid]

    # Mark visited before recursing to prevent cycles
    cache[eid] = None

    if eid not in entities:
        return None

    etype, args = entities[eid]
    result = None

    if etype == 'COLOUR_RGB':
        name = extract_first_name(args)
        # Remove the quoted name to avoid matching digits inside it
        after_name = re.sub(r"'[^']*'", '', args, count=1)
        floats = re.findall(r'[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?', after_name)
        if len(floats) >= 3:
            result = (name, [float(floats[0]), float(floats[1]), float(floats[2])])

    elif etype == 'DRAUGHTING_PRE_DEFINED_COLOUR':
        name = extract_first_name(args).lower()
        if name in PREDEFINED_COLOURS:
            result = (name, list(PREDEFINED_COLOURS[name]))

    else:
        # Follow references deeper through the style chain
        for ref in extract_refs(args):
            r = resolve_color(ref, entities, cache)
            if r:
                result = r
                break

    cache[eid] = result
    return result


def build_lookup_maps(entities):
    """Build all the lookup maps needed for shape-to-product resolution."""

    # 1. Geometry item → representation (ABSR or SR that contains it)
    item_to_repr = {}
    repr_contexts = {}  # repr_id → context_id
    for eid, (etype, args) in entities.items():
        if etype in ('ADVANCED_BREP_SHAPE_REPRESENTATION', 'SHAPE_REPRESENTATION'):
            refs = extract_refs(args)
            if refs:
                context = refs[-1]
                repr_contexts[eid] = context
                # Items are all refs except the last (which is context)
                for ref in refs[:-1]:
                    # Prefer ABSR over SR if both contain the same item
                    if ref not in item_to_repr or etype == 'ADVANCED_BREP_SHAPE_REPRESENTATION':
                        item_to_repr[ref] = eid

    # 2. Representation → PDS (via SHAPE_DEFINITION_REPRESENTATION)
    #    SDR can reference both SHAPE_REPRESENTATION and ADVANCED_BREP_SHAPE_REPRESENTATION
    repr_to_pds = {}
    for eid, (etype, args) in entities.items():
        if etype == 'SHAPE_DEFINITION_REPRESENTATION':
            refs = extract_refs(args)
            if len(refs) >= 2:
                repr_to_pds[refs[1]] = refs[0]

    # 3. Representation relationships (fallback bridge between ABSR and SR)
    repr_links = defaultdict(set)
    for eid, (etype, args) in entities.items():
        if etype in ('SHAPE_REPRESENTATION_RELATIONSHIP', 'REPRESENTATION_RELATIONSHIP'):
            refs = extract_refs(args)
            if len(refs) >= 2:
                r1, r2 = refs[-2], refs[-1]
                repr_links[r1].add(r2)
                repr_links[r2].add(r1)

    # 4. REPRESENTATION_MAP: source_repr → map_id (for MAPPED_ITEM fallback)
    repr_source_to_map = {}
    for eid, (etype, args) in entities.items():
        if etype == 'REPRESENTATION_MAP':
            refs = extract_refs(args)
            if len(refs) >= 2:
                repr_source_to_map[refs[1]] = eid

    # 5. MAPPED_ITEM: map_id → mapped_item_id
    map_to_mapped_item = {}
    for eid, (etype, args) in entities.items():
        if etype == 'MAPPED_ITEM':
            refs = extract_refs(args)
            if refs:
                map_to_mapped_item[refs[0]] = eid

    # 6. PDS → PD (via PRODUCT_DEFINITION_SHAPE)
    pds_to_pd = {}
    for eid, (etype, args) in entities.items():
        if etype == 'PRODUCT_DEFINITION_SHAPE':
            refs = extract_refs(args)
            if refs:
                pds_to_pd[eid] = refs[-1]

    # 7. Product names
    pd_names = {}
    for eid, (etype, args) in entities.items():
        if etype == 'PRODUCT_DEFINITION':
            pd_names[eid] = extract_first_name(args)

    return (item_to_repr, repr_contexts, repr_to_pds, repr_links,
            repr_source_to_map, map_to_mapped_item, pds_to_pd, pd_names)


def resolve_product_name(geom_item_id, maps):
    """
    Trace from a geometry item to a product name using multiple strategies.

    Chain: geom_item → ABSR → (SDR or relationship or MAPPED_ITEM) → PDS → PD
    """
    (item_to_repr, repr_contexts, repr_to_pds, repr_links,
     repr_source_to_map, map_to_mapped_item, pds_to_pd, pd_names) = maps

    def get_product_name(repr_id):
        pds_id = repr_to_pds.get(repr_id)
        if pds_id:
            pd_id = pds_to_pd.get(pds_id)
            if pd_id:
                return pd_names.get(pd_id)
        return None

    repr_id = item_to_repr.get(geom_item_id)
    if repr_id is None:
        return None

    # Strategy 1: Direct SDR lookup (works when SDR references ABSR directly)
    name = get_product_name(repr_id)
    if name:
        return name

    # Strategy 2: Through representation relationships
    for related_id in repr_links.get(repr_id, ()):
        name = get_product_name(related_id)
        if name:
            return name

    # Strategy 3: Through REPRESENTATION_MAP → MAPPED_ITEM → SR → SDR
    repr_map_id = repr_source_to_map.get(repr_id)
    if repr_map_id:
        mapped_item_id = map_to_mapped_item.get(repr_map_id)
        if mapped_item_id:
            sr_id = item_to_repr.get(mapped_item_id)
            if sr_id:
                name = get_product_name(sr_id)
                if name:
                    return name

    return None


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 extract_step_colors.py input.step output.json")
        sys.exit(1)

    step_path = sys.argv[1]
    json_path = sys.argv[2]

    if not os.path.isfile(step_path):
        print(f"Error: file not found: {step_path}")
        sys.exit(1)

    print(f"Parsing STEP file: {step_path}")
    entities = parse_step_entities(step_path)
    print(f"Parsed {len(entities)} relevant entities")

    maps = build_lookup_maps(entities)

    # Resolve STYLED_ITEMs: link each styled shape to a color and product name
    color_cache = {}
    part_colors = {}  # part_name → (color_name, [r,g,b])

    styled_count = 0
    resolved_count = 0

    for eid, (etype, args) in entities.items():
        if etype != 'STYLED_ITEM':
            continue
        styled_count += 1

        refs = extract_refs(args)
        if len(refs) < 2:
            continue

        style_ref = refs[0]   # PRESENTATION_STYLE_ASSIGNMENT
        geom_ref = refs[-1]   # geometry item (e.g. MANIFOLD_SOLID_BREP)

        color_info = resolve_color(style_ref, entities, color_cache)
        if not color_info:
            continue

        prod_name = resolve_product_name(geom_ref, maps)
        if not prod_name:
            continue

        resolved_count += 1
        # First color wins per part (most parts have a single color)
        if prod_name not in part_colors:
            part_colors[prod_name] = color_info

    print(f"Styled items: {styled_count}, resolved: {resolved_count}")
    print(f"Parts with colors: {len(part_colors)}")

    # Build output JSON
    materials = {}
    objects = {}
    for part_name, (color_name, rgb) in part_colors.items():
        if not color_name:
            color_name = f"color_{rgb[0]:.3f}_{rgb[1]:.3f}_{rgb[2]:.3f}"
        materials[color_name] = [round(c, 6) for c in rgb]
        objects[part_name] = color_name

    output = {
        "materials": materials,
        "objects": objects,
    }

    os.makedirs(os.path.dirname(os.path.abspath(json_path)) or '.', exist_ok=True)
    with open(json_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\nWrote {json_path}")
    print(f"  Materials: {len(materials)}")
    print(f"  Objects:   {len(objects)}")

    for name, rgb in sorted(materials.items()):
        hex_color = '#{:02x}{:02x}{:02x}'.format(
            int(rgb[0] * 255), int(rgb[1] * 255), int(rgb[2] * 255))
        print(f"  {hex_color} {name}")


if __name__ == '__main__':
    main()
