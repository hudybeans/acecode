## 1. Sidebar indicator

- [x] 1.1 Reduce dot diameter to 2.75px and remove the contracted hold, then verify the existing sidebar test and browser measurements of dimensions and continuous motion.

## 2. Integration verification

- [x] 2.1 Run full web tests and build, browser checks for light/dark and desktop/390px Chinese/English layouts, and reduced-motion checks; record the results.
- [x] 2.2 Validate the OpenSpec change strictly, check the diff, and verify unrelated dirty files retain their original hashes.

## Validation results

The results below describe the initial 2.75px version. The user's final size refinement is tracked separately below.

- `node src/lib/permissionSidebarArchitecture.test.js`, `pnpm test`, and `pnpm build`: passed; full test output includes 2531 pass records.
- Chromium fixture using the production indicator component and complete built CSS: passed all 8 combinations of 1280px/390px, light/dark, and Chinese/English.
- At 25ms sampling intervals over 6.5 seconds, the baseline radial hold measured 775ms; the updated animation had no held samples. Diameter measured 2.75px and minimum dot-center distance measured 3.323px, so dots remain separate.
- The 16px slot, row height, and title position were unchanged. Hover and title updates preserved the live animations. Reduced motion showed four static dots and zero running CSS animations.
- Strict OpenSpec validation and `git diff --check`: passed. All six pre-existing dirty files retained their starting SHA256 hashes.
- Design detector reported only existing findings outside the changed CSS lines. Desktop packaging and an installed-app check were not performed.

## 3. Size refinement

- [x] 3.1 Set the dot diameter to 4.3px, center it, and retain separation during continuous motion; verify built CSS in the browser and run web tests/build plus strict validation.

Refinement verification: `pnpm test`, `pnpm build`, strict OpenSpec validation, and the same 8 Chromium fixture combinations passed. CSS declares 4.3px (Chromium rounds its computed layout size to 4.29688px); minimum dot separation is 4.95px, with no held radial samples and preserved hover/reduced-motion behavior. The 3.5px contracted radius prevents the larger dots from overlapping.

## 4. Older WebView2 compatibility

- [x] 4.1 Define legacy-compatible orbit geometry and a gentle reduced-motion pulse, verified by a browser regression script against production markup and built CSS in Chromium 109 and current Chromium.
- [x] 4.2 Run full web tests/build, strict OpenSpec validation, and diff checks; preserve unrelated home-logo edits and record the limits of affected-machine verification.

Compatibility verification: the browser regression script fails against the pre-change build at the expected missing reduced-motion feedback assertion, and passes the updated build in Chromium 109.0.5412.0 and 145.0.7632.6. All 16 combinations of engine, light/dark, 390px/1280px, and normal/reduced motion passed, as did live preference switching and defined resting positions with animation disabled. Run `python web/scripts/check-session-loading-motion.py --browser <legacy-chromium-executable>` after the web build to repeat the checks.

`pnpm test`, `pnpm build`, strict OpenSpec validation, and `git diff --check` passed. The home-logo test retained its starting SHA256, and all CSS outside the loading-indicator block matched the starting snapshot. The design detector found no issues in the changed region. The affected machine's exact WebView2 version, Windows motion setting, and host behavior have not been verified; no desktop package was rebuilt.
