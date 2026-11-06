"""아바타 동작표 — 블렌더 없이 읽히는 순수 파이썬 (avatar_build.py 가 프레임마다 sample() 을 불러 굽는다).

자세 하나 = 채널 사전:
  hips_loc (x,y,z) 골반 뼈 머리의 위치(m, 루트 기준) · hips/spine/chest/neck/head (rx,ry,rz)° 쉬는 자세 기준 회전
    (rx + = 앞으로 숙임, ry + = 왼쪽(+X)으로 돌림, rz = 옆으로 기울임)
  shoulder.S (rx,ry,rz)° · fingers.S 굽힘° · thumb.S (rx,ry,rz)° · toe.S 발가락 들림° (+ 위로 꺾임)
  hand.S {space, pos, aim, palm} — 손목 위치, 손끝 방향, 손바닥이 보는 방향. space='chest' 면 가슴을 따라 움직이는
         좌표(쉬는 자세 기준으로 적는다), 'root' 면 바닥 기준.
  foot.S {space, pos, aim, sole} — 발목 위치, 발 방향(발목→볼), 발바닥이 보는 방향
  pole_arm.S / pole_leg.S (x,y,z) — 팔꿈치·무릎이 향할 점
좌표: 블렌더 Z 위, 캐릭터는 -Y 를 본다, +X 가 캐릭터 왼쪽. 오른쪽(R)은 왼쪽(L)을 거울로 비춰 만든다.

예법 근거는 docs/avatar/motion-etiquette.md (불교신문 큰절·합장·차수 기사 등).
"""
import math

FPS = 30
TAU = math.tau

# ───── 쉬는 자세 관절 (avatar_build.py 와 공유) ─────
def _v(*a):
    return tuple(float(x) for x in a)


def _add(a, b, k=1.0):
    return tuple(x + y * k for x, y in zip(a, b))


def _norm(a):
    l = math.sqrt(sum(x * x for x in a))
    return tuple(x / l for x in a)


# 2.5등신 치비: 키 1.34m 가운데 머리가 0.58m (턱 0.76 → 정수리 1.34), 몸은 동그랗고 팔다리는 짧다.
J = {
    'hips': _v(0, 0, 0.40), 'spine': _v(0, 0, 0.47), 'chest': _v(0, 0, 0.56), 'neck': _v(0, 0, 0.715),
    'head': _v(0, -0.005, 0.76), 'crown': _v(0, -0.005, 1.34),
}
for _s, _x in (('L', 1), ('R', -1)):
    _sh = _v(_x * 0.13, 0.0, 0.675)
    _el = _add(_sh, _norm((_x * 0.766, 0.0, -0.643)), 0.15)
    _d2 = _norm((_x * 0.72, -0.12, -0.68))
    _wr = _add(_el, _d2, 0.135)
    J.update({
        f'clav.{_s}': _v(_x * 0.03, 0.0, 0.69), f'shoulder.{_s}': _sh, f'elbow.{_s}': _el, f'wrist.{_s}': _wr,
        f'knuckle.{_s}': _add(_wr, _d2, 0.056), f'fingertip.{_s}': _add(_wr, _d2, 0.094),
        f'hipj.{_s}': _v(_x * 0.075, 0, 0.37), f'knee.{_s}': _v(_x * 0.078, -0.012, 0.215),
        f'ankle.{_s}': _v(_x * 0.08, 0.0, 0.06), f'ball.{_s}': _v(_x * 0.08, -0.075, 0.018),
        f'toetip.{_s}': _v(_x * 0.08, -0.118, 0.018),
    })
HEAD_C = _v(0, -0.012, 1.045)   # 머리 공 가운데
HEAD_R = _v(0.30, 0.275, 0.29)  # 가로·앞뒤·세로 반지름
EYE = _v(0, -0.24, 1.0)         # 1인칭 눈 (두 눈 사이, 얼굴 안쪽)
FOREHEAD = _v(0, -0.255, 1.14)  # 큰절에서 바닥에 닿는 이마
FOOT_AIM = _norm(tuple(b - a for a, b in zip(J['ankle.L'], J['ball.L'])))


# ───── 거울 ─────
def mirror_vec(v):
    return (-v[0], v[1], v[2])


def mirror_rot(r):
    return (r[0], -r[1], -r[2])


def mirror_spec(sp):
    out = dict(sp)
    for k in ('pos', 'aim', 'palm', 'sole'):
        if k in sp:
            out[k] = mirror_vec(sp[k])
    return out


# ───── 기본 자세 (서서 팔을 편히 내림) ─────
HANG = dict(space='chest', pos=(0.2, -0.03, 0.425), aim=(0.08, -0.1, -1), palm=(-1, 0.15, 0))
FOOT = dict(space='root', pos=J['ankle.L'], aim=FOOT_AIM, sole=(0, 0, -1))
BASE = {
    'hips_loc': J['hips'], 'hips': (0, 0, 0), 'spine': (0, 0, 0), 'chest': (0, 0, 0), 'neck': (0, 0, 0), 'head': (0, 0, 0),
    'shoulder.L': (0, 0, 0), 'fingers.L': 12.0, 'thumb.L': (0, 0, 0), 'toe.L': 0.0,
    'hand.L': HANG, 'foot.L': FOOT,
    'pole_arm.L': _add(J['elbow.L'], (0.08, 0.35, -0.05)), 'pole_leg.L': _add(J['knee.L'], (0, -0.4, 0)),
}


def full(pose):
    """L 만 적은 자세를 R 까지 채운다 (R 을 따로 적었으면 그대로)."""
    p = dict(BASE)
    p.update(pose)
    for k in list(p.keys()):
        if not k.endswith('.L'):
            continue
        r = k[:-2] + '.R'
        if r in pose:
            continue
        v = p[k]
        if k.startswith(('hand', 'foot')):
            p[r] = mirror_spec(v)
        elif k.startswith('pole'):
            p[r] = mirror_vec(v)
        elif isinstance(v, tuple):
            p[r] = mirror_rot(v)
        else:
            p[r] = v
    return p


# ───── 보간 ─────
def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def _hermite(p0, p1, m0, m1, h, u):
    u2, u3 = u * u, u * u * u
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * m1


