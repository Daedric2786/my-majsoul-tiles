"""Rebuild a gameplay soundtrack from the in-game audio event log.

The browser capture runs at a fixed timestep (?dt=1/30&rec=1), so real-time audio can't
be recorded. Instead the game logs every audio call with its game-clock time; this script
mixes the same assets (music stems, SFX, ambience) the way src/audio/audio.js does.

Usage: python3 tools/record/mix.py events.json out.wav duration_seconds
"""
import json
import os
import sys
import numpy as np
from scipy.io import wavfile
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.join(HERE, '..', 'audio', 'out')
PUB = os.path.join(HERE, '..', '..', 'public', 'audio')
SR = 44100

MIX = {  # mirrors AudioManager.setMusicState
    'title': (0.85, 0, 1400), 'play': (1, 0, 20000), 'riichi': (0.2, 1, 20000), 'shrine': (0.7, 0, 2600),
    'score': (0.55, 0, 5000), 'fail': (0.5, 0, 700), 'paused': (0.4, 0, 900),
}


def load_wav(path):
    sr, x = wavfile.read(path)
    x = x.astype(np.float64) / 32768
    return x


def one_pole_follow(times, values, tau_list, n):
    """Piecewise setTargetAtTime emulation."""
    out = np.zeros(n)
    cur = values[0] if values else 0
    idx = 0
    events = sorted(zip(times, values, tau_list))
    t = np.arange(n) / SR
    seg_start = 0
    target, tau = cur, 0.1
    for i in range(len(events) + 1):
        end = int(events[i][0] * SR) if i < len(events) else n
        end = max(seg_start, min(end, n))
        if end > seg_start:
            tt = (np.arange(end - seg_start)) / SR
            out[seg_start:end] = target + (cur - target) * np.exp(-tt / max(tau, 1e-3))
            cur = out[end - 1]
        if i < len(events):
            target, tau = events[i][1], events[i][2]
        seg_start = end
    return out


def main(events_path, out_path, dur):
    ev = json.load(open(events_path))
    n = int(dur * SR)
    meta = json.load(open(os.path.join(PUB, 'music.json')))
    calm = np.load(os.path.join(AUD, 'calm.npy')).astype(np.float64)
    tense = np.load(os.path.join(AUD, 'tense.npy')).astype(np.float64)
    vol = ev.get('volumes', {'music': 0.7, 'sfx': 0.85})
    mus_gain = vol['music'] ** 2 * 0.9
    sfx_gain = vol['sfx'] ** 2

    # music: starts at first 'musicStart' event
    start = next((e['t'] for e in ev['log'] if e['type'] == 'musicStart'), 0.0)
    states = [(e['t'], e['state'], e.get('fade', 1.2)) for e in ev['log'] if e['type'] == 'music']
    if not states or states[0][0] > start:
        states.insert(0, (start, 'title', 2.5))
    tl = [s[0] for s in states]
    fades = [s[2] / 3 for s in states]
    g_calm = one_pole_follow(tl, [MIX.get(s[1], MIX['play'])[0] for s in states], fades, n)
    g_tense = one_pole_follow(tl, [MIX.get(s[1], MIX['play'])[1] for s in states], fades, n)
    lp = one_pole_follow(tl, [MIX.get(s[1], MIX['play'])[2] for s in states], fades, n)
    P = len(calm)
    k0 = int(start * SR)
    idx = (np.arange(n) - k0) % P
    music = calm[idx] * g_calm[:, None] + tense[idx] * g_tense[:, None]
    music[:k0] = 0
    # time-varying lowpass approximated by blending 3 static filters
    def lpf(x, hz):
        b, a = signal.butter(2, min(hz, 20000) / (SR / 2), 'low')
        return signal.lfilter(b, a, x, axis=0)
    lo, mid = lpf(music, 800), lpf(music, 3000)
    w_full = np.clip((lp - 3000) / 17000, 0, 1)[:, None]
    w_mid = np.clip((lp - 800) / 2200, 0, 1)[:, None] * (1 - w_full)
    w_lo = 1 - w_full - w_mid
    music = music * w_full + mid * w_mid + lo * w_lo

    # ducking
    duck = np.ones(n)
    for e in ev['log']:
        if e['type'] == 'duck':
            a, hold, rel = e['amount'], e['hold'], e['release']
            s0 = int(e['t'] * SR)
            s1 = min(n, s0 + int(hold * SR))
            duck[s0:s1] = np.minimum(duck[s0:s1], a)
            tt = np.arange(min(n - s1, int(rel * 4 * SR))) / SR
            if len(tt):
                seg = 1 - (1 - a) * np.exp(-tt / (rel / 3))
                duck[s1:s1 + len(tt)] = np.minimum(duck[s1:s1 + len(tt)], seg)
    music *= (duck * mus_gain)[:, None]

    # sfx
    sfx = np.zeros((n, 2))
    cache = {}
    for e in ev['log']:
        if e['type'] != 'sfx':
            continue
        name = e['name']
        if name not in cache:
            p = os.path.join(AUD, f'sfx_{name}.npy')
            if not os.path.exists(p):
                continue
            cache[name] = np.load(p).astype(np.float64)
        x = cache[name]
        rate = e.get('rate', 1)
        if abs(rate - 1) > 1e-3:
            m = int(len(x) / rate)
            src = np.arange(m) * rate
            x = np.stack([np.interp(src, np.arange(len(x)), x[:, c]) for c in range(2)], 1)
        pan = e.get('pan', 0)
        if pan:
            a = (pan + 1) * np.pi / 4
            mono = x.mean(1)
            x = np.stack([mono * np.cos(a) * 1.41, mono * np.sin(a) * 1.41], 1) * 0.5 + x * 0.5
        s0 = int((e['t'] + e.get('delay', 0)) * SR)
        if s0 >= n:
            continue
        m = min(len(x), n - s0)
        sfx[s0:s0 + m] += x[:m] * e.get('vol', 1)
    # ambience
    amb_path = os.path.join(AUD, 'ambience.wav')
    if os.path.exists(amb_path) and k0 < n:
        amb = load_wav(amb_path)
        L = len(amb) - SR  # loopEnd = len - 1s
        ai = (np.arange(n - k0)) % L
        fade = 1 - np.exp(-np.arange(n - k0) / SR / 1.5)
        sfx[k0:] += amb[ai] * (0.55 * fade)[:, None]
    sfx *= sfx_gain

    mix = music + sfx
    # master compressor approximation (-10 dB threshold, 4:1) on a smoothed envelope
    env = np.sqrt(signal.lfilter([1 - 0.999], [1, -0.999], (mix ** 2).mean(1)))
    thr = 10 ** (-10 / 20)
    over = np.maximum(env / thr, 1)
    gain = over ** (1 / 4 - 1)
    mix *= gain[:, None]
    peak = np.max(np.abs(mix))
    if peak > 0.98:
        mix *= 0.98 / peak
    wavfile.write(out_path, SR, (mix * 32767).astype(np.int16))
    print('mixed', out_path, 'peak', round(float(peak), 3), 'events', len(ev['log']))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]))
