"""Riichi River — "Lantern River" (84 BPM, D minor / dorian colour, 32 bars).

Two stems of identical length render as seamless loops:
  music_calm  : koto melody, FM e-piano, warm pad, bass, lo-fi kit, water plips
  music_tense : same harmony; taiko + shime ostinato, shakuhachi long tones, koto tremolo, drone
The game crossfades between them (riichi = tense).
"""
import json
import os
import numpy as np
import synth as S

BPM = 84
BEAT = 60 / BPM
BAR = BEAT * 4
BARS = 32
P = BAR * BARS  # period in seconds
N = S.secs(P)
SWING = 0.58
rng = np.random.default_rng(7)

# ------------------------------------------------------------------ harmony (bar -> chord)
CH = {
    'Dm9': dict(root=38, pad=[50, 57, 60, 65, 76], ep=[62, 65, 69, 72, 76], tones=[62, 65, 69, 72, 74, 76]),
    'Bbmaj9': dict(root=34, pad=[46, 53, 57, 62, 72], ep=[62, 65, 69, 72, 74], tones=[58, 62, 65, 69, 72, 74]),
    'Gm9': dict(root=31, pad=[43, 53, 57, 58, 62], ep=[58, 62, 65, 69, 70], tones=[55, 58, 62, 65, 69, 70]),
    'A7sus': dict(root=33, pad=[45, 52, 55, 57, 62], ep=[57, 62, 64, 67, 69], tones=[57, 62, 64, 67, 69, 74]),
    'A7': dict(root=33, pad=[45, 52, 55, 61, 64], ep=[61, 64, 67, 69, 70], tones=[57, 61, 64, 67, 69, 73]),
    'C69': dict(root=36, pad=[48, 55, 57, 62, 64], ep=[60, 62, 64, 67, 69], tones=[60, 62, 64, 67, 69, 72]),
    'Cadd9': dict(root=36, pad=[48, 55, 60, 62, 64], ep=[60, 62, 64, 67, 72], tones=[60, 62, 64, 67, 72, 74]),
    'Am7': dict(root=33, pad=[45, 52, 55, 60, 64], ep=[60, 64, 67, 69, 72], tones=[57, 60, 64, 67, 69, 72]),
    'Fmaj7': dict(root=29, pad=[41, 53, 57, 60, 64], ep=[60, 64, 65, 69, 72], tones=[57, 60, 64, 65, 69, 72]),
}
A = ['Dm9', 'Bbmaj9', 'Gm9', 'A7sus|A7', 'Dm9', 'Bbmaj9', 'Gm9', 'C69']
B = ['Bbmaj9', 'Cadd9', 'Am7', 'Dm9', 'Gm9', 'Cadd9', 'Fmaj7', 'A7sus|A7']
PROG = A + A + B + A[:7] + ['A7sus|A7']


def chords_in_bar(bar):
    c = PROG[bar]
    return [(0, c.split('|')[0], 2 if '|' in c else 4), (2, c.split('|')[1], 2)] if '|' in c else [(0, c, 4)]


# ------------------------------------------------------------------ melody (bar, beat, midi, beats, vel)
Am = [(0, 0, 69, 1, .8), (0, 1.5, 72, .5, .6), (0, 2, 74, 1.5, .85), (0, 3.5, 72, .5, .55),
      (1, 0, 69, 1.5, .75), (1, 1.5, 65, .5, .55), (1, 2, 67, 2, .7),
      (2, 0, 70, .5, .7), (2, .5, 69, .5, .6), (2, 1, 67, 1, .7), (2, 2, 65, .5, .6), (2, 2.5, 62, 1.5, .75),
      (3, 0, 64, 1, .7), (3, 1, 65, .5, .55), (3, 1.5, 64, .5, .5), (3, 2, 61, 1, .7), (3, 3, 57, 1, .6)]
Am2 = [(4, 0, 69, 1, .8), (4, 1.5, 72, .5, .6), (4, 2, 74, 1, .85), (4, 3, 77, 1, .8),
       (5, 0, 76, 1.5, .85), (5, 1.5, 74, .5, .6), (5, 2, 72, 1, .7), (5, 3, 69, 1, .65),
       (6, 0, 70, 1, .75), (6, 1, 69, .5, .6), (6, 1.5, 67, .5, .6), (6, 2, 65, 1, .7), (6, 3, 67, 1, .65),
       (7, 0, 64, 2, .7), (7, 2.5, 62, .5, .5), (7, 3, 64, 1, .6)]
Am3 = [(12, 0, 69, 1, .8), (12, 1.5, 72, .5, .6), (12, 2, 74, 1, .85), (12, 3, 77, 1, .85),
       (13, 0, 76, 1, .85), (13, 1, 77, .5, .7), (13, 1.5, 76, .5, .65), (13, 2, 74, 2, .8),
       (14, 0, 72, 1, .7), (14, 1, 70, 1, .65), (14, 2, 69, 1, .7), (14, 3, 67, 1, .6),
       (15, 0, 64, 1, .7), (15, 1, 67, 1, .65), (15, 2, 69, 2, .75)]
