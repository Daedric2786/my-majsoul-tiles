"""Riichi River sound effects -> one sprite (ogg/opus + mp3) + sfx.json offsets.

Tonal effects are tuned to D minor pentatonic (D F G A C) so they sit inside the music.
"""
import json
import os
import subprocess
import numpy as np
from scipy.io import wavfile
import synth as S

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IR_ROOM = S.make_ir(0.8, 0.008, 6000, seed=21)
IR_HALL = S.make_ir(2.4, 0.025, 5000, seed=22)
D5 = S.midi_hz(74)


def mixp(*arrs):
    n = max(len(a) for a in arrs)
    out = np.zeros(n) if arrs[0].ndim == 1 else np.zeros((n, arrs[0].shape[1]))
    for a in arrs:
        out[: len(a)] += a
    return out


def verb(x, ir, wet):
    if x.ndim == 1:
        x = S.stereo(x)
    return S.reverb(x, ir, wet)


def trim(x, thresh=1e-4):
    a = np.max(np.abs(x), axis=1) if x.ndim == 2 else np.abs(x)
    idx = np.where(a > thresh)[0]
    return x[: idx[-1] + 1] if len(idx) else x


def fade_out(x, sec=0.03):
    k = min(len(x), S.secs(sec))
    x = x.copy()
    x[-k:] *= np.linspace(1, 0, k)[:, None] if x.ndim == 2 else np.linspace(1, 0, k)
    return x


def ivory_click(bright=1.0, body=1.0):
    """Mahjong tile landing on a wooden rack: two hard bodies + wood thunk."""
    parts = [(1720 * bright, 0.9, 0.018), (2960 * bright, 0.6, 0.012), (4380 * bright, 0.45, 0.008), (6100 * bright, 0.25, 0.005)]
    x = S.modal(parts, 0.22, noise_amt=0.55, noise_tau=0.0025, lp=11000)
    wood = S.modal([(210, 0.8 * body, 0.035), (420, 0.35 * body, 0.02), (690, 0.2, 0.015)], 0.22, noise_amt=0.0)
    return x * 0.8 + wood * 0.7


def sfx_clack():
    x = ivory_click()
    # tiny second contact (tile settling)
    y = ivory_click(1.04, 0.4) * 0.35
    out = np.zeros(S.secs(0.3))
    out[: len(x)] += x
    k = S.secs(0.028)
    out[k:k + len(y)] += y[: len(out) - k]
    return verb(out, IR_ROOM, 0.12)


def sfx_catch():
    n = S.secs(0.45)
    t = np.arange(n) / S.SR
    # water lift: bandpassed noise swell + rising bloop + droplets
    splash = S.bandpass(S.noise(n), 900, 4500) * np.exp(-t / 0.07) * 0.6
    f = 260 + 520 * (1 - np.exp(-t / 0.05))
    bloop = np.sin(np.cumsum(2 * np.pi * f / S.SR)) * np.exp(-t / 0.06) * 0.5
    out = splash + bloop
    for i in range(4):
        d = S.plip(S.rng.uniform(1600, 3200), 0.35)
        k = S.secs(0.03 + i * 0.045 + S.rng.uniform(0, 0.02))
        out[k:k + len(d)] += d[: n - k]
    return verb(S.stereo(out), IR_ROOM, 0.2)


def sfx_toss():
    n = S.secs(0.55)
    t = np.arange(n) / S.SR
    sweep = S.noise(n)
    # whoosh: moving bandpass implemented as crossfade of two bands
    hi = S.bandpass(sweep, 2500, 7000) * np.exp(-t / 0.08)
    lo = S.bandpass(sweep, 500, 1800) * np.clip(t / 0.15, 0, 1) * np.exp(-t / 0.12)
    splash = np.zeros(n)
    k = S.secs(0.22)
    sp = S.bandpass(S.noise(S.secs(0.25)), 700, 3500) * np.exp(-np.arange(S.secs(0.25)) / S.SR / 0.05)
    splash[k:k + len(sp)] = sp[: n - k] * 0.7
    return verb(S.stereo((hi * 0.3 + lo * 0.4 + splash)), IR_ROOM, 0.2)


def sfx_thud():
    x = S.modal([(180, 1.0, 0.05), (310, 0.5, 0.03), (560, 0.2, 0.02)], 0.25, noise_amt=0.25, noise_tau=0.004, lp=1800)
    return verb(S.stereo(x * 0.9), IR_ROOM, 0.1)


def chime(freq, dur=1.6, vel=1.0):
    """Clear FM chime (bright, short) for melds."""
    n = S.secs(dur)
    t = np.arange(n) / S.SR
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * np.exp(-t / 0.15) * 2.0
    x = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t / 0.5)
    x += 0.35 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t / 0.3)
    x += 0.15 * np.sin(2 * np.pi * freq * 4.02 * t) * np.exp(-t / 0.12)
    return x * vel * 0.45


