// Per-station colour scripts. All colours are sRGB hex; converted to linear in world.js.
export const PALETTES = {
  dusk: {
    deep: 0x0d2a3f, shallow: 0x2f6f7f, sky: 0xf2a37a, skyTop: 0x5a4a7a, foam: 0xfbe6d0,
    fog: 0x5c5a78, bank: 0x16202a, bankTop: 0x2c3b2e, sun: 0xffc59a, sunDir: [-0.4, 0.55, -1],
    ambient: 0x6a6f9a, ground: 0x1b2230, lantern: 0xffb45c, glow: 0.9, stars: 0.2, petals: 0xf6c1cf,
  },
  bamboo: {
    deep: 0x0b2b27, shallow: 0x2c6e5a, sky: 0xc9e2a8, skyTop: 0x395a45, foam: 0xeaf5dc,
    fog: 0x3f5f4c, bank: 0x0f1d16, bankTop: 0x28452b, sun: 0xf3f0c0, sunDir: [0.5, 0.7, -1],
    ambient: 0x6f8f76, ground: 0x152018, lantern: 0xffcf7a, glow: 0.6, stars: 0, petals: 0xc8e6a0,
  },
  village: {
    deep: 0x10283b, shallow: 0x3a7890, sky: 0xffcf9a, skyTop: 0x7a86b0, foam: 0xfff1de,
    fog: 0x7b7a90, bank: 0x1d1c22, bankTop: 0x3b3a2c, sun: 0xffd2a0, sunDir: [-0.6, 0.45, -1],
    ambient: 0x7c7f9e, ground: 0x1e2028, lantern: 0xffb45c, glow: 0.8, stars: 0.05, petals: 0xf8d0da,
  },
  festival: {
    deep: 0x0a1630, shallow: 0x283f78, sky: 0xff8a5a, skyTop: 0x241a4a, foam: 0xffe2c8,
    fog: 0x3a2b52, bank: 0x120d1c, bankTop: 0x2a1f30, sun: 0xff9f6a, sunDir: [0.3, 0.35, -1],
    ambient: 0x5a4f8a, ground: 0x151020, lantern: 0xff9a3c, glow: 1.25, stars: 0.5, petals: 0xffb0c0,
  },
  night: {
    deep: 0x040c1e, shallow: 0x17325e, sky: 0x6f8cc8, skyTop: 0x060a1c, foam: 0xcfe0ff,
    fog: 0x0e1834, bank: 0x05070d, bankTop: 0x0d1420, sun: 0xb8ccff, sunDir: [0.2, 0.8, -1],
    ambient: 0x3a4a7a, ground: 0x070a12, lantern: 0xffb45c, glow: 1.4, stars: 1, petals: 0xd8e4ff,
  },
  mist: {
    deep: 0x283a44, shallow: 0x62808a, sky: 0xdfe6e8, skyTop: 0x9fb0b8, foam: 0xf4f8f8,
    fog: 0xaebcc2, bank: 0x2a3136, bankTop: 0x46534e, sun: 0xf0f4f4, sunDir: [0, 1, -0.6],
    ambient: 0x9aa8b0, ground: 0x2c3438, lantern: 0xffc98a, glow: 0.7, stars: 0, petals: 0xffffff,
  },
  falls: {
    deep: 0x07222c, shallow: 0x2d7d86, sky: 0xbfe4ff, skyTop: 0x2f5070, foam: 0xf2fbff,
    fog: 0x4c6f82, bank: 0x0e1418, bankTop: 0x223428, sun: 0xdff2ff, sunDir: [-0.2, 0.9, -1],
    ambient: 0x6c8ca0, ground: 0x10181c, lantern: 0xffc070, glow: 0.8, stars: 0.1, petals: 0xe0f4ff,
  },
  dawn: {
    deep: 0x13304a, shallow: 0x4c8aa2, sky: 0xffd9a0, skyTop: 0xe89aa0, foam: 0xfff6e6,
    fog: 0xf0b8a0, bank: 0x2a2226, bankTop: 0x4a3a34, sun: 0xffe2b0, sunDir: [0, 0.25, -1],
    ambient: 0xb49aa8, ground: 0x2a2228, lantern: 0xffc070, glow: 0.9, stars: 0, petals: 0xffe0ea,
  },
};
