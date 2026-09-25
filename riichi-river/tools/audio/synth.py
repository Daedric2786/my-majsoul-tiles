"""Tiny offline synthesis toolkit for Riichi River (numpy/scipy).

Everything renders at 44.1 kHz float64, stereo arrays shaped (n, 2).
"""
import numpy as np
from scipy import signal

SR = 44100
rng = np.random.default_rng(20260925)


def secs(n):
    return int(round(n * SR))


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def t_axis(dur):
    return np.arange(secs(dur)) / SR


def stereo(x, pan=0.0):
    """Equal-power pan, pan in [-1, 1]."""
    a = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def env_adsr(n, a=0.005, d=0.1, s=0.7, r=0.2, hold=None):
    """ADSR envelope of length n samples. `hold` = seconds until release starts."""
    e = np.zeros(n)
    ia, idd, ir = secs(a), secs(d), secs(r)
    ih = secs(hold) if hold is not None else max(0, n - ir)
    k = 0
    if ia > 0:
        seg = min(ia, n)
        e[:seg] = np.linspace(0, 1, ia, endpoint=False)[:seg]
        k = seg
    seg = min(idd, max(0, ih - k))
    if seg > 0:
        e[k:k + seg] = np.linspace(1, s, idd, endpoint=False)[:seg]
        k += seg
    if ih > k:
        e[k:ih] = s
        k = ih
    if k < n:
        rel = np.linspace(e[k - 1] if k > 0 else s, 0, ir)
        m = min(ir, n - k)
        e[k:k + m] = rel[:m]
    return e


def exp_decay(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def lowpass(x, hz, order=2):
    b, a = signal.butter(order, min(hz, SR * 0.45) / (SR / 2), 'low')
    return signal.lfilter(b, a, x, axis=0)


def highpass(x, hz, order=2):
    b, a = signal.butter(order, hz / (SR / 2), 'high')
    return signal.lfilter(b, a, x, axis=0)


def bandpass(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], 'band')
    return signal.lfilter(b, a, x, axis=0)


def noise(n):
    return rng.standard_normal(n)


def pink(n):
    w = rng.standard_normal(n)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return signal.lfilter(b, a, w) * 3.0


def saw_blep(freq, dur, detune_cents=0.0, phase=None):
    """Band-limited-ish saw via additive partials (fine for pads)."""
    t = t_axis(dur)
    f = freq * 2 ** (detune_cents / 1200)
    out = np.zeros_like(t)
    nmax = int(min(40, (SR * 0.45) // f))
    ph = rng.uniform(0, 2 * np.pi) if phase is None else phase
    for k in range(1, nmax + 1):
        out += np.sin(2 * np.pi * f * k * t + ph * k) / k
    return out * 0.6


# ---------------------------------------------------------------- instruments

def koto(freq, dur=2.5, bright=0.55, bend=True, vel=1.0):
    """Karplus-Strong plucked string with koto-like attack bend and body resonance.
    Pitch-accurate: the KS loop runs at a slightly higher pitch and is resampled."""
    n = secs(dur)
    period = SR / freq
    N = max(3, int(np.floor(period + 0.5)))
    f0 = SR / (N - 0.5)  # loop averages delays N and N-1
    ratio = freq / f0  # <= 1: read slower
    n_src = int(n * ratio) + N + 4
    buf = lowpass(noise(N), 800 + 5200 * bright * vel, 1) * 0.9
    buf -= buf.mean()
    y = np.zeros(n_src + N + 2)
    y[:N] = buf
    decay = 0.9985 - min(0.006, (freq / 2000) * 0.004)
    idx = N
    total = n_src + N
    while idx < total:
        end = min(idx + N - 1, total)  # chunk must not read samples it is writing
        a = y[idx - N:end - N]
        b = y[idx - N + 1:end - N + 1]
        y[idx:end] = decay * 0.5 * (a + b)
        idx = end
    src = y[N:N + n_src]
    tt = np.arange(n) / SR
    dev = 2 ** ((30 * np.exp(-tt / 0.06)) / 1200) if bend else np.ones(n)
    pos = np.cumsum(dev * ratio)
    pos = np.clip(pos, 0, len(src) - 1)
    out = np.interp(pos, np.arange(len(src)), src)
    body = bandpass(out, 180, 1400, 1) * 0.5 + out
    pluck = highpass(noise(secs(0.012)), 2500) * np.linspace(1, 0, secs(0.012)) * 0.15
    body[:len(pluck)] += pluck
    fade = np.ones(n)
    fade[-secs(0.05):] = np.linspace(1, 0, secs(0.05))
    return body * fade * vel * 0.6


def epiano(freq, dur=1.6, vel=0.8, release=0.5):
    """2-operator FM e-piano (tine + body) with gentle tremolo."""
    n = secs(dur + release)
    t = np.arange(n) / SR
    env_i = np.exp(-t / 0.35) * (1.5 + vel)
    mod = np.sin(2 * np.pi * freq * t) * env_i
    body = np.sin(2 * np.pi * freq * t + mod)
    tine_env = np.exp(-t / 0.08) * 0.35 * vel
    tine = np.sin(2 * np.pi * freq * 14 * t + np.sin(2 * np.pi * freq * t) * 0.6) * tine_env
    amp = env_adsr(n, 0.003, 0.9, 0.35, release, hold=dur) * (0.4 + 0.6 * vel)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.2 * t)
    return (body * 0.8 + tine) * amp * trem * 0.35


def pad(freqs, dur, attack=0.8, release=1.6, cutoff=1300, detune=9, vel=0.6):
    n = secs(dur + release)
    L = np.zeros(n)
    R = np.zeros(n)
    for i, f in enumerate(freqs):
        for d, side in ((-detune, 0), (detune, 1), (0, 2)):
            s = saw_blep(f, dur + release, d)
            if side == 0:
                L += s
            elif side == 1:
                R += s
            else:
                L += s * 0.5
                R += s * 0.5
    e = env_adsr(n, attack, 0.5, 0.85, release, hold=dur)
    t = np.arange(n) / SR
    wob = 1 + 0.15 * np.sin(2 * np.pi * 0.13 * t)
    L = lowpass(L * e, cutoff * 1.0) * wob
    R = lowpass(R * e, cutoff * 1.03) * wob
    return np.stack([L, R], 1) * vel * 0.05


def bass(freq, dur, vel=0.8):
    n = secs(dur + 0.08)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t) + 0.12 * np.sin(6 * np.pi * freq * t)
    e = env_adsr(n, 0.006, 0.25, 0.6, 0.08, hold=dur) * np.exp(-t / 2.2)
    return np.tanh(x * e * 1.6) * vel * 0.32