def _scalar_track(ts, vs, t, loop, T):
    n = len(ts)
    if loop:
        # 고리: 앞뒤로 한 바퀴씩 붙여 접선을 잇는다
        ts = [x - T for x in ts[-3:-1]] + ts + [x + T for x in ts[1:3]]
        vs = vs[-3:-1] + vs + vs[1:3]
        n = len(ts)
    if t <= ts[0]:
        return vs[0]
    if t >= ts[-1]:
        return vs[-1]
    k = max(i for i in range(n - 1) if ts[i] <= t)

    def tan(i):
        if i <= 0 or i >= n - 1:
            return 0.0
        a, b, c = vs[i - 1], vs[i], vs[i + 1]
        if (b - a) * (c - b) <= 0:  # 꼭짓점·멈춤에서는 넘치지 않게 0
            return 0.0
        return (c - a) / (ts[i + 1] - ts[i - 1])
    h = ts[k + 1] - ts[k]
    return _hermite(vs[k], vs[k + 1], tan(k), tan(k + 1), h, (t - ts[k]) / h)


def sample_keys(keys, t, loop=False, T=None):
    """keys: [(시각 s, 자세(full))]. 수치 채널은 꺾임 없는 3차 보간, 손·발 목표는 이웃 두 키를 부드럽게 섞는다."""
    ts = [k[0] for k in keys]
    out = {}
    for ch, v0 in keys[0][1].items():
        if ch.startswith('_'):
            continue
        if isinstance(v0, dict):
            if t <= ts[0]:
                out[ch] = keys[0][1][ch]
                continue
            if t >= ts[-1]:
                out[ch] = keys[-1][1][ch]
                continue
            k = max(i for i in range(len(ts) - 1) if ts[i] <= t)
            a, b = keys[k][1][ch], keys[k + 1][1][ch]
            u = (t - ts[k]) / (ts[k + 1] - ts[k])
            u = u if b.get('ease') == 'linear' else smooth(u)
            out[ch] = a if a == b else {'mix': (a, b, u)}
        elif isinstance(v0, tuple):
            out[ch] = tuple(_scalar_track(ts, [k[1][ch][i] for k in keys], t, loop, T) for i in range(len(v0)))
        else:
            out[ch] = _scalar_track(ts, [k[1][ch] for k in keys], t, loop, T)
    return out


def sample(clip, t):
    if 'proc' in clip:
        return clip['proc'](t)
    T = clip['frames'] / FPS
    return sample_keys(clip['keys'], t, clip.get('loop', False), T)


CLIPS = []


# ───────────────────────── 손 모양 ─────────────────────────
# 합장: 열 손가락을 가지런히 모아 가슴 정중선 앞에서 손바닥을 맞댄다. 가슴과 손 사이는 주먹 하나,
#       손끝은 코끝을 향한다 (불교신문 「합장」).
GASSHO = dict(space='chest', pos=(0.02, -0.175, 0.565), aim=(0, -0.4, 1), palm=(-1, 0, 0))
# 차수: 오른손으로 왼손을 감싸 쥐고 단전 위에 가볍게 얹는다 (불교신문 「합장」 — 경내를 다닐 때).
CHASU_L = dict(space='chest', pos=(0.038, -0.178, 0.47), aim=(-1, -0.1, -0.35), palm=(0, 1, 0.1))
CHASU_R = dict(space='chest', pos=(-0.042, -0.205, 0.478), aim=(1, -0.1, -0.3), palm=(0, 1, 0.1))
CHASU = {'hand.L': CHASU_L, 'hand.R': CHASU_R, 'fingers.L': 18.0, 'fingers.R': 32.0, 'thumb.L': (0, 0, 0), 'thumb.R': (-20, 0, 0),
         'pole_arm.L': (0.38, 0.2, 0.45), 'pole_arm.R': (-0.38, 0.2, 0.45)}
GASSHO_H = {'hand.L': GASSHO, 'fingers.L': 0.0, 'thumb.L': (0, 0, 8), 'pole_arm.L': (0.36, 0.12, 0.45)}
HANG_H = {'hand.L': HANG, 'fingers.L': 12.0}


def P(*parts, **kw):
    d = {}
    for p in parts:
        d.update(p)
    d.update({k.replace('__', '.'): v for k, v in kw.items()})
    return full(d)


def rot_x(v, deg):
    a = math.radians(deg)
    x, y, z = v
    return (x, y * math.cos(a) - z * math.sin(a), y * math.sin(a) + z * math.cos(a))


def foot(x, y, z, toe_down=0.0, yaw=0.0):
    """발목 위치와 발끝 숙임(+ 아래, - 들림)°, 안팎 돌림°."""
    aim = rot_x(FOOT_AIM, toe_down)
    sole = rot_x((0, 0, -1), toe_down)
    if yaw:
        c, s = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        aim = (aim[0] * c - aim[1] * s, aim[0] * s + aim[1] * c, aim[2])
    return dict(space='root', pos=(x, y, z), aim=aim, sole=sole)


STAND_Z = 0.395  # 무릎을 아주 살짝 굽힌 선 자세 (다리가 다 펴져 IK 가 튀지 않게)


# ───────────────────────── 서기 ─────────────────────────
def clip_idle(name, hands):
    keys = []
    for i in range(5):
        t = i * 1.0
        br = 0.5 - 0.5 * math.cos(TAU * t / 4.0)  # 4초에 한 숨
        sway = 0.004 * math.sin(TAU * t / 4.0)
        keys.append((t, P(hands, hips_loc=(sway, 0, STAND_Z + 0.0015 * br), hips=(0, 0, -0.8 * math.sin(TAU * t / 4)),
                          chest=(-1.6 * br, 0, 0), neck=(1.0, 0, 0), head=(2.0 - 1.2 * br, 0, 2.2 * math.sin(TAU * t / 4)))))
    return {'name': name, 'frames': 120, 'loop': True, 'keys': keys}


