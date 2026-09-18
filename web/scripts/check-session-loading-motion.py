"""Check the built sidebar indicator with Playwright, including older Chromium.

Run pnpm build first. Requires Python's playwright package and a Chromium install.
Optional: --browser PATH adds a legacy Chromium executable to the default browser.
"""

import argparse
import json
import math
import subprocess
from html.parser import HTMLParser
from pathlib import Path

from playwright.sync_api import sync_playwright


WEB = Path(__file__).resolve().parents[1]


class Styles(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.active = False
        self.parts = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        if tag == 'style':
            self.active = True

    def handle_endtag(self, tag):
        if tag == 'style':
            self.active = False

    def handle_data(self, data):
        if self.active:
            self.parts.append(data)


def production_markup():
    # Render the actual component; the fixture does not duplicate its markup.
    script = r'''
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';
import clsx from 'clsx';
const source = fs.readFileSync('src/components/Sidebar.jsx', 'utf8');
const start = source.indexOf('function SessionAttentionIndicator');
const end = source.indexOf('function SessionHoverCard', start);
if (start < 0 || end < start) throw new Error('Missing production indicator');
const { code } = await transformWithEsbuild(source.slice(start, end), 'Indicator.jsx', {
  loader: 'jsx', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
});
const Component = vm.runInNewContext(`${code}; SessionAttentionIndicator`, { React, clsx });
process.stdout.write(renderToStaticMarkup(React.createElement(Component, {
  attention: 'in_progress', meta: { label: 'Running' },
})));
'''
    return subprocess.run(
        ['node', '--input-type=module'], input=script, cwd=WEB,
        text=True, encoding='utf-8', capture_output=True, check=True,
    ).stdout


SNAPSHOT = '''() => {
  const host = document.querySelector('.ace-session-loading');
  const orbit = host.querySelector('.ace-session-loading-orbit');
  const dots = [...host.querySelectorAll('.ace-session-loading-dot')];
  const center = node => { const r = node.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; };
  return { centers:dots.map(center), hostCenter:center(host),
    diameter:dots.map(node => parseFloat(getComputedStyle(node).width)),
    slot:[host.offsetWidth, host.offsetHeight], opacity:parseFloat(getComputedStyle(orbit).opacity),
    transforms:[orbit, ...dots].map(node => getComputedStyle(node).transform),
    label:host.getAttribute('aria-label') };
}'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', action='append', default=[])
    parser.add_argument('--build-html', type=Path, default=WEB / 'dist/index.html')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--screenshot-dir', type=Path)
    args = parser.parse_args()
    css = '\n'.join(Styles(args.build_html.read_text(encoding='utf-8')).parts)
    assert css, 'Build HTML must contain the production CSS'
    markup = production_markup()
    results = []
    with sync_playwright() as playwright:
        for executable in [None, *args.browser]:
            options = {'headless': True}
            if executable:
                options['executable_path'] = executable
            browser = playwright.chromium.launch(**options)
            page = browser.new_page()

            def mount(theme='light', motion='no-preference', width=390):
                page.set_viewport_size({'width': width, 'height': 240})
                page.emulate_media(reduced_motion=motion)
                page.set_content(f'<!doctype html><html data-theme="{theme}"><head>'
                                 f'<style>{css}</style></head><body>{markup}</body></html>')

            for theme in ['light', 'dark']:
                for width in [390, 1280]:
                    for motion in ['no-preference', 'reduce']:
                        mount(theme, motion, width)
                        frames = page.evaluate('''snapshot => {
                          const read = new Function('return (' + snapshot + ')')();
                          const animations = document.querySelector('.ace-session-loading').getAnimations({subtree:true});
                          animations.forEach(a => a.pause());
                          const frames = [];
                          for (let time=0; time<=6480; time+=40) {
                            animations.forEach(a => a.currentTime=time);
                            frames.push(read());
                          }
                          return frames;
                        }''', SNAPSHOT)
                        for frame in frames:
                            assert frame['slot'] == [16, 16], frame
                            assert len(frame['centers']) == 4 and frame['label'] == 'Running'
                            assert all(abs(d - 4.3) < 0.01 for d in frame['diameter'])
                            assert all(math.dist(frame['centers'][a], frame['centers'][b]) > 4.3
                                       for a in range(4) for b in range(a + 1, 4))
                            centroid = [sum(c[axis] for c in frame['centers']) / 4 for axis in [0, 1]]
                            assert math.dist(centroid, frame['hostCenter']) < 0.02
                        if motion == 'reduce':
                            assert all(frame['transforms'] == frames[0]['transforms'] for frame in frames)
                            opacity = [frame['opacity'] for frame in frames]
                            assert min(opacity) >= 0.599 and max(opacity) <= 1
                            assert max(opacity) - min(opacity) > 0.39, 'Reduced motion must retain gentle running feedback'
                        else:
                            assert all(math.dist(a['centers'][0], b['centers'][0]) > 0.02
                                       for a, b in zip(frames, frames[1:])), 'Running motion must not stall'
                        results.append({'browser': browser.version, 'theme': theme, 'width': width, 'motion': motion, 'passed': True})

            # Live preference changes must work without manually controlling animations.
            mount()
            for motion in ['no-preference', 'reduce', 'no-preference']:
                page.emulate_media(reduced_motion=motion)
                first = page.evaluate(SNAPSHOT)
                page.wait_for_timeout(350)
                last = page.evaluate(SNAPSHOT)
                if motion == 'reduce':
                    assert first['transforms'] == last['transforms']
                    assert abs(first['opacity'] - last['opacity']) > 0.01
                else:
                    assert first['transforms'] != last['transforms']

            # Defined resting positions keep all four dots separate before animation starts.
            mount()
            page.add_style_tag(content='.ace-session-loading * { animation: none !important; }')
            resting = page.evaluate(SNAPSHOT)
            assert all(math.dist(c, resting['hostCenter']) > 3.4 for c in resting['centers'])
            assert len({tuple(c) for c in resting['centers']}) == 4
            if args.screenshot_dir:
                args.screenshot_dir.mkdir(parents=True, exist_ok=True)
                page.locator('.ace-session-loading').screenshot(
                    path=str(args.screenshot_dir / f'indicator-{browser.version}.png'))
            browser.close()
    output = json.dumps(results, indent=2)
    if args.output:
        args.output.write_text(output + '\n', encoding='utf-8')
    print(output)


if __name__ == '__main__':
    main()