def sfx_meld():
    # tile "snap" + chime on D5 (played at pentatonic rates by the game)
    snap = ivory_click(1.1, 0.8)
    snap2 = ivory_click(0.97, 0.3)
    c = mixp(chime(D5, 1.4), chime(D5 * 1.5, 1.2, 0.35))
    out = np.zeros(S.secs(1.5))
    out[: len(snap)] += snap * 0.7
    k = S.secs(0.035)
    out[k:k + len(snap2)] += snap2 * 0.5
    k2 = S.secs(0.02)
    out[k2:k2 + len(c)] += c[: len(out) - k2]
    return verb(S.stereo(out), IR_HALL, 0.22)


def sfx_kan():
    out = np.zeros(S.secs(2.2))
    for i in range(4):
        c = ivory_click(1 + i * 0.03, 0.6)
        k = S.secs(i * 0.045)
        out[k:k + len(c)] += c * 0.6
    b = S.bell(S.midi_hz(62), 1.8, 0.8)  # D4 bell
    c = mixp(chime(D5, 1.6), chime(S.midi_hz(81), 1.3, 0.5))
    k = S.secs(0.18)
    out[k:k + len(b)] += b[: len(out) - k] * 0.9
    out[k:k + len(c)] += c[: len(out) - k] * 0.6
    return verb(S.stereo(out), IR_HALL, 0.28)


def sfx_tenpai():
    out = np.zeros(S.secs(1.6))
    for i, m in enumerate([81, 86]):  # A5, D6
        c = chime(S.midi_hz(m), 1.2, 0.45)
        k = S.secs(i * 0.12)
        out[k:k + len(c)] += c[: len(out) - k]
    return verb(S.stereo(out), IR_HALL, 0.35)


def hyoshigi():
    """Wooden clappers: very bright, short, dry crack."""
    return S.modal([(2350, 1.0, 0.03), (3720, 0.7, 0.02), (5180, 0.5, 0.012), (1180, 0.4, 0.04)], 0.25, noise_amt=0.8, noise_tau=0.0015, lp=12000)


def sfx_riichi():
    out = np.zeros((S.secs(2.6), 2))
    h1 = S.stereo(hyoshigi(), -0.2)
    h2 = S.stereo(hyoshigi() * 0.85, 0.2)
    out[: len(h1)] += h1
    k = S.secs(0.16)
    out[k:k + len(h2)] += h2
    tk = S.taiko(1.0, 0.9)
    k = S.secs(0.3)
    out[k:k + len(tk)] += S.stereo(tk) * 0.9
    # low swell
    sw = S.pad([S.midi_hz(38), S.midi_hz(45)], 1.2, attack=0.3, release=0.8, cutoff=600, vel=2.2)
    out[k:k + len(sw)] += sw[: len(out) - k]
    return verb(out, IR_HALL, 0.3)


def sfx_tsumo():
    out = np.zeros((S.secs(3.6), 2))
    tk = S.taiko(1.0, 1.0)
    out[: len(tk)] += S.stereo(tk) * 1.0
    cl = ivory_click(1.2, 1.2)
    out[: len(cl)] += S.stereo(cl) * 0.9
    g = S.bell(S.midi_hz(50), 3.2, 1.0, bright=1.3)  # D3 gong
    k = S.secs(0.02)
    out[k:k + len(g)] += S.stereo(g) * 0.9
    # shimmer: rising pentatonic koto run
    penta = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86]
    for i, m in enumerate(penta):
        kt = S.koto(S.midi_hz(m), 1.2, bright=0.7, vel=0.35 + i * 0.03)
        k = S.secs(0.12 + i * 0.035)
        seg = S.stereo(kt, -0.6 + i * 0.12)
        out[k:k + len(seg)] += seg[: len(out) - k]
    return verb(out, IR_HALL, 0.32)


def sfx_tally():
    return verb(S.stereo(S.koto(D5, 0.7, bright=0.65, vel=0.8)), IR_ROOM, 0.2)


def sfx_count():
    n = S.secs(0.8)
    out = np.zeros(n)
    k = 0
    i = 0
    while k < S.secs(0.62):
        c = S.modal([(3900 + (i % 3) * 300, 0.5, 0.012), (6100, 0.3, 0.006)], 0.05, noise_amt=0.2, noise_tau=0.001)
        out[k:k + len(c)] += c * (0.5 + 0.5 * (i / 18))
        k += S.secs(0.034)
        i += 1
    return verb(S.stereo(out * 0.6), IR_ROOM, 0.15)


