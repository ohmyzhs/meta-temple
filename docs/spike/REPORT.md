# 에셋 스파이크 보고 (2단계 F, 2026-11-05)

스펙 `docs/superpowers/specs/2026-11-05-launch-upgrade-design.md` 3장(제작 방식)의 실사 파이프라인을 작은 조각으로 시험했다.
세계 전체는 바꾸지 않았다 (`web/src/world/*`, `main.js` 손대지 않음). 결과는 독립 페이지 `web/spike.html`.

## 만든 것
| 항목 | 결과 | 만드는 곳 |
|---|---|---|
| 아트 바이블 | `docs/art/art-bible-v1.jpg` (gpt-image), 팔레트 HEX `docs/art/ART-BIBLE.md` | `docs/art/prompts/` |
| 실측 석탑 | 경주 고선사지 삼층석탑 스캔(국가유산청, 공공누리 1유형) 199만 → 4만 삼각형, 색·노멀·AO 구움 | `tools/blender/scan_bake.py` |
| 법당 실내 | 정면 3칸 × 측면 2칸 모서리 조각: 배흘림 기둥, 우물마루, 띠살 분합문(가운데 두 짝 열림)·광창, 흙벽, 창방·평방·다포 공포, 대들보, 우물천장, 불단·촛대 | `tools/blender/hall_bay.py` |
| 구운 빛 | 낮(해 + 하늘, 열린 문으로 든 햇빛 웅덩이), 밤(달빛 + 촛불 둘) 라이트맵 두 벌 | 같은 스크립트, `tools/spike/lightmap.py` |
| 하늘 | 낮 Poly Haven `qwantani_noon_puresky`, 밤 `rogland_clear_night`(은하수) — 배경 JPG + 조명용 256×128 HDR | `tools/spike/sky.py` |
| 생성 질감 | 흙벽(가로·세로 이음새 없음), 단청 띠(가로 반복), 우물반자 연화문 | `tools/spike/seamless.py`, `docs/art/generated/` |
| 압축 | glTF: Meshopt + KTX2(색 ETC1S, 노멀 UASTC), 라이트맵 KTX2 ETC1S | `tools/spike/pack.sh` |

## 받는 용량 (폰 기준 1K 텍스처, Resource Timing 실측)
| 묶음 | 파일 | 용량 |
|---|---|---|
| 법당 구역 | `hall_1024.glb` 2.94MB + `lm_day.ktx2` 0.18MB + `lm_night.ktx2` 0.18MB | **3.31MB** (지금 시간대 한 벌만 먼저면 3.12MB) |
| 석탑 구역 | `pagoda_1024.glb` 2.27MB + `ground_1024.glb` 0.70MB | **2.97MB** |
| 하늘 (공용) | 낮 배경 0.06 + 낮 HDR 0.13 + 밤 HDR 0.13 + 밤 배경 2K 0.37 (데스크톱 4K 1.54) | 0.69MB (데스크톱 1.86MB) |
| 합계 | 폰 6.97MB · 데스크톱 8.14MB | |

스펙 기준 「구역 내려받기 폰 5MB 이하」: 두 구역 모두 통과.
가장 큰 단일 텍스처는 석탑 노멀맵(UASTC 1.13MB). 스캔 UV 섬이 잘게 쪼개져 텍스처 공간을 낭비하므로 UV 를 더 잘 펴면 같은 용량에서 더 선명해진다.

## 성능 (같은 기계·같은 브라우저, 지금 화면 vs 스파이크)
측정 환경: Playwright 가 띄운 Chromium 157, **헤드리스가 아니라 GPU 를 쓰는 창**(`ANGLE Metal: Apple M4 Pro`). 진짜 헤드리스는
소프트웨어 렌더러(SwiftShader)로 떨어져 폰과 더 멀어지므로 쓰지 않았다. 지금 화면은 `?q=high`.
fps 는 rAF 5초(디스플레이 120Hz 가 상한), syncMs 는 한 프레임 그리기 + 1px readPixels 로 GPU 완료까지 기다린 시간의 중앙값.
측정 스크립트: `tools/spike/baseline.mjs`(지금 화면), `tools/spike/measure.mjs`(스파이크). 아래는 마지막 한 쌍의 측정값.

| | 1280×800 | 390×844 DPR 1 | 390×844 DPR 1, CPU 4배 감속 | 390×844 **DPR 2** (실제 폰 픽셀 수) |
|---|---|---|---|---|
| 지금 화면 fps | 119~120 | 120 | **84~105** | 120 |
| 지금 화면 syncMs | 5.7~6.6 | 4.5~5.6 | 12.4~16.3 | 5.6~6.5 |
| 지금 화면 그리기 호출 / 삼각형 | 554~628 / 173만~201만 | 468~590 / 170만~198만 | 같음 | 같음 |
| 스파이크 fps | 120 | 120 | 120 | 120 |
| 스파이크 syncMs | 1.6~2.0 | 1.1~1.7 | 2.0~3.4 | 1.6~1.9 |
| 스파이크 그리기 호출 / 삼각형 | 3~12 / 1.5만~5.5만 | 같음 | 같음 | 같음 |

