# Downloadable themes

EVA Unit-01 is an optional resource pack served independently from the ACECode
application. The application contains the theme ID, renderer, a small preview
thumbnail and three preview swatches. The full wallpaper and complete palette
are external. The card shows its bundled preview immediately, including offline;
only an explicit download confirmation retrieves the full archive.

The thumbnail covers the card at up to 30% opacity, or 60% when selected, with an alpha mask fading
from transparent on the left to the full existing opacity on the right so the
text sits over a quiet background. All cards keep a compact fixed
height of 120px, with square 26px color swatches and tighter internal spacing;
an uninstalled EVA card shows a large white download SVG on hover or keyboard
focus, and progress/cancellation stay inside the card as an overlay. Failed
user actions open a dialog showing the actual failing resource address.
Passive catalogue discovery stays quiet when the server cannot be reached.

EVA uses static purple ACECode logos in the home screen and sidebar. The
ordinary home logo shader is disabled and released while EVA is selected;
switching back restores the existing ordinary-theme animation policy.

On the EVA home screen, the composer, project selector and hint cards keep
95% of the surface colour and let 5% of the wallpaper show through. Text and
icons remain opaque; other themes and pages keep their existing surfaces.
One continuous wallpaper extends behind the home content and title bar, starting
at the left sidebar boundary. The home title bar's right-side controls are white.
Settings, feedback and other pages restore solid title-bar chrome and icons in
the theme colour.

Theme version 1.0.2 uses the built-in blue theme's neutral base (`#F5F5F2`),
white main surfaces and off-white sidebar (`#FBFBF9`) instead of large purple
fills. Body text is dark gray and timestamps are neutral gray. Purple remains
in branding and small action accents; user message bubbles stay pale lavender
(`#F0E7FA`) with subtle lavender borders (`#DFCEF2`). Project selection uses a
soft pale green. This palette-only update reuses the optimized 1.0.1 artwork.

## Package

Use the approved `acecode-eva-background-v2.png` artwork and the palette in
`assets/themes/eva-01/palette.json`. Version 1.0.1 uses perceptual 256-colour
PNG quantization with light dithering (0.4), preserving the original 1433x1098
wallpaper dimensions. The thumbnail is resized from the original to 320x245
before quantization. A 128-colour comparison introduced visible colour bands.
To reproduce the optimized images and package on Windows:

```powershell
python -m venv build/theme-image-env
./build/theme-image-env/Scripts/python.exe -m pip install Pillow==11.3.0 imagequant==1.1.5
./build/theme-image-env/Scripts/python.exe scripts/optimize_eva_theme_images.py --background '<path-to-approved-background.png>' --output-directory build/eva-theme-images
./scripts/package_eva_theme.ps1 -Background build/eva-theme-images/background.png -Thumbnail build/eva-theme-images/thumbnail.png -OutputDirectory build/eva-theme-package-1.0.2 -Version '1.0.2'
```

The output contains `catalog.json` and `eva-01/1.0.2/{theme.zip,thumbnail.png}`.
Supplying `-Thumbnail` preserves the optimized PNG bytes; omitting it retains
the packager's original thumbnail-generation behaviour.
The ZIP has exactly three root entries: `theme.json`, `background.png`, and
`thumbnail.png`. The palette is data, not executable CSS: 28 named hex color
tokens and fixed `mode:"light"`. Background and thumbnail metadata specify
their byte counts and SHA-256. The catalogue specifies the archive and preview
byte counts, SHA-256, versioned relative paths, and the three preview swatches.

Copy only the small thumbnail to `web/public/themes/eva-01-thumbnail.png` for
the bundled card preview. Keep `theme.zip`, the full background and `theme.json`
out of application packaging resources. The archive limit is 16 MiB and preview
limit is 256 KiB.
Use a new version if any approved artwork or palette changes after publication.

## Independent publication

The current aupdate root is `J:/jenkins_green/aupdate`, publicly served at
`http://2017studio.imwork.net:82/aupdate/`. Copy the versioned ZIP and thumbnail
under `themes/eva-01/1.0.2/`, verify the public downloads against their SHA-256
and byte counts, then publish `themes/catalog.json` last with an atomic rename.
Preserve unrelated catalogue entries if future catalogue versions add themes.
This operation does not update `aceupdate.json`, an application version, or a
Git release tag.

The daemon reads the current `upgrade.base_url` for each catalogue operation, so
changing the update server takes effect without restarting. Catalogue caches
are scoped to their source; a request to a different server cannot silently
reuse the previous server's metadata. An already started download retains its
confirmed resource URL and checksum. A private update mirror can host the
identical `themes/` directory. Local
installations and cached previews live beside the daemon configuration under
`themes/`; switching to another theme retains the downloaded resources.

The catalogue API reports the installed version and whether a newer semantic
version is available. The same card then offers an update with size confirmation
and progress. Successful updates reload the background even when EVA is already
active. Cancelled or failed updates retain the old installation, and an older
mirror catalogue does not offer a downgrade. Published version directories are
immutable and retained when a new catalogue is published.
The confirmation also lets users apply the downloaded version without updating,
so an unavailable update server does not prevent using installed resources.