# ───────────────────────── 걷기 (제자리, 실제 이동은 런타임) ─────────────────────────
# 게임 이동 빠르기 그대로에서 발이 미끄러지지 않게 굽는다 (2026-11-06: 모두 1.3m/s, 뛰지 않는다 — avatarManager WALK_SPEED).
# 다리(0.31m)가 짧아 보폭을 내려면 골반을 낮추고(무릎을 굽힌 채 미끄러지듯) 골반을 크게 돌린다.
WALK_SPEED = 1.3
WALK_T = 18 / FPS  # 한 주기(두 걸음) 0.6s — 초당 3.3걸음 (보폭을 더 늘리면 골반이 너무 낮아진다)
WALK_BETA = 0.55   # 한 발이 땅에 닿아 있는 비율
WALK_A = WALK_SPEED * WALK_BETA * WALK_T / 2  # 디딤발이 앞뒤로 움직이는 반폭 0.2m
WALK_YAW = 12.0    # 골반 돌림° — 엉덩관절이 ±0.016m 앞뒤로 가며 보폭을 보탠다
_LEG = 0.3105
WALK_HIP = 0.06 + 0.985 * math.sqrt(_LEG ** 2 - (WALK_A - 0.075 * math.sin(math.radians(WALK_YAW))) ** 2) + 0.03  # 두 발 디딤 때 골반 높이


def walk_pose(t, style):
    ph = (t / WALK_T) % 1.0
    d = {}
    for s, x, off in (('L', 1, 0.0), ('R', -1, 0.5)):
        q = (ph + off) % 1.0
        if q < WALK_BETA:  # 디딤: 앞(-A)에서 뒤(+A)로 일정한 속도
            u = q / WALK_BETA
            y = -WALK_A + 2 * WALK_A * u
            lift = 0.02 * smooth((u - 0.62) / 0.38)       # 발뒤꿈치가 들린다
            toe = 30 * smooth((u - 0.62) / 0.38) - 12 * (1 - smooth(u / 0.18))  # 딛을 때 발끝 들림 → 차고 나갈 때 숙임
            z = J['ankle.L'][2] + lift + 0.012 * (1 - smooth(u / 0.18))
        else:  # 흔들기: 뒤에서 앞으로, 들어 올렸다가
            u = (q - WALK_BETA) / (1 - WALK_BETA)
            e = smooth(u)
            y = WALK_A - 2 * WALK_A * e
            z = J['ankle.L'][2] + 0.02 * (1 - smooth(u / 0.3)) + 0.035 * math.sin(math.pi * min(u * 1.15, 1.0)) + 0.008 * smooth((u - 0.8) / 0.2)
            toe = 30 * (1 - smooth(u / 0.45)) - 12 * smooth((u - 0.6) / 0.4)
        d[f'foot.{s}'] = foot(x * 0.07, y + 0.005, z, toe)
        d[f'toe.{s}'] = 25 * smooth(((q / WALK_BETA) - 0.62) / 0.38) * (q < WALK_BETA)  # 차고 나갈 때 발가락이 위로 꺾인다 (+ = 들림)
        d[f'pole_leg.{s}'] = (x * 0.1, -0.5, 0.2)
    c = math.cos(TAU * ph)
    sw = math.sin(TAU * (ph - 0.07))  # 디딤발 쪽으로 몸이 실린다 (뒤뚱)
    bob = 0.006 * (1 - math.cos(2 * TAU * ph))  # 두 발 디딤에서 가장 낮고 한 발 디딤 가운데서 조금 높다
    d['hips_loc'] = (0.012 * sw, 0.0, WALK_HIP + bob)
    d['hips'] = (4.0, -WALK_YAW * c, 4.0 * sw)
    d['spine'] = (1.0, 7.0 * c, -2.0 * sw)
    d['chest'] = (0.0, 8.0 * c, -1.5 * sw)
    d['neck'] = (0.0, -2.0 * c, -1.0 * sw)
    d['head'] = (-1.0 - 1.5 * math.cos(2 * TAU * ph), -1.5 * c, -2.5 * sw)
    if style == 'walk':
        for s, sg in (('L', 1), ('R', -1)):
            sw = sg * c  # 왼다리가 앞일 때(ph=0) 왼팔은 뒤
            x = 0.195 if s == 'L' else -0.195
            fwd = max(0.0, -sw)
            d[f'hand.{s}'] = dict(space='chest', pos=(x, -0.03 + 0.06 * sw, 0.43 + 0.03 * fwd),
                                  aim=(0.04 * (1 if s == 'L' else -1), -0.12 - 0.45 * fwd + 0.25 * max(0, sw), -1),
                                  palm=(-1 if s == 'L' else 1, 0.1, 0))
            d[f'fingers.{s}'] = 15.0
        return P(d)
    if style == 'chasu':
        for k in ('hips', 'spine', 'chest'):
            d[k] = (d[k][0], d[k][1] * 0.6, d[k][2] * 0.7)
        return P(CHASU, d)
    if style == 'gassho':
        for k in ('hips', 'spine', 'chest'):
            d[k] = (d[k][0], d[k][1] * 0.5, d[k][2] * 0.6)
        d['head'] = (4.0, 0.0, 0.0)
        return P(GASSHO_H, d)


def clip_walk(name, style):
    return {'name': name, 'frames': round(WALK_T * FPS), 'loop': True, 'proc': lambda t: walk_pose(t, style),
            'meta': {'speed': round(WALK_SPEED, 4), 'cycle': WALK_T}}


# ───────────────────────── 합장 반배 ─────────────────────────
def clip_bow_half():
    st = P(HANG_H, hips_loc=(0, 0, STAND_Z), head=(2, 0, 0))
    g = P(GASSHO_H, hips_loc=(0, 0, STAND_Z), head=(3, 0, 0))
    bow = P(GASSHO_H, hips_loc=(0, 0.03, STAND_Z - 0.005), hips=(20, 0, 0), spine=(12, 0, 0), chest=(8, 0, 0), neck=(3, 0, 0), head=(8, 0, 0))
    deep = P(GASSHO_H, hips_loc=(0, 0.033, STAND_Z - 0.006), hips=(21, 0, 0), spine=(13, 0, 0), chest=(9, 0, 0), neck=(3, 0, 0), head=(9, 0, 0))
    keys = [(0.0, st), (0.5, g), (0.7, g), (1.2, bow), (1.5, deep), (2.0, g), (2.45, st)]
    return {'name': 'bow_half', 'frames': 74, 'keys': keys, 'meta': {'bowAt': 1.35}}