주의 — 이 수치로 「폰에서 30fps 이상」을 증명할 수 없다.
- M4 Pro GPU 는 갤럭시 A5x·아이폰 12 보다 훨씬 빠르고, CPU 감속은 GPU 를 늦추지 않는다.
- 폰은 보통 DPR 2~3 이라 DPR 1 대비 칠할 픽셀이 4~9배다 (스파이크는 DPR 2 에서 멈춤). 폰 GPU 는 이 칠하기(fill rate)가 병목이다.
- 스파이크는 세계 전체가 아니라 한 조각이다. 위 비교는 「같은 장면 대비 비용」이 아니라 「에셋 한 벌의 비용」이다.
  그래도 실사 에셋 한 벌(석탑 4만 삼각형 + 법당 1.5만)이 지금 세계 전체(170만 삼각형, 그리기 500회 이상)보다 훨씬 가볍다는 방향은 분명하다.
- 실제 판정은 폰 실기 측정이 필요하다 (아래 남은 일).

## 화면 비교
`docs/spike/compare-{day,night}-{1280x800,390x844}.jpg` — 지금 화면(같은 마당·법당 구도) | 스파이크.

## 노출·빛 수치 (재서 넣은 값)
- 법당 노출: 화면 평균 루마 0.32(낮)·0.20(밤)이 되는 값을 이분 탐색 → 낮 34, 밤 9.5. 마당 밤 노출 0.6 은 배경 하늘이 화면 밝기를 좌우해 측정 대신 눈으로 골랐다. 실내가 바깥(마당 노출 0.8)보다 약 5스톱 어둡다.
- 해: 낮 HDRI 의 해 원반을 찾아 조도 7.35(HDR 단위), 고도 49.8°. 하늘 전체를 세로축으로 −88.9° 돌려 해가 정면 왼쪽(−35°)에서 열린 문으로 들게 했다 (Blender 굽기·three 배경·환경광 모두 같은 회전).
- 라이트맵 배율: 그 노출에서 알베도 0.25 면이 포화되는 값에서 잘라 8비트 범위를 실내에 몰아줌 (낮 22.6%·밤 3.4% 텍셀이 잘림 — 해 든 바깥면·햇빛 웅덩이 심지, 화면에서 어차피 하얗게 보이는 부분).
- three r170 에서 `scene.environment` 를 쓰면 재질별 `envMapIntensity` 가 무시된다 → 법당 재질에는 envMap 을 직접 지정해 하늘빛 이중 조명을 막았다.

## 설계값 (실측 아님)
칸 너비 4.4m(스펙 22m÷5)·칸 깊이 4.333m(스펙 13m÷3)·기둥 높이 4.4m·반지름 0.27m(지금 대웅전 값) 외의 치수 — 문지방·상방·창방·평방 높이, 천장 5.4m, 기단 0.55/0.9m, 처마 1.8m — 는 스파이크용 설계값이다.
달 원반은 보이게 키운 2.4°(실제 약 0.5°), 달빛 조도는 밤하늘 수평 조도의 6배, 촛불은 1.5m 에서 달빛의 2배로 잡았다.

## 한계와 남은 일
1. **폰 실기 측정**: 이 페이지를 폰에서 열어 fps 를 재야 한다 (배포 경로가 필요 — 사용자 확인 사항).
   이 브랜치를 main 에 합치면 `web/spike.html` 과 에셋 약 9.3MB 가 곧바로 실서버에 올라간다. 페이지 아래에 국가유산청 출처(공공누리 1유형 의무)와 「자료 출처」 링크를 넣어 두었다.
2. 석탑 UV: Blender Smart UV 가 섬을 잘게 쪼갬 → xatlas 류 언랩 또는 원본 UV 유지 검토.
3. 스캔 색 텍스처에는 촬영 당시 그늘이 조금 배어 있다.
4. 마당은 평평한 판 하나라 비어 보인다 — 지형·나무·담은 3단계(세계 전환) 일.
5. 법당은 실내 조각만 만들었다 (바깥 지붕·처마 모양은 굽기용 판). 꽃살문은 아직 없고 띠살문만.
6. 데스크톱 2K 텍스처 판은 만들지 않았다 (폰 1K 예산 확인이 우선).
7. 시점이 바뀔 때 노출이 뚝 바뀐다 — 세계 전환 때 문턱 디졸브(묶음 C)와 함께 부드러운 노출 전환 필요.

## 다시 만드는 법
```
blender -b --factory-startup -P tools/blender/hdr_to_npy.py -- <hdr> <npy>          # 하늘 두 장
python3 -I tools/spike/sky.py day   <day.npy>   <work>/sky/out --exposure 0.8 --bg-gain 2.2 --bg-sat 1.6
python3 -I tools/spike/sky.py night <night.npy> <work>/sky/out --exposure 0.8 --bg-gain 1.0 --bg-sat 1.1
python3 -I tools/spike/textures.py <polyhaven 2k jpg 폴더> docs/art/generated <work>/tex1k 1024
blender -b --factory-startup -P tools/blender/scan_bake.py -- --obj <scan.obj> --tex <8k.jpg> --out <work>/scan/out
blender -b --factory-startup -P tools/blender/hall_bay.py -- --tex <work>/tex1k --sky <work>/sky/out --out <work>/hall/out --samples 1024 --sun-az -35
python3 -I tools/spike/lightmap.py <work>/hall/out <work>/hall/lm 1024 --exposure day=34,night=9.5
KTX_BIN=<KTX-Software 4.4.2 bin> tools/spike/pack.sh <work> 1024
```
원본 내려받기(스캔 zip, 2K·4K HDR, 2K JPG)는 git 밖에 둔다. 출처는 `web/assets/spike/credits.json`.
