import sys, numpy as np
from PIL import Image, ImageDraw
from scipy import signal
import synth as S
import music as M
name = sys.argv[1] if len(sys.argv) > 1 else 'calm'
x = np.load(f'out/{name}.npy').astype(np.float64)
mono = x.mean(1)
# spectrogram (log freq) image
f, t, Z = signal.stft(mono, S.SR, nperseg=4096, noverlap=4096-1024)
mag = 20*np.log10(np.abs(Z)+1e-9)
H, W = 300, 1200
fl = np.geomspace(40, 16000, H)
cols = np.linspace(0, mag.shape[1]-1, W).astype(int)
img = np.zeros((H, W))
for i, ff in enumerate(fl):
    k = np.searchsorted(f, ff)
    img[H-1-i] = mag[min(k, len(f)-1), cols]
img = np.clip((img + 90) / 70, 0, 1)
rgb = (np.stack([img**0.8, img**1.6, img**3*0.8+img*0.2], -1) * 255).astype(np.uint8)
im = Image.fromarray(rgb); d = ImageDraw.Draw(im)
for b in range(0, M.BARS+1, 4):
    xpix = int(b * M.BAR / M.P * W); d.line([(xpix,0),(xpix,H)], fill=(80,80,80)); d.text((xpix+2, 2), str(b+1), fill=(255,255,255))
im.save(f'out/spec_{name}.png')
# chroma per bar vs expected chord tones
names = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
print('bar chord  top-chroma  (in-chord ratio)')
for bar in range(M.BARS):
    a = S.secs(bar*M.BAR); b = S.secs((bar+1)*M.BAR)
    seg = mono[a:b]
    sp = np.abs(np.fft.rfft(seg*np.hanning(len(seg))))
    fr = np.fft.rfftfreq(len(seg), 1/S.SR)
    chroma = np.zeros(12)
    mask = (fr > 60) & (fr < 2000)
    midi = 69 + 12*np.log2(fr[mask]/440)
    np.add.at(chroma, np.round(midi).astype(int) % 12, sp[mask]**2)
    chroma /= chroma.sum()
    chord = M.PROG[bar]
    tones = set()
    for c in chord.split('|'):
        for m in M.CH[c]['pad'] + M.CH[c]['tones'] + [M.CH[c]['root']]: tones.add(m % 12)
    inr = sum(chroma[i] for i in tones)
    top = np.argsort(chroma)[::-1][:4]
    print(f"{bar+1:3d} {chord:10s} {' '.join(names[i] for i in top):16s} {inr:.2f}")
# loop seam: RMS of the jump across the boundary vs typical sample-to-sample delta
jump = np.abs(x[0] - x[-1]).max(); typ = np.percentile(np.abs(np.diff(x, axis=0)), 99)
print('seam jump', round(float(jump),4), 'typical 99p delta', round(float(typ),4))
# clipping & crest
print('peak', np.abs(x).max().round(3), 'samples>0.99', int((np.abs(x)>0.99).sum()))