# ───────────────────────── 큰절 (오체투지·접족례) ─────────────────────────
# 불교신문 「오체투지 큰 절하는 방법」: 합장·저두 → 허리를 세운 채 꿇어앉아 엉덩이를 발뒤꿈치에 →
# 손을 짚으며 왼발을 오른발 위에 포갬 → 이마·두 팔꿈치·두 무릎이 바닥에 → 손바닥을 뒤집어 귀 높이로 (접족례) →
# 손으로 바닥을 밀며 머리를 들고, 발가락을 나란히 꺾어 꿇은 채 합장 → 발뒤꿈치를 붙이며 일어선다.
# 가사를 수한 스님은 왼손을 가슴에 대고 오른손부터 짚는다 — 이 아바타는 가사를 둘렀으므로 그렇게 한다.
FLOOR_HAND = lambda x, y: dict(space='root', pos=(x, y, 0.02), aim=(0, -1, -0.05), palm=(0, 0, -1))
PALM_UP = lambda x, y, z: dict(space='root', pos=(x, y, z), aim=(0, -1, 0.15), palm=(0, 0, 1))
LEFT_ON_CHEST = dict(space='chest', pos=(0.03, -0.15, 0.56), aim=(-0.55, -0.15, 0.8), palm=(0, 1, 0))
TUCK = lambda x: foot(x, 0.03, 0.092, 62)          # 발가락을 꺾어 세움: 발이 바닥에 서고(발바닥이 뒤로) 뒤꿈치가 위
FLAT_L = dict(space='root', pos=(0.03, 0.035, 0.072), aim=(-0.35, 0.94, -0.05), sole=(0.0, 0.05, 1))  # 왼발이 위
FLAT_R = dict(space='root', pos=(-0.03, 0.03, 0.045), aim=(0.35, 0.94, -0.05), sole=(0.0, 0.05, 1))


def kneel_legs(tucked=True):
    if tucked:
        f = {'foot.L': TUCK(0.09), 'foot.R': TUCK(-0.09), 'toe.L': 62.0, 'toe.R': 62.0}
    else:
        f = {'foot.L': FLAT_L, 'foot.R': FLAT_R, 'toe.L': 0.0, 'toe.R': 0.0}
    f.update({'pole_leg.L': (0.12, -0.5, -0.05), 'pole_leg.R': (-0.12, -0.5, -0.05)})
    return f


PROSTRATE_T = 7.6        # 천천히 한 번 7.6초 — 자동 108배는 8초에 한 번 (web/src/ui/modalManager.js BOW_CYCLE_MS)
PROSTRATE_FOREHEAD = 3.6  # 이마가 바닥에 닿는 때
# 도복이 스치는 '사락' — 몸이 크게 움직이는 구간 [시작 s, 길이 s, 세기] (런타임이 이 때에 맞춰 소리를 낸다)
PROSTRATE_RUSTLE = [[1.25, 0.9, 1.0], [2.85, 0.6, 0.7], [4.15, 0.45, 0.35], [5.05, 0.45, 0.35], [5.45, 0.8, 0.8], [6.3, 0.9, 0.9]]


def clip_prostrate():
    up = dict(hips_loc=(0, 0, STAND_Z))
    k = []
    k.append((0.0, P(HANG_H, up, head=(2, 0, 0))))
    k.append((0.7, P(GASSHO_H, up, head=(4, 0, 0))))
    k.append((1.15, P(GASSHO_H, up, head=(12, 0, 0))))  # 합장하고 고개 숙임 (저두)
    # 허리를 곧게 세운 채 무릎을 굽혀 내려간다 (발뒤꿈치가 들리며 발가락이 꺾인다)
    k.append((1.8, P(GASSHO_H, kneel_legs(), hips_loc=(0, -0.04, 0.29), hips=(8, 0, 0), spine=(-4, 0, 0), head=(8, 0, 0),
                     **{'foot.L': foot(0.08, 0.025, 0.085, 40), 'foot.R': foot(-0.08, 0.025, 0.085, 40), 'toe.L': 40.0, 'toe.R': 40.0})))
    k.append((2.3, P(GASSHO_H, kneel_legs(), hips_loc=(0, -0.1, 0.225), hips=(4, 0, 0), spine=(-2, 0, 0), head=(8, 0, 0))))
    # 엉덩이를 발뒤꿈치에
    k.append((2.65, P(GASSHO_H, kneel_legs(), hips_loc=(0, 0.0, 0.17), hips=(6, 0, 0), head=(8, 0, 0))))
    # 왼손은 가슴에, 오른손부터 짚는다
    k.append((3.0, P(kneel_legs(), hips_loc=(0, 0.015, 0.165), hips=(36, 0, 0), spine=(16, 0, 0), chest=(8, 0, 0), neck=(4, 0, 0), head=(10, 0, 0),
                     **{'hand.L': LEFT_ON_CHEST, 'hand.R': FLOOR_HAND(-0.2, -0.22), 'fingers.L': 5.0, 'fingers.R': 2.0,
                        'pole_arm.L': (0.36, 0.15, 0.35), 'pole_arm.R': (-0.35, 0.1, 0.2)})))
    bowdown = dict(hips_loc=(0, 0.03, 0.16), hips=(62, 0, 0), spine=(28, 0, 0), chest=(18, 0, 0), neck=(6, 0, 0), head=(16, 0, 0))
    floor = {'hand.L': FLOOR_HAND(0.21, -0.22), 'hand.R': FLOOR_HAND(-0.21, -0.22), 'fingers.L': 2.0, 'fingers.R': 2.0,
             'pole_arm.L': (0.45, -0.05, -0.15), 'pole_arm.R': (-0.45, -0.05, -0.15)}
    # 왼손도 짚으며 왼발을 오른발 위에 포갠다 (발등이 바닥, 발끝은 뒤)
    near = P(kneel_legs(False), floor, hips_loc=(0, 0.025, 0.16), hips=(30, 0, 0), spine=(22, 0, 0), chest=(13, 0, 0), neck=(5, 0, 0), head=(13, 0, 0))
    near['_solve'] = {'channel': 'hips', 'axis': 0, 'forehead_z': 0.09, 'local': True}  # 이마가 바닥 9cm 위까지 (뚫고 들어가지 않게)
    k.append((3.3, near))
    # 이마가 바닥에
    contact = P(kneel_legs(False), floor, bowdown)
    contact['_solve'] = {'channel': 'hips', 'axis': 0, 'forehead_z': 0.012}  # 이마가 바닥에 닿게 골반 숙임을 맞춘다
    k.append((PROSTRATE_FOREHEAD, contact))
    k.append((4.0, contact))
    # 접족례: 손바닥을 뒤집어 귀 밑 높이까지 — 부처님 발을 받들어 머리에 댄다
    lift = {'hand.L': PALM_UP(0.22, -0.21, 0.1), 'hand.R': PALM_UP(-0.22, -0.21, 0.1), 'fingers.L': 6.0, 'fingers.R': 6.0,
            'pole_arm.L': (0.45, -0.05, -0.15), 'pole_arm.R': (-0.45, -0.05, -0.15)}
    k.append((4.5, P(kneel_legs(False), lift, bowdown, _same='hips')))
    k.append((5.0, P(kneel_legs(False), lift, bowdown, _same='hips')))
    k.append((5.4, P(kneel_legs(False), floor, bowdown, _same='hips')))
    # 손으로 바닥을 밀며 머리를 들고, 발가락을 나란히 꺾어 꿇은 채 합장
    k.append((5.95, P(kneel_legs(), floor, hips_loc=(0, -0.03, 0.19), hips=(32, 0, 0), spine=(12, 0, 0), chest=(6, 0, 0), head=(4, 0, 0))))
    k.append((6.35, P(GASSHO_H, kneel_legs(), hips_loc=(0, -0.1, 0.225), hips=(6, 0, 0), head=(6, 0, 0))))
    # 머리를 앞으로 내미는 탄력으로, 발뒤꿈치를 붙이며 가볍게 일어선다
    k.append((6.85, P(GASSHO_H, hips_loc=(0, -0.01, 0.30), hips=(24, 0, 0), spine=(6, 0, 0), head=(4, 0, 0),
                      **{'foot.L': foot(0.07, 0.025, 0.075, 25), 'foot.R': foot(-0.07, 0.025, 0.075, 25), 'toe.L': 25.0, 'toe.R': 25.0,
                         'pole_leg.L': (0.1, -0.5, 0.2), 'pole_leg.R': (-0.1, -0.5, 0.2)})))
    k.append((7.3, P(GASSHO_H, up, head=(6, 0, 0))))
    k.append((PROSTRATE_T, P(GASSHO_H, up, head=(4, 0, 0))))
    return {'name': 'prostrate', 'frames': round(PROSTRATE_T * FPS), 'keys': k,
            'meta': {'foreheadAt': PROSTRATE_FOREHEAD, 'rustle': PROSTRATE_RUSTLE}}