Bm = [(16, 0, 74, 1.5, .8), (16, 1.5, 77, .5, .65), (16, 2, 76, 1, .75), (16, 3, 74, 1, .7),
      (17, 0, 76, 2, .8), (17, 2, 79, 1, .8), (17, 3, 76, 1, .7),
      (18, 0, 72, 1.5, .75), (18, 1.5, 74, .5, .6), (18, 2, 76, 1, .75), (18, 3, 79, 1, .8),
      (19, 0, 81, 2.5, .9), (19, 2.5, 79, .5, .65), (19, 3, 77, 1, .7),
      (20, 0, 74, 1, .75), (20, 1, 77, 1, .75), (20, 2, 81, 1, .85), (20, 3, 79, 1, .75),
      (21, 0, 76, 1.5, .8), (21, 1.5, 74, .5, .6), (21, 2, 72, 1, .7), (21, 3, 76, 1, .7),
      (22, 0, 77, 1, .8), (22, 1, 76, .5, .65), (22, 1.5, 72, .5, .6), (22, 2, 69, 2, .75),
      (23, 0, 67, 1, .7), (23, 1, 69, .5, .6), (23, 1.5, 70, .5, .6), (23, 2, 73, 1, .75), (23, 3, 76, 1, .7)]
MELODY = Am + Am2 + [(b + 8, bt, m, d, v * 0.95) for (b, bt, m, d, v) in Am] + Am3 + Bm + [(b + 24, bt, m - 12, d, v * 0.8) for (b, bt, m, d, v) in Am]


def swing(beat_pos):
    frac = beat_pos % 1
    if abs(frac - 0.5) < 1e-6:
        return beat_pos - 0.5 + SWING
    return beat_pos


def at(bar, beat, jitter=0.006):
    return S.secs(bar * BAR + swing(beat) * BEAT + rng.uniform(-jitter, jitter))