def flute(freq, dur, vel=0.6, vib=5.0, bend_in=True):
    """Breathy shakuhachi-ish tone."""
    n = secs(dur + 0.3)
    t = np.arange(n) / SR
    vibr = 1 + 0.006 * np.sin(2 * np.pi * vib * t) * np.clip((t - 0.35) * 2, 0, 1)
    bend = 2 ** (-(60 * np.exp(-t / 0.12)) / 1200) if bend_in else 1
    ph = np.cumsum(2 * np.pi * freq * vibr * bend / SR)
    tone = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    breath = bandpass(noise(n), freq * 0.9, freq * 3.5, 1) * 0.35
    e = env_adsr(n, 0.12, 0.3, 0.8, 0.3, hold=dur)
    return (tone + breath) * e * vel * 0.25


def kick(vel=1.0):
    n = secs(0.5)
    t = np.arange(n) / SR
    f = 52 + 110 * np.exp(-t / 0.04)
    ph = np.cumsum(2 * np.pi * f / SR)
    x = np.sin(ph) * np.exp(-t / 0.17)
    click = highpass(noise(secs(0.004)), 1500) * 0.3
    x[:len(click)] += click
    return np.tanh(x * 1.4) * vel * 0.8


def snare_soft(vel=0.6):
    n = secs(0.3)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.5
    nz = bandpass(noise(n), 1200, 7000) * np.exp(-t / 0.09)
    return (tone + nz) * vel * 0.5


def rim(vel=0.6):
    n = secs(0.12)
    t = np.arange(n) / SR
    x = (np.sin(2 * np.pi * 1650 * t) + 0.6 * np.sin(2 * np.pi * 820 * t)) * np.exp(-t / 0.018)
    x += bandpass(noise(n), 2000, 8000) * np.exp(-t / 0.008) * 0.6
    return x * vel * 0.35


def hat(vel=0.4, open_=False):
    n = secs(0.35 if open_ else 0.08)
    t = np.arange(n) / SR
    x = highpass(noise(n), 7000, 3) * np.exp(-t / (0.12 if open_ else 0.022))
    return x * vel * 0.35


def shaker(vel=0.3):
    n = secs(0.09)
    x = bandpass(noise(n), 4500, 12000, 2)
    e = np.sin(np.linspace(0, np.pi, n)) ** 2
    return x * e * vel * 0.3


def taiko(vel=1.0, pitch=1.0):
    n = secs(1.4)
    t = np.arange(n) / SR
    f = (62 + 60 * np.exp(-t / 0.03)) * pitch
    ph = np.cumsum(2 * np.pi * f / SR)
    body = np.sin(ph) * np.exp(-t / 0.45) + 0.4 * np.sin(ph * 1.58) * np.exp(-t / 0.2)
    skin = lowpass(noise(n), 900) * np.exp(-t / 0.05) * 0.8
    return np.tanh((body + skin) * 1.3) * vel * 0.9


