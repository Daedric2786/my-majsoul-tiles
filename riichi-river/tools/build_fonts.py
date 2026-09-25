"""Subset the OFL fonts to the glyphs the game actually uses.

Sources (Google Fonts repo, OFL 1.1) are downloaded to tools/fonts_src/ by:
  curl -L -o tools/fonts_src/<file> https://raw.githubusercontent.com/google/fonts/main/ofl/...
Usage: python3 tools/build_fonts.py
"""
import glob
import os
import re
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'fonts_src')
OUT = os.path.join(ROOT, 'public', 'fonts')
os.makedirs(OUT, exist_ok=True)

text = ''
for f in glob.glob(os.path.join(ROOT, 'src', '**', '*.js'), recursive=True):
    text += open(f, encoding='utf-8').read()
text += open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()

ascii_chars = ''.join(chr(c) for c in range(0x20, 0x7F)) + '×·—–…’“”←→↑↓★☆•'
kana = ''.join(chr(c) for c in range(0x3040, 0x30FF + 1)) + '、。「」『』・ー！？（）：〜'
cjk = ''.join(sorted(set(ch for ch in text if '一' <= ch <= '鿿' or '㐀' <= ch <= '䶿')))
hangul = ''.join(sorted(set(ch for ch in text if '가' <= ch <= '힣')))
print('cjk', len(cjk), 'hangul', len(hangul))


def build(src, out, chars):
    font = TTFont(os.path.join(SRC, src))
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'palt', 'vert']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(text=chars)
    s.subset(font)
    path = os.path.join(OUT, out)
    font.flavor = 'woff2'
    font.save(path)
    print(out, os.path.getsize(path) // 1024, 'KB')


build('ShipporiMincho-ExtraBold.ttf', 'rr-mincho.woff2', ascii_chars + kana + cjk)
build('ZenMaruGothic-Black.ttf', 'rr-round-black.woff2', ascii_chars + kana + cjk)
build('ZenMaruGothic-Bold.ttf', 'rr-round-bold.woff2', ascii_chars + kana + cjk)
build('GowunDodum-Regular.ttf', 'rr-hangul.woff2', ascii_chars + hangul)