def render_calm(ir_big, ir_small):
    dry = np.zeros((N, 2))
    wet = np.zeros((N, 2))  # reverb send
    drums = np.zeros((N, 2))

    # pad
    for bar in range(BARS):
        for beat, name, dur in chords_in_bar(bar):
            c = CH[name]
            p = S.pad([S.midi_hz(m) for m in c['pad']], dur * BEAT + 0.15, attack=0.7, release=1.4, cutoff=1100, vel=0.55)
            S.place(dry, p * 0.7, at(bar, beat, 0))
            S.place(wet, p * 0.6, at(bar, beat, 0))

    # e-piano comping (enters bar 1; sparse A, busier B)
    for bar in range(BARS):
        section_b = 16 <= bar < 24
        for beat, name, dur in chords_in_bar(bar):
            c = CH[name]
            hits = [(beat, dur * 0.9, 0.55)]
            if dur == 4 and (section_b or bar % 2 == 1):
                hits = [(beat, 1.4, 0.55), (beat + 2.5, 1.2, 0.4)]
            for hb, hd, hv in hits:
                for i, m in enumerate(c['ep']):
                    x = S.epiano(S.midi_hz(m), hd * BEAT, vel=hv * (0.85 + 0.15 * rng.random()))
                    S.place(dry, S.stereo(x, -0.25 + 0.12 * i) * 0.55, at(bar, hb + i * 0.012, 0.004))
                    S.place(wet, S.stereo(x, 0) * 0.35, at(bar, hb, 0))

    # bass
    for bar in range(BARS):
        for beat, name, dur in chords_in_bar(bar):
            r = CH[name]['root']
            pattern = [(0, 1.5, 0.9), (1.5, 0.5, 0.55), (2.5, 1.0, 0.7)] if dur == 4 else [(0, 1.5, 0.85), (1.5, 0.5, 0.5)]
            if bar < 4 or bar >= 28:
                pattern = [(0, dur - 0.1, 0.8)]
            for pb, pd, pv in pattern:
                base = r if r >= 36 else r + 12
                note = base + (12 if (pb == 1.5 and dur == 4) else 0)
                x = S.bass(S.midi_hz(note), pd * BEAT, vel=pv)
                S.place(dry, S.stereo(x), at(bar, beat + pb, 0.003))

    # koto melody
    for (bar, beat, m, d, v) in MELODY:
        x = S.koto(S.midi_hz(m), max(1.2, d * BEAT + 0.8), bright=0.5 + 0.2 * v, vel=v)
        S.place(dry, S.stereo(x, 0.12) * 0.9, at(bar, beat))
        S.place(wet, S.stereo(x, 0.1) * 0.55, at(bar, beat))

    # koto arpeggio accompaniment (answers between phrases)
    for bar in range(BARS):
        for beat, name, dur in chords_in_bar(bar):
            tones = CH[name]['tones']
            if dur == 4:
                pts = [(beat + 2.5, tones[2]), (beat + 3, tones[4]), (beat + 3.5, tones[3])] if bar % 2 == 0 else [(beat + 1.5, tones[1]), (beat + 3.5, tones[5])]
            else:
                pts = [(beat + 1.5, tones[3])]
            if bar >= 28:  # outro: fuller arpeggios
                pts = [(beat + k * 0.5, tones[(k * 2) % len(tones)]) for k in range(int(dur * 2))]
            for pb, m in pts:
                x = S.koto(S.midi_hz(m + 12 if bar >= 28 else m), 1.6, bright=0.4, vel=0.42)
                S.place(dry, S.stereo(x, -0.45) * 0.55, at(bar, pb))
                S.place(wet, S.stereo(x, -0.3) * 0.5, at(bar, pb))

    # drums: bars 4..27 full, 28..31 hats only, 0..3 shaker only
    for bar in range(BARS):
        full = 4 <= bar < 28
        for k in range(8):
            b = k * 0.5
            if full or bar >= 28:
                S.place(drums, S.stereo(S.hat(0.5 if k % 2 else 0.32), 0.3), at(bar, b, 0.004))
            if bar < 4 or full:
                if k % 2 == 1:
                    S.place(drums, S.stereo(S.shaker(0.45), -0.35), at(bar, b + 0.02, 0.004))
        if full:
            for kb in ([0, 1.75, 2.5] if bar % 4 == 3 else [0, 2.5]):
                S.place(drums, S.stereo(S.kick(0.8)), at(bar, kb, 0.002))
            for sb in (1, 3):
                S.place(drums, S.stereo(S.snare_soft(0.55), 0.05), at(bar, sb, 0.006))
            if bar % 8 == 7:
                S.place(drums, S.stereo(S.rim(0.5), 0.2), at(bar, 3.5))
                S.place(drums, S.stereo(S.rim(0.4), 0.2), at(bar, 3.75))

    # water plips on pentatonic notes, every other bar
    penta = [74, 77, 79, 81, 84, 86]
    for bar in range(0, BARS, 2):
        for j in range(2):
            m = penta[rng.integers(len(penta))]
            x = S.plip(S.midi_hz(m), 0.35)
            S.place(dry, S.stereo(x, rng.uniform(-0.8, 0.8)), at(bar, 1.5 + j * 2 + rng.uniform(0, 0.4)))
            S.place(wet, S.stereo(x, 0) * 0.8, at(bar, 1.5 + j * 2))

    return mixdown(dry, wet, drums, ir_big, ir_small)


def render_tense(ir_big, ir_small):
    dry = np.zeros((N, 2))
    wet = np.zeros((N, 2))
    drums = np.zeros((N, 2))
    # dark pad + drone
    for bar in range(BARS):
        for beat, name, dur in chords_in_bar(bar):
            c = CH[name]
            p = S.pad([S.midi_hz(m) for m in c['pad'][:4]], dur * BEAT + 0.1, attack=0.4, release=1.0, cutoff=700, vel=0.6)
            S.place(dry, p * 0.8, at(bar, beat, 0))
            S.place(wet, p * 0.5, at(bar, beat, 0))
    for bar in range(0, BARS, 4):
        x = S.pad([S.midi_hz(38), S.midi_hz(45)], 4 * BAR - 0.3, attack=1.5, release=1.5, cutoff=500, detune=5, vel=0.9)
        S.place(dry, x * 0.8, at(bar, 0, 0))

    # pulsing bass 8ths
    for bar in range(BARS):
        for beat, name, dur in chords_in_bar(bar):
            r = CH[name]['root']
            r = r if r >= 36 else r + 12
            for k in range(int(dur * 2)):
                x = S.bass(S.midi_hz(r), 0.42 * BEAT, vel=0.7 if k % 2 == 0 else 0.45)
                S.place(dry, S.stereo(x), at(bar, beat + k * 0.5, 0.002))

    # taiko: don on 1, pattern varies; ka accents; shime 16ths
    for bar in range(BARS):
        pat = [0, 2.5] if bar % 2 == 0 else [0, 1.5, 2, 3.5]
        if bar % 8 == 7:
            pat = [0, 1, 2, 2.5, 3, 3.25, 3.5, 3.75]
        for i, b in enumerate(pat):
            S.place(drums, S.stereo(S.taiko(0.95 if b == 0 else 0.6, 1.0 if b == 0 else 1.12), -0.1 + 0.2 * (i % 2)), at(bar, b, 0.003))
        for k in range(16):
            v = 0.75 if k % 4 == 2 else 0.35
            S.place(drums, S.stereo(S.shime(v), 0.35), at(bar, k * 0.25, 0.003))
        S.place(drums, S.stereo(S.rim(0.5), -0.3), at(bar, 3.0))

    # shakuhachi long tones (phrase every 4 bars)
    phrases = [(0, 74, 6), (6, 72, 2), (8, 77, 4), (12, 76, 2), (14, 73, 2), (16, 74, 6), (22, 72, 2), (24, 69, 6), (30, 73, 2)]
    for bar, m, bars_len in phrases:
        x = S.flute(S.midi_hz(m), bars_len * BAR - 0.4, vel=0.55)
        S.place(dry, S.stereo(x, 0.15) * 1.15, at(bar, 0.1, 0))
        S.place(wet, S.stereo(x, 0) * 1.1, at(bar, 0.1, 0))

    # koto tremolo on chord fifths
    for bar in range(1, BARS, 2):
        c = CH[chords_in_bar(bar)[0][1]]
        m = c['tones'][2] + 12
        for k in range(12):
            x = S.koto(S.midi_hz(m), 0.6, bright=0.35, vel=0.25 + 0.02 * k, bend=False)
            S.place(dry, S.stereo(x, -0.5) * 0.5, at(bar, 1 + k * 0.25, 0.002))
            S.place(wet, S.stereo(x, -0.3) * 0.4, at(bar, 1 + k * 0.25, 0.002))
    return mixdown(dry, wet, drums, ir_big, ir_small, drum_gain=0.62)