def shime(vel=0.5):
    n = secs(0.2)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.04) + bandpass(noise(n), 800, 4000) * np.exp(-t / 0.02) * 0.7
    return x * vel * 0.35


def plip(freq, vel=0.5):
    """Water droplet: fast upward sine chirp."""
    n = secs(0.18)
    t = np.arange(n) / SR
    f = freq * (1 + 1.2 * (1 - np.exp(-t / 0.02)))
    ph = np.cumsum(2 * np.pi * f / SR)
    return np.sin(ph) * np.exp(-t / 0.04) * vel * 0.4


def modal(partials, n_sec=0.4, noise_amt=0.3, noise_tau=0.004, lp=9000):
    """Modal synthesis: list of (freq, amp, tau)."""
    n = secs(n_sec)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f, a, tau in partials:
        x += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / tau)
    nz = lowpass(noise(n), lp) * np.exp(-t / noise_tau) * noise_amt
    return x + nz


def bell(freq, dur=3.0, vel=0.8, bright=1.0):
    """Inharmonic bell/gong partials."""
    ratios = [(0.5, 0.6, 1.6), (1.0, 1.0, 1.2), (1.19, 0.5, 0.9), (1.56, 0.45, 0.7), (2.0, 0.35, 0.6), (2.51, 0.25 * bright, 0.4), (3.0, 0.15 * bright, 0.3), (4.1, 0.1 * bright, 0.2)]
    n = secs(dur)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for r, a, tau in ratios:
        beat = 1 + 0.25 * np.sin(2 * np.pi * (0.7 + r * 0.3) * t)
        x += a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / (tau * dur / 1.5)) * beat
    strike = highpass(noise(secs(0.01)), 2000) * 0.2
    x[:len(strike)] += strike
    return x * vel * 0.3


# ---------------------------------------------------------------- effects

def make_ir(dur=2.2, predelay=0.02, damp=4500, seed=3):
    r = np.random.default_rng(seed)
    n = secs(dur)
    t = np.arange(n) / SR
    L = r.standard_normal(n) * np.exp(-t / (dur / 6.5))
    R = r.standard_normal(n) * np.exp(-t / (dur / 6.5))
    L = lowpass(L, damp, 1)
    R = lowpass(R, damp, 1)
    # early reflections
    for d, g in ((0.011, 0.5), (0.019, 0.35), (0.027, 0.3), (0.041, 0.2)):
        k = secs(d)
        L[k] += g
        R[k + secs(0.003)] += g * 0.9
    pd = secs(predelay)
    L = np.concatenate([np.zeros(pd), L])
    R = np.concatenate([np.zeros(pd), R])
    ir = np.stack([L, R], 1)
    return ir / np.sqrt((ir ** 2).sum() / 2)


def reverb(x, ir, wet=0.25):
    """x stereo (n,2). Returns length n + len(ir) - 1."""
    yl = signal.fftconvolve(x[:, 0], ir[:, 0])
    yr = signal.fftconvolve(x[:, 1], ir[:, 1])
    y = np.stack([yl, yr], 1) * wet
    y[: len(x)] += x * (1 - wet * 0.3)
    return y


def saturate(x, drive=1.2):
    return np.tanh(x * drive) / np.tanh(drive)


def limiter(x, ceiling=0.89, release=0.08):
    """Look-ahead peak limiter (3 ms look-ahead, instant attack, exponential release)."""
    from scipy.ndimage import maximum_filter1d
    la = secs(0.003)
    peak = np.max(np.abs(x), axis=1)
    fut = maximum_filter1d(peak, size=2 * la + 1, origin=0)
    gain = np.minimum(1.0, ceiling / np.maximum(fut, 1e-9))
    # release smoothing via one-pole filter on (1 - gain) with fast attack
    a = np.exp(-1 / (release * SR))
    red = 1 - gain
    out = np.empty_like(red)
    cur = 0.0
    for i in range(0, len(red), 64):
        blk = red[i:i + 64]
        m = blk.max()
        cur = m if m > cur else cur * (a ** 64) + m * (1 - a ** 64)
        out[i:i + 64] = np.maximum(blk, cur)
    return x * (1 - out)[:, None]


def normalize(x, peak=0.89):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)


def place(dst, src, at):
    """Mix src into dst at sample index `at` (with wrap-around for loops)."""
    n = len(dst)
    if src.ndim == 1:
        src = stereo(src)
    at = at % n
    end = at + len(src)
    if end <= n:
        dst[at:end] += src
    else:
        k = n - at
        dst[at:] += src[:k]
        rest = src[k:]
        while len(rest):
            m = min(len(rest), n)
            dst[:m] += rest[:m]
            rest = rest[m:]