# ───────────────────────── 앉기 (반가부좌 · 법계정인) ─────────────────────────
# 반가부좌: 왼발을 오른쪽 허벅지 위에. 법계정인: 오른손을 왼발 위에 두고 왼손을 그 위에 포개어 두 엄지 끝을 맞댄다.
SIT_LEGS = {
    'foot.L': dict(space='root', pos=(-0.055, -0.13, 0.085), aim=(-0.85, -0.3, -0.1), sole=(0.15, 0.25, 0.95)),
    'foot.R': dict(space='root', pos=(0.05, -0.14, 0.035), aim=(0.85, -0.3, -0.15), sole=(0.25, 0.35, 0.9)),
    'pole_leg.L': (0.45, -0.25, 0.03), 'pole_leg.R': (-0.45, -0.25, 0.0), 'toe.L': 10.0, 'toe.R': 10.0,
}
MUDRA = {
    'hand.R': dict(space='root', pos=(-0.06, -0.15, 0.125), aim=(1, -0.15, 0.05), palm=(0, 0, 1)),
    'hand.L': dict(space='root', pos=(0.06, -0.16, 0.14), aim=(-1, -0.15, 0.05), palm=(0, 0, 1)),
    'fingers.L': 4.0, 'fingers.R': 4.0, 'thumb.L': (-35, 0, 0), 'thumb.R': (-35, 0, 0),
    'pole_arm.L': (0.4, 0.05, 0.2), 'pole_arm.R': (-0.4, 0.05, 0.2),
}


def clip_sit():
    keys = []
    for i in range(6):
        t = i * 1.0
        br = 0.5 - 0.5 * math.cos(TAU * t / 5.0)
        keys.append((t, P(SIT_LEGS, MUDRA, hips_loc=(0, 0.02, 0.08 + 0.002 * br), hips=(6, 0, 0), spine=(-3, 0, 0),
                          chest=(-2 - 1.6 * br, 0, 0), neck=(4, 0, 0), head=(9 - 1.0 * br, 0, 0))))
    return {'name': 'sit', 'frames': 150, 'loop': True, 'keys': keys}


# ───────────────────────── 일어서기 · 앉기 (반가부좌 ↔ 서기) ─────────────────────────
# 포갠 다리를 그냥 섞으면 발바닥이 위→아래로 180° 돌며 다리가 꼬여 보인다. 다리를 풀고 → 발을 딛고 → 웅크렸다 → 선다.
FLAT_FOOT = lambda x, y: foot(x, y, J['ankle.L'][2], 0)
KNEES_UP = {'pole_leg.L': (0.35, -0.5, 0.25), 'pole_leg.R': (-0.35, -0.5, 0.25)}
ON_KNEES = {'hand.L': dict(space='root', pos=(0.12, -0.17, 0.2), aim=(0, -1, -0.3), palm=(0, 0, -1)),
            'hand.R': dict(space='root', pos=(-0.12, -0.17, 0.2), aim=(0, -1, -0.3), palm=(0, 0, -1)),
            'fingers.L': 20.0, 'fingers.R': 20.0, 'pole_arm.L': (0.4, 0.1, 0.3), 'pole_arm.R': (-0.4, 0.1, 0.3)}
SITUP_T = 1.5
SITUP_RUSTLE = [[0.05, 0.8, 0.8], [0.8, 0.6, 0.6]]


