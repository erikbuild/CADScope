#!/bin/bash
# Convert CAD files (STEP or USDZ) to Draco-compressed GLB.
#
# STEP files go through FreeCAD (preserves assembly hierarchy) then
# Blender (Draco compression + name cleanup).
# USDZ files go directly through Blender.
#
# Usage:
#   ./convert.sh input.step output.glb
#   ./convert.sh input.usdz output.glb
#   ./convert.sh --no-draco input.step output.glb

set -euo pipefail

BLENDER="/Applications/Blender.app/Contents/MacOS/Blender"
FREECADCMD="/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Parse --no-draco flag (pass through to Blender script)
NO_DRACO=""
POSITIONAL=()
for arg in "$@"; do
    case "$arg" in
        --no-draco) NO_DRACO="--no-draco" ;;
        *) POSITIONAL+=("$arg") ;;
    esac
done

if [ ${#POSITIONAL[@]} -lt 2 ]; then
    echo "Usage: $0 [--no-draco] <input.step|input.usdz> <output.glb>"
    exit 1
fi

INPUT="${POSITIONAL[0]}"
OUTPUT="${POSITIONAL[1]}"
EXT="${INPUT##*.}"
EXT_LOWER="$(echo "$EXT" | tr '[:upper:]' '[:lower:]')"

case "$EXT_LOWER" in
    step|stp)
        # Three-stage pipeline: color extraction → FreeCAD (geometry) → Blender (colors + Draco)
        if [ ! -x "$FREECADCMD" ]; then
            echo "Error: FreeCAD not found at $FREECADCMD"
            echo "Install FreeCAD from https://www.freecad.org/downloads.php"
            exit 1
        fi
        if [ ! -x "$BLENDER" ]; then
            echo "Error: Blender not found at $BLENDER"
            exit 1
        fi

        TMPGLB="$(mktemp /tmp/convert_step_XXXXXX.glb)"
        TMPJSON="$(mktemp /tmp/convert_step_XXXXXX.json)"
        trap 'rm -f "$TMPGLB" "$TMPJSON"' EXIT

        COLORS_ARGS=()
        echo "=== Stage 1/3: Extract colors ==="
        if python3 "$SCRIPT_DIR/extract_step_colors.py" "$INPUT" "$TMPJSON"; then
            COLORS_ARGS=(--colors "$TMPJSON")
        else
            echo "Warning: color extraction failed, continuing without colors"
        fi

        echo ""
        echo "=== Stage 2/3: STEP → GLB (FreeCAD) ==="
        "$FREECADCMD" "$SCRIPT_DIR/step_to_glb.py" -- "$INPUT" "$TMPGLB"

        echo ""
        echo "=== Stage 3/3: GLB → Draco GLB (Blender) ==="
        "$BLENDER" --background --python "$SCRIPT_DIR/convert_usdz.py" -- $NO_DRACO "${COLORS_ARGS[@]}" "$TMPGLB" "$OUTPUT"
        ;;

    usdz|usdc|usd)
        # Single-stage: Blender handles USDZ directly
        if [ ! -x "$BLENDER" ]; then
            echo "Error: Blender not found at $BLENDER"
            exit 1
        fi

        "$BLENDER" --background --python "$SCRIPT_DIR/convert_usdz.py" -- $NO_DRACO "$INPUT" "$OUTPUT"
        ;;

    *)
        echo "Error: unsupported format '.$EXT_LOWER'"
        echo "Supported: .step, .stp, .usdz, .usdc, .usd"
        exit 1
        ;;
esac
