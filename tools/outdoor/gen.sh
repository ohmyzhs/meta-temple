#!/bin/bash
# gen.sh NAME PROMPTFILE [extra -i images...]  → $SP/gen/NAME/NAME.png
SP=/private/tmp/claude-501/-Users-gabriel-k-Documents-Workspace-meta-temple--claude-worktrees-suspicious-khorana-ed6b9e/6080c7ae-9de3-4837-9676-051bc3f0a49d/scratchpad
name=$1; pf=$2; shift 2
d=$SP/gen/$name; mkdir -p $d
imgs=(-i $SP/gen/art-bible-v1.jpg)
for x in "$@"; do imgs+=(-i "$x"); done
{ echo "Use your built-in image generation tool (gpt-image) to create ONE image, then save the resulting PNG exactly at ./$name.png in the current working directory. Do not create other files. Do not edit code. The first attached image is the project's ART BIBLE: follow its photographic look, palette and materials (do not copy its layout or labels). Reply with the saved path when done."; echo; cat "$pf"; } | codex exec --skip-git-repo-check -s workspace-write -C $d "${imgs[@]}" - > $d/log.txt 2>&1
ls -la $d/$name.png 2>/dev/null && echo "DONE $name" || echo "FAIL $name"