def seat_poses():
    sit = P(SIT_LEGS, MUDRA, hips_loc=(0, 0.02, 0.08), hips=(6, 0, 0), spine=(-3, 0, 0), chest=(-2, 0, 0), neck=(4, 0, 0), head=(9, 0, 0))
    unfold = P(ON_KNEES, KNEES_UP, hips_loc=(0, 0.02, 0.085), hips=(12, 0, 0), head=(6, 0, 0),
               **{'foot.L': FLAT_FOOT(0.1, -0.1), 'foot.R': FLAT_FOOT(-0.1, -0.1)})
    squat = P(ON_KNEES, KNEES_UP, hips_loc=(0, -0.02, 0.17), hips=(34, 0, 0), spine=(10, 0, 0), head=(-4, 0, 0),
              **{'foot.L': FLAT_FOOT(0.085, -0.04), 'foot.R': FLAT_FOOT(-0.085, -0.04)})
    rise = P(HANG_H, hips_loc=(0, -0.005, 0.32), hips=(14, 0, 0), spine=(3, 0, 0), head=(2, 0, 0),
             **{'foot.L': FLAT_FOOT(0.08, 0.0), 'foot.R': FLAT_FOOT(-0.08, 0.0), 'pole_leg.L': (0.1, -0.5, 0.2), 'pole_leg.R': (-0.1, -0.5, 0.2)})
    stand = P(HANG_H, hips_loc=(0, 0, STAND_Z), head=(2, 0, 0))
    return sit, unfold, squat, rise, stand


def clip_stand_up():
    sit, unfold, squat, rise, stand = seat_poses()
    keys = [(0.0, sit), (0.45, unfold), (0.85, squat), (1.2, rise), (SITUP_T, stand)]
    return {'name': 'stand_up', 'frames': round(SITUP_T * FPS), 'keys': keys, 'meta': {'rustle': SITUP_RUSTLE}}


def clip_sit_down():
    sit, unfold, squat, rise, stand = seat_poses()
    keys = [(0.0, stand), (0.3, rise), (0.65, squat), (1.05, unfold), (SITUP_T, sit)]
    return {'name': 'sit_down', 'frames': round(SITUP_T * FPS), 'keys': keys, 'meta': {'rustle': SITUP_RUSTLE}}


# ───────────────────────── 신행 동작 (넓힘) ─────────────────────────
def stand(**kw):
    d = dict(hips_loc=(0, 0, STAND_Z))
    d.update(kw)
    return d


def H(space, pos, aim, palm):
    return dict(space=space, pos=pos, aim=aim, palm=palm)


def breathe_loop(name, base, T=4.0, n=4, head=(0, 0, 0), extra=None):
    """자세 하나에 숨 (고리)."""
    keys = []
    for i in range(n + 1):
        t = T * i / n
        br = 0.5 - 0.5 * math.cos(TAU * t / T)
        d = dict(base)
        d.update(chest=(-1.5 * br, 0, 0), head=(head[0] - 1.0 * br, head[1], head[2] + 1.5 * math.sin(TAU * t / T)))
        if extra:
            d.update(extra(t))
        keys.append((t, P(d)))
    return {'name': name, 'frames': round(T * FPS), 'loop': True, 'keys': keys}


# 헌향: 향 가운데를 잡고, 불을 붙일 때 왼손으로 오른손을 받쳐 든다. 이마 높이까지 올린 뒤 향로에 꽂는다 (법보신문 「합장과 절의 의미」).
INCENSE_T = 3.4  # 절차식 SEQ 와 같은 길이 (main.js 가 1.4초에 향로 연기를 올린다)


def clip_incense():
    hold_r = H('chest', (-0.03, -0.2, 0.53), (0.15, -0.55, 0.8), (1, 0, 0))
    under_l = H('chest', (0.0, -0.17, 0.47), (-0.8, -0.55, 0.1), (0, 0, 1))
    up_r = H('chest', (-0.02, -0.215, 0.76), (0.1, -0.5, 0.85), (1, 0, 0))
    up_l = H('chest', (0.01, -0.19, 0.69), (-0.8, -0.55, 0.1), (0, 0, 1))
    plant_r = H('chest', (-0.03, -0.25, 0.47), (0, -0.4, -0.9), (1, 0, 0))
    grip = {'fingers.R': 55.0, 'thumb.R': (-25, 0, 0), 'fingers.L': 10.0, 'pole_arm.L': (0.36, 0.1, 0.4), 'pole_arm.R': (-0.36, 0.1, 0.4)}
    k = [(0.0, P(HANG_H, stand(head=(2, 0, 0)))),
         (0.5, P(GASSHO_H, stand(head=(4, 0, 0)))),
         (0.95, P(grip, stand(head=(8, 0, 0)), **{'hand.R': hold_r, 'hand.L': under_l})),
         (1.45, P(grip, stand(head=(-4, 0, 0), chest=(-3, 0, 0)), **{'hand.R': up_r, 'hand.L': up_l})),
         (1.75, P(grip, stand(head=(6, 0, 0)), **{'hand.R': up_r, 'hand.L': up_l})),
         (2.35, P(grip, stand(hips=(14, 0, 0), spine=(8, 0, 0), head=(8, 0, 0), hips_loc=(0, 0.015, STAND_Z - 0.004)),
                  **{'hand.R': plant_r, 'hand.L': under_l})),
         (2.8, P(GASSHO_H, stand(head=(4, 0, 0)))),
         (INCENSE_T, P(GASSHO_H, stand(head=(3, 0, 0))))]
    return {'name': 'incense', 'frames': round(INCENSE_T * FPS), 'keys': k, 'meta': {'propFrom': 0.8, 'propTo': 2.5}}


# 다선: 찻잔은 두 손으로 — 오른손바닥에 잔을 얹고 왼손으로 받친다. 향을 맡고 천천히 마신다 (7초 고리).
TEA_T = 7.0
SIT_BASE = dict(hips_loc=(0, 0.02, 0.08), hips=(6, 0, 0), spine=(-3, 0, 0), neck=(4, 0, 0))


