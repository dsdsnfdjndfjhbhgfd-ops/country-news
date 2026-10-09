#!/usr/bin/env bash
# Status line for Claude Code in a terminal: model and how much of the conversation memory
# (context window) is left. Claude Code passes session info as JSON on stdin.
input=$(cat)
command -v jq >/dev/null 2>&1 || { echo "Память: установите jq, чтобы видеть остаток"; exit 0; }

model=$(jq -r '.model.display_name // "Claude"' <<<"$input")
size=$(jq -r '.context_window.context_window_size // empty' <<<"$input")
left=$(jq -r '.context_window.remaining_percentage // empty' <<<"$input")

# Older versions do not send context_window: count the last reply's tokens in the transcript
if [ -z "$left" ]; then
  used=$(jq -r '.context_window.current_usage | if . then (.input_tokens // 0) + (.cache_read_input_tokens // 0) + (.cache_creation_input_tokens // 0) else empty end' <<<"$input" 2>/dev/null)
  if [ -z "$used" ]; then
    t=$(jq -r '.transcript_path // empty' <<<"$input")
    [ -f "$t" ] && used=$(tail -n 200 "$t" | jq -rs '[.[] | .message.usage? | select(.) | (.input_tokens // 0) + (.cache_read_input_tokens // 0) + (.cache_creation_input_tokens // 0)] | last // empty' 2>/dev/null)
  fi
  size=${size:-200000}
  [ -n "$used" ] && left=$(( (size - used) * 100 / size ))
fi

if [ -z "$left" ]; then echo "$model · память: —"; exit 0; fi
left=${left%.*}; [ "$left" -lt 0 ] && left=0
bar=""; for i in 1 2 3 4 5 6 7 8 9 10; do [ $((i * 10)) -le "$left" ] && bar="$bar█" || bar="$bar░"; done
echo "$model · память: осталось ${left}% $bar"
