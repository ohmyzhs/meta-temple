#!/bin/bash
# gen.sh NAME PROMPTFILE [편집할 그림...] → $SP/gen/NAME/NAME.png  (Codex CLI 의 내장 gpt-image, 아트 바이블을 첫 참조 이미지로)
SP=${SP:?SP=작업 폴더 (git 밖). $SP/gen/art-bible-v1.jpg 에 docs/art/art-bible-v1.jpg (lucid-moser 브랜치) 를 둔다}
name=$1; pf=$2; shift 2
d=$SP/gen/$name; mkdir -p $d
imgs=(-i $SP/gen/art-bible-v1.jpg)
for x in "$@"; do imgs+=(-i "$x"); done
{ echo "Use your built-in image generation tool (gpt-image) to create ONE image, then save the resulting PNG exactly at ./$name.png in the current working directory. Do not create other files. Do not edit code. The first attached image is the project's ART BIBLE: follow its photographic look, palette and materials (do not copy its layout or labels). Reply with the saved path when done."; echo; cat "$pf"; } | codex exec --skip-git-repo-check -s workspace-write -C $d "${imgs[@]}" - > $d/log.txt 2>&1
ls -la $d/$name.png 2>/dev/null && echo "DONE $name" || echo "FAIL $name"