def clip_tea():
    lap_r = H('root', (-0.035, -0.175, 0.17), (0.55, -0.8, 0.1), (0, 0, 1))
    lap_l = H('root', (0.03, -0.165, 0.155), (-0.55, -0.8, 0.1), (0, 0, 1))
    sip_r = H('chest', (-0.03, -0.215, 0.43), (0.55, -0.8, 0.15), (0, 0.1, 1))
    sip_l = H('chest', (0.025, -0.205, 0.415), (-0.55, -0.8, 0.15), (0, 0.1, 1))
    arms = {'fingers.L': 18.0, 'fingers.R': 25.0, 'pole_arm.L': (0.4, 0.05, 0.2), 'pole_arm.R': (-0.4, 0.05, 0.2)}
    rest = P(SIT_LEGS, arms, SIT_BASE, chest=(-2, 0, 0), head=(8, 0, 0), **{'hand.R': lap_r, 'hand.L': lap_l})
    smell = P(SIT_LEGS, arms, SIT_BASE, chest=(-1, 0, 0), head=(14, 0, 0), **{'hand.R': sip_r, 'hand.L': sip_l})
    sip = P(SIT_LEGS, arms, SIT_BASE, chest=(-3, 0, 0), head=(-6, 0, 0), **{'hand.R': sip_r, 'hand.L': sip_l})
    k = [(0.0, rest), (3.2, rest), (4.0, smell), (4.5, smell), (4.9, sip), (5.6, sip), (6.3, rest), (TEA_T, rest)]
    return {'name': 'tea', 'frames': round(TEA_T * FPS), 'loop': True, 'keys': k}


def clip_serve_tea():
    """다실 선사가 앉은 채 두 손으로 찻잔을 건넨다 (2.4초)."""
    give = H('chest', (-0.02, -0.27, 0.42), (0.5, -0.85, 0.1), (0, 0, 1))
    give_l = H('chest', (0.03, -0.26, 0.4), (-0.5, -0.85, 0.1), (0, 0, 1))
    arms = {'fingers.L': 18.0, 'fingers.R': 25.0, 'pole_arm.L': (0.4, 0.05, 0.2), 'pole_arm.R': (-0.4, 0.05, 0.2)}
    rest = P(SIT_LEGS, MUDRA, SIT_BASE, chest=(-2, 0, 0), head=(8, 0, 0))
    lean = P(SIT_LEGS, arms, SIT_BASE, hips=(22, 0, 0), spine=(8, 0, 0), chest=(2, 0, 0), head=(10, 0, 0), **{'hand.R': give, 'hand.L': give_l})
    k = [(0.0, rest), (0.7, lean), (1.4, lean), (2.0, rest), (2.4, rest)]
    return {'name': 'serve_tea', 'frames': 72, 'keys': k}


# 염주: 가부좌로 앉아 오른손 엄지로 한 알씩 당긴다 (1.1초에 한 알 — 독송 목탁 박과 같은 빠르기), 왼손은 무릎 위
MALA_T = 5.5


def clip_meditate():
    mala_r = H('chest', (-0.03, -0.18, 0.42), (0.35, -0.45, 0.82), (0.9, 0.3, 0))
    lap_l = H('root', (0.06, -0.16, 0.135), (-1, -0.15, 0.05), (0, 0, 1))
    keys = []
    for i in range(11):
        t = MALA_T * i / 10
        pull = i % 2  # 0 = 엄지 폄, 1 = 한 알 당김
        br = 0.5 - 0.5 * math.cos(TAU * t / MALA_T)
        keys.append((t, P(SIT_LEGS, SIT_BASE, chest=(-2 - 1.4 * br, 0, 0), head=(10 - 1.0 * br, 0, 0),
                          **{'hand.R': mala_r, 'hand.L': lap_l, 'fingers.R': 35.0, 'fingers.L': 4.0,
                             'thumb.R': (-10 - 30 * pull, 0, 0), 'pole_arm.L': (0.4, 0.05, 0.2), 'pole_arm.R': (-0.4, 0.1, 0.25)})))
    return {'name': 'meditate', 'frames': round(MALA_T * FPS), 'loop': True, 'keys': keys, 'meta': {'beadEvery': 1.1}}


# 돌탑: 합장하고, 쪼그려 앉아 두 손으로 조약돌을 받쳐 얹은 뒤, 일어나 합장 (3초)
STONE_T = 3.0


def clip_offer_stone():
    cup_r = H('chest', (-0.04, -0.2, 0.46), (0.5, -0.8, 0.2), (0.2, 0, 1))
    cup_l = H('chest', (0.04, -0.2, 0.46), (-0.5, -0.8, 0.2), (-0.2, 0, 1))
    place_r = H('root', (-0.04, -0.33, 0.1), (0.3, -0.9, -0.2), (0.2, 0, 1))
    place_l = H('root', (0.04, -0.33, 0.1), (-0.3, -0.9, -0.2), (-0.2, 0, 1))
    hands = {'fingers.L': 25.0, 'fingers.R': 25.0, 'pole_arm.L': (0.4, 0.0, 0.3), 'pole_arm.R': (-0.4, 0.0, 0.3)}
    squat = dict(hips_loc=(0, 0.04, 0.2), hips=(36, 0, 0), spine=(12, 0, 0), head=(14, 0, 0),
                 **{'foot.L': foot(0.085, 0.0, J['ankle.L'][2], 0), 'foot.R': foot(-0.085, 0.0, J['ankle.L'][2], 0),
                    'pole_leg.L': (0.3, -0.5, 0.25), 'pole_leg.R': (-0.3, -0.5, 0.25)})
    k = [(0.0, P(HANG_H, stand(head=(2, 0, 0)))),
         (0.45, P(hands, stand(head=(10, 0, 0)), **{'hand.R': cup_r, 'hand.L': cup_l})),
         (1.1, P(hands, squat, **{'hand.R': cup_r, 'hand.L': cup_l})),
         (1.5, P(hands, squat, **{'hand.R': place_r, 'hand.L': place_l})),
         (1.8, P(hands, squat, **{'hand.R': place_r, 'hand.L': place_l})),
         (2.35, P(GASSHO_H, stand(head=(8, 0, 0)))),
         (STONE_T, P(GASSHO_H, stand(head=(4, 0, 0))))]
    return {'name': 'offer_stone', 'frames': round(STONE_T * FPS), 'keys': k, 'meta': {'propFrom': 0.2, 'propTo': 1.65}}


# 기와: 왼손에 기와를 들고 오른손 붓으로 세 획을 긋고, 두 손으로 받들어 올린 뒤 합장 (3.2초)
TILE_T = 3.2