def strum(chord, spacing=0.03, vel=0.6, dur=2.0):
    n = S.secs(dur + spacing * len(chord))
    out = np.zeros((n, 2))
    for i, m in enumerate(chord):
        kt = S.koto(S.midi_hz(m), dur, bright=0.6, vel=vel)
        k = S.secs(i * spacing)
        out[k:k + len(kt)] += S.stereo(kt, -0.4 + 0.8 * i / max(1, len(chord) - 1))
    return out


def sfx_limit():
    out = np.zeros((S.secs(2.4), 2))
    thump = S.modal([(140, 1.0, 0.06), (260, 0.5, 0.04)], 0.3, noise_amt=0.4, noise_tau=0.005, lp=2500)
    out[: len(thump)] += S.stereo(thump) * 0.9
    st = strum([50, 57, 62, 65, 69, 72, 76])  # Dm9 strum
    out[: len(st)] += st[: len(out)] * 0.8
    return verb(out, IR_HALL, 0.3)


def sfx_limit_big():
    out = np.zeros((S.secs(4.0), 2))
    base = sfx_limit()
    out[: len(base)] += base[: len(out)]
    g = S.bell(S.midi_hz(38), 3.6, 1.0, 1.2)
    out[: len(g)] += S.stereo(g) * 0.8
    for i, m in enumerate([81, 84, 86, 89, 93]):
        c = chime(S.midi_hz(m), 1.4, 0.4)
        k = S.secs(0.3 + i * 0.09)
        out[k:k + len(c)] += S.stereo(c, -0.5 + i * 0.25)[: len(out) - k]
    return verb(out, IR_HALL, 0.3)


def sfx_gong():
    g = S.bell(S.midi_hz(43), 4.0, 0.9, 0.7)  # G2 temple bell (bonsho-like, soft strike)
    x = S.stereo(S.lowpass(g, 3000, 1))
    return verb(x, IR_HALL, 0.35)


def sfx_clear():
    out = np.zeros((S.secs(3.2), 2))
    run = [62, 65, 67, 69, 72, 74, 77, 79, 81]
    for i, m in enumerate(run):
        kt = S.koto(S.midi_hz(m), 1.4, bright=0.65, vel=0.55)
        k = S.secs(i * 0.055)
        out[k:k + len(kt)] += S.stereo(kt, -0.5 + i * 0.12)[: len(out) - k]
    st = strum([62, 69, 74, 77, 81, 86], 0.02, 0.55, 2.2)
    k = S.secs(0.55)
    out[k:k + len(st)] += st[: len(out) - k]
    c = chime(S.midi_hz(86), 2.0, 0.45)
    out[k:k + len(c)] += S.stereo(c)[: len(out) - k]
    return verb(out, IR_HALL, 0.3)


def sfx_fail():
    out = np.zeros((S.secs(3.0), 2))
    run = [81, 77, 74, 72, 69, 65, 62]
    for i, m in enumerate(run):
        kt = S.koto(S.midi_hz(m), 1.4, bright=0.35, vel=0.4 - i * 0.02)
        k = S.secs(i * 0.13)
        out[k:k + len(kt)] += S.stereo(kt, 0.4 - i * 0.12)[: len(out) - k]
    tk = S.taiko(0.6, 0.8)
    k = S.secs(0.95)
    out[k:k + len(tk)] += S.stereo(tk)[: len(out) - k] * 0.7
    return verb(out, IR_HALL, 0.35)


def sfx_bless():
    out = np.zeros((S.secs(1.8), 2))
    for i, m in enumerate([74, 79, 81, 86, 91]):
        c = chime(S.midi_hz(m), 1.2, 0.4)
        k = S.secs(i * 0.06)
        out[k:k + len(c)] += S.stereo(c, -0.5 + i * 0.25)[: len(out) - k]
    return verb(out, IR_HALL, 0.4)


def sfx_charm():
    # suzu bell jingle: several small inharmonic bells shaken
    out = np.zeros(S.secs(1.2))
    for i in range(7):
        f = S.rng.uniform(3200, 4200)
        b = S.modal([(f, 0.6, 0.12), (f * 1.52, 0.3, 0.08), (f * 2.3, 0.15, 0.05)], 0.4, noise_amt=0.05)
        k = S.secs(i * 0.05 + S.rng.uniform(0, 0.02))
        out[k:k + len(b)] += b[: len(out) - k] * (1 - i * 0.1)
    return verb(S.stereo(out * 0.5), IR_ROOM, 0.3)


def sfx_ui():
    x = S.modal([(1400, 0.6, 0.012), (2600, 0.3, 0.008)], 0.08, noise_amt=0.2, noise_tau=0.0015, lp=8000)
    return verb(S.stereo(x * 0.6), IR_ROOM, 0.1)


