import sys, numpy as np, synth as S
for name in sys.argv[1:]:
    x = np.load(f'out/{name}.npy').astype(np.float64).mean(1)
    sp = np.abs(np.fft.rfft(x))**2; fr = np.fft.rfftfreq(len(x), 1/S.SR)
    edges = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    tot = sp.sum()
    row = []
    for a, b in zip(edges[:-1], edges[1:]):
        e = sp[(fr >= a) & (fr < b)].sum()
        row.append(f"{a}-{b}:{10*np.log10(e/tot):6.1f}")
    print(name, ' '.join(row))
