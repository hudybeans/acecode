import importlib.util
import json
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'assets/seed/skills/acecode/ai-theme/scripts/render_preview.py'
spec = importlib.util.spec_from_file_location('theme_preview', SCRIPT)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


class ConfigParser(HTMLParser):
    def __init__(self, document, identifier):
        super().__init__()
        self.identifier, self.active, self.payload = identifier, False, ''
        self.feed(document)

    def handle_starttag(self, tag, attrs):
        self.active = tag == 'script' and dict(attrs).get('id') == self.identifier

    def handle_data(self, data):
        if self.active:
            self.payload += data

    def handle_endtag(self, tag):
        self.active = False


class ThemePreviewTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.source = self.root / 'session.svg'
        self.source.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">'
                               '<path fill="#FFF9EF" d="M0 0H1600V1000H0Z"/></svg>', encoding='utf-8')
        self.plan = self.root / 'plan.json'
        self.appearance = {'logo_color': '#556677', 'home_title_color': '#123456',
                           'extend_to_titlebar': True, 'session_background_opacity': 0.7,
                           'user_message_background_color': '#FFD078'}
        self.plan.write_text(json.dumps({'scope': 'deep', 'mode': 'dark', 'appearance': self.appearance,
                                         'assets': {'session': self.source.name}}), encoding='utf-8')
        self.output = self.root / 'preview.html'

    def config(self, identifier):
        return json.loads(ConfigParser(self.output.read_text(encoding='utf-8'), identifier).payload)

    def test_default_export_embeds_source_without_viewport_dimensions_or_opacity(self):
        renderer.build(self.plan, self.output, 'session')
        config = self.config('theme-artboard-config')
        self.assertIsNone(config['width'])
        self.assertIsNone(config['height'])
        self.assertTrue(config['src'].startswith('data:image/svg+xml;base64,'))
        self.assertNotIn('appearance', config)
        self.assertEqual(len(config), 3)

    def test_explicit_size_and_preview_keep_existing_appearance(self):
        renderer.build(self.plan, self.output, 'session', 1920, 1080)
        config = self.config('theme-artboard-config')
        self.assertEqual((config['width'], config['height']), (1920, 1080))
        renderer.build(self.plan, self.output)
        self.assertEqual(self.config('theme-preview-config')['appearance'], self.appearance)

    def test_invalid_or_unpaired_dimensions_do_not_write(self):
        for width, height in [(1600, None), (None, 1000), (0, 100), (-1, 100),
                              (8193, 100), (8192, 8192), (True, 100), (12.5, 100)]:
            with self.subTest(width=width, height=height), self.assertRaises(ValueError):
                renderer.build(self.plan, self.output, 'session', width, height)
            self.assertFalse(self.output.exists())
        with self.assertRaises(ValueError):
            renderer.build(self.plan, self.output, width=1600, height=1000)

    def test_sources_are_preserved_and_missing_assets_fail(self):
        before = self.source.read_bytes()
        with self.assertRaises(ValueError):
            renderer.build(self.plan, self.source, 'session')
        with self.assertRaises(ValueError):
            renderer.build(self.plan, self.output, 'home')
        self.assertEqual(before, self.source.read_bytes())


if __name__ == '__main__':
    unittest.main()