def ambience():
    """20 s seamless river bed: pink noise, slow swells, occasional burbles."""
    n = S.secs(20)
    t = np.arange(n) / S.SR
    base = S.lowpass(S.pink(n + S.secs(1)), 1400, 2)[: n]
    swell = 0.75 + 0.25 * np.sin(2 * np.pi * t / 20 * 3) * np.sin(2 * np.pi * t / 20 * 2 + 1)
    L = base * swell
    R = np.roll(S.lowpass(S.pink(n + S.secs(1)), 1400, 2)[: n], 1000) * swell
    out = np.stack([L, R], 1) * 0.12
    for i in range(26):
        d = S.plip(S.rng.uniform(500, 1400), S.rng.uniform(0.05, 0.12))
        S.place(out, S.stereo(d, S.rng.uniform(-0.8, 0.8)), S.secs(S.rng.uniform(0, 20)))
    # crossfade the ends so the loop is seamless
    k = S.secs(1.0)
    ramp = np.linspace(0, 1, k)[:, None]
    head = out[:k].copy()
    out[-k:] = out[-k:] * (1 - ramp) + head * ramp
    out = out[:-k] if False else out
    return out


SFX = {
    'clack': sfx_clack, 'catch': sfx_catch, 'toss': sfx_toss, 'thud': sfx_thud, 'meld': sfx_meld, 'kan': sfx_kan,
    'tenpai': sfx_tenpai, 'riichi': sfx_riichi, 'tsumo': sfx_tsumo, 'tally': sfx_tally, 'count': sfx_count,
    'limit': sfx_limit, 'limitBig': sfx_limit_big, 'gong': sfx_gong, 'clear': sfx_clear, 'fail': sfx_fail,
    'bless': sfx_bless, 'charm': sfx_charm, 'ui': sfx_ui,
}
# target peak per effect (relative loudness design)
PEAK = {'clack': 0.7, 'catch': 0.6, 'toss': 0.5, 'thud': 0.6, 'meld': 0.75, 'kan': 0.85, 'tenpai': 0.55, 'riichi': 0.9,
        'tsumo': 0.95, 'tally': 0.5, 'count': 0.45, 'limit': 0.85, 'limitBig': 0.95, 'gong': 0.7, 'clear': 0.85,
        'fail': 0.7, 'bless': 0.6, 'charm': 0.55, 'ui': 0.4}


def encode(wav, base, kbps_opus='96k', kbps_mp3='128k'):
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    out = os.path.join(ROOT, 'public', 'audio')
    subprocess.run([ff, '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libopus', '-b:a', kbps_opus, os.path.join(out, base + '.ogg')], check=True)
    subprocess.run([ff, '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', kbps_mp3, os.path.join(out, base + '.mp3')], check=True)


if __name__ == '__main__':
    tmp = os.path.join(ROOT, 'tools', 'audio', 'out')
    os.makedirs(tmp, exist_ok=True)
    gap = S.secs(0.25)
    lead = S.secs(0.1)  # leading silence absorbs encoder priming
    chunks = [np.zeros((lead, 2))]
    sprites = {}
    pos = lead
    report = []
    for name, fn in SFX.items():
        x = fn()
        if x.ndim == 1:
            x = S.stereo(x)
        x = fade_out(trim(x, 0.004 * np.max(np.abs(x))), 0.06)
        x = S.normalize(x, PEAK[name])
        sprites[name] = [round(pos / S.SR, 4), round(len(x) / S.SR, 4)]
        chunks.append(x)
        chunks.append(np.zeros((gap, 2)))
        pos += len(x) + gap
        np.save(os.path.join(tmp, f'sfx_{name}.npy'), x.astype(np.float32))
        report.append((name, len(x) / S.SR, S.rms_db(x)))
    data = np.concatenate(chunks)
    wav = os.path.join(tmp, 'sfx.wav')
    wavfile.write(wav, S.SR, (np.clip(data, -1, 1) * 32767).astype(np.int16))
    encode(wav, 'sfx', '64k', '112k')
    amb = ambience()
    wav2 = os.path.join(tmp, 'ambience.wav')
    wavfile.write(wav2, S.SR, (np.clip(amb, -1, 1) * 32767).astype(np.int16))
    encode(wav2, 'ambience', '48k', '80k')
    with open(os.path.join(ROOT, 'public', 'audio', 'sfx.json'), 'w') as f:
        json.dump({'sprites': sprites, 'ambience': {'loopStart': 0.0, 'loopEnd': round(len(amb) / S.SR - 1.0, 4)}}, f)
    for r in report:
        print(f'{r[0]:9s} {r[1]:5.2f}s  rms {r[2]:6.1f} dB')
