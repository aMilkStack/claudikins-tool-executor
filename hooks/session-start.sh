#!/usr/bin/env bash
# SessionStart hook for tool-executor plugin
# Injects the using-tool-executor skill content at session start

set -euo pipefail

# Determine plugin root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Read using-tool-executor skill content
skill_content=$(cat "${PLUGIN_ROOT}/skills/using-tool-executor/SKILL.md" 2>&1 || echo "Error reading using-tool-executor skill")

# Escape outputs for JSON using pure bash
escape_for_json() {
    local input="$1"
    local output=""
    local i char
    for (( i=0; i<${#input}; i++ )); do
        char="${input:$i:1}"
        case "$char" in
            $'\\') output+='\\' ;;
            '"') output+='\"' ;;
            $'\n') output+='\n' ;;
            $'\r') output+='\r' ;;
            $'\t') output+='\t' ;;
            *) output+="$char" ;;
        esac
    done
    printf '%s' "$output"
}

skill_escaped=$(escape_for_json "$skill_content")

# Output context injection as JSON
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<IMPORTANT>\nYou have access to the tool-executor MCP.\n\n**Below is the 'using-tool-executor' skill - your guide for when and how to use MCP tools vs basic tools:**\n\n${skill_escaped}\n</IMPORTANT>"
  }
}
EOF

exit 0