def wrap_conv(x, ir, wet):
    """Periodic (circular) reverb so the tail wraps across the loop point."""
    y = S.reverb(x, ir, wet)
    out = y[:N].copy()
    tail = y[N:]
    while len(tail):
        m = min(len(tail), N)
        out[:m] += tail[:m]
        tail = tail[m:]
    return out


def mixdown(dry, wet, drums, ir_big, ir_small, drum_gain=0.7):
    rev = wrap_conv(wet, ir_big, 1.0) - wet * (1 - 0.3)  # pure-ish wet signal
    drm = wrap_conv(drums, ir_small, 0.18)
    mix = dry + rev * 0.45 + drm * drum_gain
    mix = S.highpass(mix, 38, 2)
    mix = S.lowpass(mix, 14000, 1)
    mix = S.saturate(mix * 0.9, 1.1)
    return mix


def encode(name, data, meta_dir):
    import subprocess
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    wav = os.path.join(meta_dir, f'{name}.wav')
    from scipy.io import wavfile
    wavfile.write(wav, S.SR, (np.clip(data, -1, 1) * 32767).astype(np.int16))
    out_dir = os.path.join(ROOT, 'public', 'audio')
    subprocess.run([ff, '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libopus', '-b:a', '80k', os.path.join(out_dir, f'{name}.ogg')], check=True)
    subprocess.run([ff, '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '112k', os.path.join(out_dir, f'{name}.mp3')], check=True)


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if __name__ == '__main__':
    tmp = os.path.join(ROOT, 'tools', 'audio', 'out')
    os.makedirs(tmp, exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'public', 'audio'), exist_ok=True)
    ir_big = S.make_ir(2.8, 0.03, 5200, seed=11)
    ir_small = S.make_ir(0.9, 0.01, 7000, seed=12)
    calm = render_calm(ir_big, ir_small)
    tense = render_tense(ir_big, ir_small)
    # common master gain so the crossfade keeps level; limiter per stem
    g = 0.86 / max(np.max(np.abs(calm)), np.max(np.abs(tense)))
    calm, tense = calm * g, tense * g
    # loop-safe limiting: limit a 3x tiled copy and keep the middle period
    def loop_limit(x):
        tiled = np.concatenate([x, x, x])
        lim = S.limiter(tiled, 0.89)
        return lim[N:2 * N]
    calm = loop_limit(calm)
    tense = loop_limit(tense) * 0.92
    pad = S.secs(0.3)
    stems = {}
    for name, x in (('music_calm', calm), ('music_tense', tense)):
        padded = np.concatenate([x[-pad:], x, x[:pad]])
        stems[name] = padded
        encode(name, padded, tmp)
        print(name, 'rms dB', round(S.rms_db(x), 1), 'peak', round(float(np.max(np.abs(x))), 3))
    meta = {'stems': list(stems.keys()), 'loopStart': pad / S.SR, 'loopEnd': (pad + N) / S.SR, 'bpm': BPM, 'bars': BARS}
    with open(os.path.join(ROOT, 'public', 'audio', 'music.json'), 'w') as f:
        json.dump(meta, f)
    np.save(os.path.join(tmp, 'calm.npy'), calm.astype(np.float32))
    np.save(os.path.join(tmp, 'tense.npy'), tense.astype(np.float32))
    print(meta)
