"""ZIP 압축 스캔라인 OpenEXR(half) 읽기 — NASA SVS 별지도용 최소 해독기 (의존성: numpy). read(path) → (H, W, C) float32, 채널 이름"""
import struct, zlib
import numpy as np

def read(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'\x76\x2f\x31\x01', 'OpenEXR 아님'
    i, attrs = 8, {}
    while b[i] != 0:
        j = b.index(0, i); name = b[i:j].decode(); i = j + 1
        j = b.index(0, i); i = j + 1
        n = struct.unpack_from('<i', b, i)[0]; i += 4
        attrs[name] = b[i:i + n]; i += n
    i += 1
    assert attrs['compression'][0] == 3, 'ZIP(16줄) 압축만 읽는다'
    x0, y0, x1, y1 = struct.unpack('<4i', attrs['dataWindow'])
    W, H = x1 - x0 + 1, y1 - y0 + 1
    chans, k, cl = [], 0, attrs['channels']
    while cl[k] != 0:
        j = cl.index(0, k); nm = cl[k:j].decode(); k = j + 1
        pt = struct.unpack_from('<i', cl, k)[0]; k += 16
        assert pt == 1, 'half 채널만'
        chans.append(nm)
    nblk = (H + 15) // 16
    offs = struct.unpack_from(f'<{nblk}Q', b, i)
    out = np.zeros((H, len(chans), W), np.float16)
    for o in offs:
        y, size = struct.unpack_from('<ii', b, o)
        t = np.frombuffer(zlib.decompress(b[o + 8:o + 8 + size]), np.uint8).astype(np.int32)
        t = (np.cumsum(t - 128) + 128 * 1) % 256  # 예측 풀기: t[i] = t[i-1] + t[i] - 128
        t[0] = (t[0]) % 256
        t = t.astype(np.uint8)
        half = (len(t) + 1) // 2
        raw = np.empty(len(t), np.uint8); raw[0::2] = t[:half]; raw[1::2] = t[half:]
        rows = min(16, H - (y - y0))
        out[y - y0:y - y0 + rows] = np.frombuffer(raw.tobytes(), '<f2').reshape(rows, len(chans), W)
    return out.transpose(0, 2, 1).astype(np.float32), chans
