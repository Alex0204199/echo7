#!/usr/bin/env python3
"""Build game_standalone.html by inlining all JS modules and images."""
import base64, re, os, sys

def build():
    html = open('index.html', 'r', encoding='utf-8').read()

    # Inline JS modules: replace <script src="js/X.js"></script> with <script>contents</script>
    def inline_js(match):
        path = match.group(1)
        if os.path.exists(path):
            content = open(path, 'r', encoding='utf-8').read()
            return f'<script>\n{content}\n</script>'
        else:
            print(f'WARNING: {path} not found!')
            return match.group(0)

    html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_js, html)

    # Inline images as base64
    for fname in ['icons.png', 'menu.png', 'Map.png', 'inv.png']:
        if not os.path.exists(fname):
            continue
        with open(fname, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('ascii')
        uri = f'data:image/png;base64,{b64}'
        html = html.replace(f"url('{fname}')", f'url({uri})')
        html = html.replace(f".src = '{fname}'", f".src = '{uri}'")

    # Clean up empty/redundant script blocks
    html = re.sub(r'<script>\s*</script>', '', html)

    with open('game_standalone.html', 'w', encoding='utf-8') as f:
        f.write(html)

    size = os.path.getsize('game_standalone.html')
    print(f'Built: game_standalone.html ({size // 1024}KB)')

if __name__ == '__main__':
    build()