def clip_write_tile():
    tile_l = H('chest', (0.05, -0.21, 0.48), (-0.6, -0.75, 0.2), (0.15, 0.2, 1))
    brush = lambda dx, dz: H('chest', (-0.03 + dx, -0.25, 0.52 + dz), (0.2, -0.3, -0.93), (0.9, 0, 0.3))
    lift_l = H('chest', (0.05, -0.22, 0.6), (-0.6, -0.75, 0.2), (0.15, 0.2, 1))
    lift_r = H('chest', (-0.04, -0.22, 0.6), (0.6, -0.75, 0.2), (-0.15, 0.2, 1))
    hands = {'fingers.R': 50.0, 'thumb.R': (-25, 0, 0), 'fingers.L': 15.0, 'pole_arm.L': (0.36, 0.1, 0.4), 'pole_arm.R': (-0.36, 0.1, 0.4)}
    k = [(0.0, P(HANG_H, stand(head=(2, 0, 0))))]
    k.append((0.45, P(hands, stand(head=(16, 0, 0)), **{'hand.L': tile_l, 'hand.R': brush(0.0, 0.03)})))
    for i, (a, b) in enumerate(((0.75, 1.0), (1.25, 1.5), (1.75, 2.0))):  # 세 획
        k.append((a, P(hands, stand(head=(18, 0, 0)), **{'hand.L': tile_l, 'hand.R': brush(-0.02 + 0.02 * i, 0.02)})))
        k.append((b, P(hands, stand(head=(18, 0, 0)), **{'hand.L': tile_l, 'hand.R': brush(0.0 + 0.02 * i, -0.02)})))
    k.append((2.45, P(hands, stand(head=(2, 0, 0), chest=(-3, 0, 0)), **{'hand.L': lift_l, 'hand.R': lift_r, 'fingers.R': 15.0})))
    k.append((2.85, P(GASSHO_H, stand(head=(6, 0, 0)))))
    k.append((TILE_T, P(GASSHO_H, stand(head=(4, 0, 0)))))
    return {'name': 'write_tile', 'frames': round(TILE_T * FPS), 'keys': k, 'meta': {'propFrom': 0.25, 'propTo': 2.6}}


# 연등: 두 손으로 등을 가슴 앞에 들었다가 머리 위로 올려 놓아 보내고, 올라가는 등을 바라본 뒤 합장 (3초)
LANTERN_T = 3.0


def clip_hang_lantern():
    hold_r = H('chest', (-0.05, -0.21, 0.5), (0.45, -0.85, 0.2), (0.3, 0, 1))
    hold_l = H('chest', (0.05, -0.21, 0.5), (-0.45, -0.85, 0.2), (-0.3, 0, 1))
    up_r = H('chest', (-0.07, -0.13, 0.9), (0.2, -0.3, 0.93), (0.3, 0.2, 0.9))
    up_l = H('chest', (0.07, -0.13, 0.9), (-0.2, -0.3, 0.93), (-0.3, 0.2, 0.9))
    hands = {'fingers.L': 15.0, 'fingers.R': 15.0, 'pole_arm.L': (0.4, 0.1, 0.5), 'pole_arm.R': (-0.4, 0.1, 0.5)}
    k = [(0.0, P(HANG_H, stand(head=(2, 0, 0)))),
         (0.35, P(hands, stand(head=(8, 0, 0)), **{'hand.R': hold_r, 'hand.L': hold_l})),
         (0.85, P(hands, stand(head=(-14, 0, 0), neck=(-6, 0, 0), chest=(-4, 0, 0)), **{'hand.R': up_r, 'hand.L': up_l})),
         (1.1, P(hands, stand(head=(-18, 0, 0), neck=(-8, 0, 0), chest=(-4, 0, 0)), **{'hand.R': up_r, 'hand.L': up_l})),
         (1.6, P(GASSHO_H, stand(head=(-22, 0, 0), neck=(-8, 0, 0), chest=(-4, 0, 0)))),
         (2.3, P(GASSHO_H, stand(head=(-20, 0, 0), neck=(-8, 0, 0), chest=(-3, 0, 0)))),
         (LANTERN_T, P(GASSHO_H, stand(head=(4, 0, 0))))]
    return {'name': 'hang_lantern', 'frames': round(LANTERN_T * FPS), 'keys': k, 'meta': {'propFrom': 0.0, 'propTo': 1.05}}


# 사경: 서안 앞에 반가부좌로 앉아 몸을 숙이고, 왼손은 종이를 누르고 오른손 붓으로 천천히 쓴다 (4초 고리)
SUTRA_T = 4.0


def clip_sutra():
    paper_l = H('root', (0.11, -0.3, 0.2), (0, -1, -0.1), (0, 0, -1))
    pen = lambda dx, dz: H('root', (-0.06 + dx, -0.31, 0.24 + dz), (0.15, -0.35, -0.92), (0.95, 0, 0.3))
    base = dict(SIT_BASE, hips=(18, 0, 0), spine=(8, 0, 0), chest=(4, 0, 0), neck=(6, 0, 0), head=(16, 0, 0))
    hands = {'fingers.R': 50.0, 'thumb.R': (-25, 0, 0), 'fingers.L': 5.0, 'pole_arm.L': (0.4, 0.0, 0.25), 'pole_arm.R': (-0.4, 0.0, 0.25)}
    k = []
    for i, (dx, dz) in enumerate([(0, 0.02), (0.005, -0.02), (0.012, 0.015), (0.015, -0.025), (0.02, 0.0), (0.012, 0.02), (0.006, -0.015), (0.0, 0.01), (0, 0.02)]):
        k.append((SUTRA_T * i / 8, P(SIT_LEGS, base, hands, **{'hand.L': paper_l, 'hand.R': pen(dx, dz)})))
    return {'name': 'sutra', 'frames': round(SUTRA_T * FPS), 'loop': True, 'keys': k}


CLIPS = [
    clip_idle('idle', HANG_H), clip_idle('idle_chasu', CHASU),
    clip_walk('walk', 'walk'), clip_walk('walk_chasu', 'chasu'), clip_walk('walk_gassho', 'gassho'),
    clip_bow_half(), clip_prostrate(), clip_sit(), clip_stand_up(), clip_sit_down(),
    breathe_loop('gassho', P(GASSHO_H, stand()), head=(4, 0, 0)),
    breathe_loop('look_up', P(CHASU, stand(neck=(-8, 0, 0))), head=(-22, 0, 0)),
    clip_incense(), clip_tea(), clip_serve_tea(), clip_meditate(),
    clip_offer_stone(), clip_write_tile(), clip_hang_lantern(), clip_sutra(),
]
