import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextHomeLogoEffectEnabled } from './homeLogoEffectPolicy.js';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function source(relativePath) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf8').replace(/\r\n?/g, '\n');
}

function test(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

test('new conversation home is the only interactive logo entry point', () => {
  const chatView = source('components/ChatView.jsx');
  const emptyStateMarker = chatView.indexOf('// 空态:没选会话');
  const emptyStateStart = chatView.indexOf('if (!sid) {', emptyStateMarker);
  const existingSessionStart = chatView.indexOf(
    'const chatColumnStyle',
    emptyStateStart,
  );
  assert.ok(emptyStateStart >= 0 && existingSessionStart > emptyStateStart);

  const emptyState = chatView.slice(emptyStateStart, existingSessionStart);
  assert.match(
    chatView,
    /import InteractiveHomeLogo from '\.\/InteractiveHomeLogo\.jsx';/,
  );
  assert.equal(
    (chatView.match(/<InteractiveHomeLogo enabled=\{homeLogoEffectEnabled\}\s*\/>/g) || []).length,
    1,
  );
  assert.match(emptyState, /<InteractiveHomeLogo enabled=\{homeLogoEffectEnabled\}\s*\/>/);
  assert.doesNotMatch(emptyState, /<img[^>]+className="ace-home-logo/);
});

test('home logo effect permanently latches off after the first real session', () => {
  const app = source('App.jsx');
  const chatView = source('components/ChatView.jsx');
  const logo = source('components/InteractiveHomeLogo.jsx');
  const performance = source('lib/interactiveHomeLogoPerformance.js');

  assert.equal(nextHomeLogoEffectEnabled(true, ''), true);
  assert.equal(nextHomeLogoEffectEnabled(true, 'session-1'), false);
  assert.equal(nextHomeLogoEffectEnabled(false, ''), false);
  assert.equal(nextHomeLogoEffectEnabled(false, 'session-2'), false);

  assert.match(
    app,
    /const \[homeLogoEffectEnabled, setHomeLogoEffectEnabled\] = useState\(true\);/,
  );
  assert.match(app, /const homeLogoActiveSessionId = sessionJumpId\(activeRef \|\| \{\}\);/);
  assert.match(
    app,
    /setHomeLogoEffectEnabled\(\(current\) => \(\s*nextHomeLogoEffectEnabled\(current, homeLogoActiveSessionId\)\s*\)\);/,
  );
  assert.match(app, /homeLogoEffectEnabled=\{homeLogoEffectEnabled\}/);
  assert.match(chatView, /homeLogoEffectEnabled = true/);
  assert.match(chatView, /<InteractiveHomeLogo enabled=\{homeLogoEffectEnabled\}\s*\/>/);
  assert.match(logo, /function InteractiveHomeLogo\(\{ className = '', enabled = true \}\)/);
  assert.match(logo, /const animated = HOME_LOGO_SHADER_ENABLED && enabled && !isEvaTheme;/);
  assert.match(logo, /setReady\(false\);\s*if \(!animated\) return undefined;/);
  assert.match(logo, /data-dynamic-logo-ready=\{animated && ready \? 'true' : 'false'\}/);
  assert.match(logo, /data-dynamic-logo-fallback=\{!HOME_LOGO_SHADER_ENABLED \? 'disabled' : isEvaTheme \? 'theme' : enabled \? undefined : 'session-visited'\}/);
  assert.match(logo, /\{animated && \(\s*<canvas/);
  assert.doesNotMatch(logo, /fps|frameRate|framesPerSecond|lowFps/i);
  assert.doesNotMatch(performance, /fps|frameRate|framesPerSecond|lowFps/i);
});

test('interactive logo preserves the matte SDF tile and bounded shadow', () => {
  const logo = source('components/InteractiveHomeLogo.jsx');

  assert.match(logo, /const LOGO_SIZE = 100;/);
  assert.match(logo, /const CANVAS_SIZE = 156;/);
  assert.match(logo, /float sdLetterA\(vec2 point\)/);
  assert.match(logo, /float sdPrompt\(vec2 point\)/);
  assert.match(logo, /float darkShadowLength = mix\(0\.024, 0\.20, shadowDistanceFactor\);/);
  assert.match(logo, /float maximumLightDistance = 0\.80;/);
  assert.match(logo, /smoothstep\(0\.0, 0\.30, lightDistanceToTile\)/);
  assert.match(logo, /for \(int index = 1; index <= 12; index\+\+\)/);
  assert.doesNotMatch(logo, /paintedHighlight|[Ss]pecular|edgeLight|fresnel|tileHeight|glyphShadow|glyphNormal/);
});

test('light theme keeps a matte face and short vertical shadow', () => {
  const logo = source('components/InteractiveHomeLogo.jsx');
  const styles = source('styles/globals.css');

  assert.match(logo, /uniform float u_pointer_active;/);
  assert.match(logo, /float pointerActivity = step\(0\.5, u_pointer_active\);/);
  assert.match(logo, /float lightShadowLength = mix\(\s*0\.025,\s*0\.0375,/);
  assert.match(logo, /vec2\(0\.0, -1\.0\)/);
  assert.match(logo, /float shadowStrength = mix\(0\.44, 0\.18, lightTheme\);/);
  assert.match(logo, /pointerActive: gl\.getUniformLocation\(program, 'u_pointer_active'\)/);
  assert.match(
    logo,
    /gl\.uniform1f\(\s*uniforms\.pointerActive,\s*pointer\.active \|\| idleLight\.active \? 1 : 0,\s*\);/,
  );
  assert.match(
    styles,
    /:root:not\(\[data-theme="dark"\]\) \.ace-home-logo-fallback\s*\{\s*filter: drop-shadow\(0 2px 2px rgba\(31, 57, 85, 0\.16\)\);/,
  );
});

test('light theme compresses the baked color range toward the center blue', () => {
  const logo = source('components/InteractiveHomeLogo.jsx');

  assert.match(
    logo,
    /float balancedPaintedGradient = mix\(\s*paintedGradient,\s*0\.46,\s*lightTheme \* 0\.72\s*\);/,
  );
  assert.equal(
    (logo.match(/smoothstep\([^\n]+, balancedPaintedGradient\)/g) || []).length,
    3,
  );
  assert.match(
    logo,
    /tileColor \*= 1\.0 - lowerDepth \* mix\(0\.10, 0\.04, lightTheme\);/,
  );
});

test('light theme darkens only the blue tile by twenty percent', () => {
  const logo = source('components/InteractiveHomeLogo.jsx');
  const brightnessIndex = logo.indexOf('tileColor *= mix(1.0, 0.80, lightTheme);');
  const glyphCompositionIndex = logo.indexOf(
    'tileColor = mix(tileColor, glyphColor, glyphMask);',
  );

  assert.ok(brightnessIndex >= 0);
  assert.ok(glyphCompositionIndex > brightnessIndex);
  assert.equal((logo.match(/tileColor \*= mix\(1\.0, 0\.80, lightTheme\);/g) || []).length, 1);
  assert.doesNotMatch(logo, /glyphColor \*= mix\(1\.0, 0\.80, lightTheme\);/);
});

test('light pointer shadow stays opposite the fill and halves every light-theme length', () => {
  const logo = source('components/InteractiveHomeLogo.jsx');
  const styles = source('styles/globals.css');

  assert.match(
    logo,
    /vec2 lightPointerShadowDirection = requestedLightDistance > 0\.001\s*\? normalize\(-rawLightPlanar\)\s*:\s*vec2\(0\.0, -1\.0\);/,
  );
  assert.match(
    logo,
    /vec2 lightShadowDirection = normalize\(mix\(\s*vec2\(0\.0, -1\.0\),\s*lightPointerShadowDirection,\s*pointerActivity\s*\)\);/,
  );
  assert.match(logo, /float lightShadowLength = mix\(\s*0\.025,\s*0\.0375,/);
  assert.doesNotMatch(logo, /float lightShadowLength = mix\(\s*0\.050,\s*0\.075,/);
  assert.match(styles, /drop-shadow\(0 2px 2px rgba\(31, 57, 85, 0\.16\)\)/);
  assert.doesNotMatch(styles, /drop-shadow\(0 4px 4px rgba\(31, 57, 85, 0\.16\)\)/);
});

test('dark theme retains the brand palette and directional shadow on the matte tile', () => {
  const logo = source('components/InteractiveHomeLogo.jsx');

  assert.match(logo, /float darkShadowLength = mix\(0\.024, 0\.20, shadowDistanceFactor\);/);
  assert.match(logo, /vec2 darkShadowDirection = normalize\(-rawLightPlanar \+ vec2\(0\.0001\)\);/);
  assert.match(logo, /vec3 brandCyan = vec3\(0\.220, 0\.835, 0\.969\);/);
  assert.match(logo, /vec3 brandSky = vec3\(0\.086, 0\.529, 0\.855\);/);
  assert.match(logo, /vec3 brandBlue = vec3\(0\.145, 0\.388, 0\.922\);/);
  assert.match(logo, /vec3 brandDeep = vec3\(0\.031, 0\.165, 0\.322\);/);
  assert.match(logo, /lowerDepth \* mix\(0\.10, 0\.04, lightTheme\)/);
  assert.match(logo, /tileColor \*= mix\(1\.0, 0\.80, lightTheme\);/);
  assert.match(logo, /float shadowStrength = mix\(0\.44, 0\.18, lightTheme\);/);
});

test('interactive logo uses premultiplied transparent WebGL2 output and bounds direct-input frames', () => {
  const logo = source('components/InteractiveHomeLogo.jsx');
  const drawStart = logo.indexOf('const draw = (frameTimestamp) => {');
  const scheduleStart = logo.indexOf('const scheduleFrame = () => {', drawStart);
  assert.ok(drawStart >= 0 && scheduleStart > drawStart);
  const drawBody = logo.slice(drawStart, scheduleStart);

  assert.match(logo, /canvas\.getContext\('webgl2', \{/);
  assert.match(logo, /alpha: true,/);
  assert.match(logo, /premultipliedAlpha: true,/);
  assert.doesNotMatch(logo, /premultipliedAlpha: false,/);
  assert.match(logo, /premultiplied = min\(premultiplied, vec3\(alpha\)\);/);
  assert.match(logo, /outColor = vec4\(premultiplied, alpha\);/);
  assert.doesNotMatch(logo, /premultiplied \/ max\(alpha,/);
  assert.match(logo, /const MAX_DPR = 1\.5;/);
  assert.match(logo, /window\.addEventListener\('pointermove', handlePointerMove, \{ passive: true \}\);/);
  assert.match(logo, /pointer\.clientX - rect\.left/);
  assert.match(logo, /rect\.bottom - pointer\.clientY/);
  assert.match(logo, /animationFrame === 0/);
  assert.match(
    drawBody,
    /if \(idleLight\.active\) \{\s*scheduleFrame\(\);\s*\}/,
  );
  assert.doesNotMatch(logo, /setInterval\(/);
});

test('idle light waits two seconds, eases between in-logo targets, and never moves the real pointer', () => {
  const logo = source('components/InteractiveHomeLogo.jsx');
  const performance = source('lib/interactiveHomeLogoPerformance.js');
  const pointerHandlerStart = logo.indexOf('const handlePointerMove = (event) => {');
  const visibilityHandlerStart = logo.indexOf(
    'const handleVisibilityChange = () => {',
    pointerHandlerStart,
  );
  assert.ok(pointerHandlerStart >= 0 && visibilityHandlerStart > pointerHandlerStart);
  const pointerHandler = logo.slice(pointerHandlerStart, visibilityHandlerStart);

  assert.match(logo, /const IDLE_LIGHT_DELAY_MS = 2000;/);
  assert.match(logo, /const IDLE_LIGHT_MOVE_DURATION_MS = 1600;/);
  assert.match(performance, /export const IDLE_LOGO_LIGHT_RADIUS_PX = 42;/);
  assert.match(logo, /window\.setTimeout\(startIdleMotion, IDLE_LIGHT_DELAY_MS\)/);
  assert.match(
    logo,
    /createRandomLogoLightOffset\(\s*Math\.random,\s*IDLE_LOGO_LIGHT_RADIUS_PX,/,
  );
  assert.match(logo, /interpolateLogoLightOffset\(/);
  assert.match(logo, /advanceIdleLight\(frameTimestamp\);/);
  assert.match(pointerHandler, /stopIdleMotion\(\{ cancelFrame: idleWasActive \}\);/);
  assert.match(pointerHandler, /pointer\.clientX = sample\.clientX;/);
  assert.match(pointerHandler, /pointer\.clientY = sample\.clientY;/);
  assert.match(pointerHandler, /scheduleIdleMotion\(\);/);
  assert.doesNotMatch(logo, /dispatchEvent\(|new PointerEvent\(|style\.cursor|setPointerCapture\(/);
});

test('interactive logo clamps every light source to 80px from center', () => {
  const logo = source('components/InteractiveHomeLogo.jsx');
  const performance = source('lib/interactiveHomeLogoPerformance.js');

  assert.match(performance, /export const MAX_LIGHT_DISTANCE_PX = 80;/);
  assert.match(logo, /const requestedLightX = idleLight\.active/);
  assert.match(logo, /const requestedLightY = idleLight\.active/);
  assert.match(
    logo,
    /clampLightToRadius\(\s*requestedLightX,\s*requestedLightY,\s*centerX,\s*centerY,\s*MAX_LIGHT_DISTANCE_PX,/,
  );
  assert.match(
    logo,
    /gl\.uniform2f\(uniforms\.mouse, light\.x \* pixelRatio, light\.y \* pixelRatio\);/,
  );
});

test('reduced motion disables idle wandering but keeps direct pointer lighting and lifecycle cleanup', () => {
  const logo = source('components/InteractiveHomeLogo.jsx');

  assert.match(logo, /const REDUCED_MOTION_QUERY = '\(prefers-reduced-motion: reduce\)';/);
  assert.match(logo, /window\.matchMedia\?\.\(REDUCED_MOTION_QUERY\)/);
  assert.match(logo, /reducedMotionQuery\?\.matches === true/);
  assert.match(logo, /\|\| reducedMotion/);
  assert.match(logo, /const handleReducedMotionChange = \(event\) => \{/);
  assert.match(logo, /reducedMotion = event\.matches;/);
  assert.match(logo, /reducedMotionQuery\?\.addEventListener\?\.\('change', handleReducedMotionChange\)/);
  assert.match(logo, /reducedMotionQuery\?\.removeEventListener\?\.\('change', handleReducedMotionChange\)/);
  assert.match(logo, /<BrandLogo/);
  assert.match(source('components/BrandLogo.jsx'), /'\/acecode-logo\.png'/);
  assert.match(
    logo,
    /data-dynamic-logo-ready=\{animated && ready \? 'true' : 'false'\}/,
  );
  assert.match(logo, /new MutationObserver\(scheduleFrame\)/);
  assert.match(logo, /attributeFilter: \['data-theme'\]/);
  assert.match(logo, /webglcontextlost/);
  assert.match(logo, /webglcontextrestored/);
  assert.match(logo, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/);
  assert.match(logo, /window\.removeEventListener\('pointermove', handlePointerMove\)/);
  assert.match(logo, /window\.clearTimeout\(idleTimer\)/);
  assert.match(logo, /themeObserver\.disconnect\(\)/);
  assert.match(logo, /gl\.deleteBuffer\(buffer\)/);
  assert.match(logo, /gl\.deleteProgram\(program\)/);
  assert.match(logo, /gl\.deleteShader\(fragmentShader\)/);
  assert.match(logo, /gl\.deleteShader\(vertexShader\)/);
});

test('idle wandering keeps its frame loop local and stops on hidden or lost context', () => {
  const logo = source('components/InteractiveHomeLogo.jsx');

  assert.match(logo, /idleLight\.active = true;[\s\S]*?chooseNextIdleTarget\(\);\s*scheduleFrame\(\);/);
  assert.match(
    logo,
    /if \(document\.hidden\) \{\s*stopIdleMotion\(\{ cancelFrame: true \}\);/,
  );
  assert.match(
    logo,
    /contextLost = true;\s*stopIdleMotion\(\{ cancelFrame: true \}\);/,
  );
  assert.match(logo, /disposed = true;\s*stopIdleMotion\(\{ cancelFrame: true \}\);/);
});

test('default logo layout reserves 100px while the transparent shadow canvas overflows safely', () => {
  const styles = source('styles/globals.css');
  const start = styles.indexOf('.ace-home-logo {');
  const end = styles.indexOf('.ace-home-title {', start);
  assert.ok(start >= 0 && end > start);
  const logoStyles = styles.slice(start, end);

  assert.match(logoStyles, /\.ace-home-logo\s*\{[\s\S]*width: 100px;[\s\S]*height: 100px;/);
  assert.match(logoStyles, /\.ace-home-logo-canvas\s*\{[\s\S]*width: 156px;[\s\S]*height: 156px;/);
  assert.match(logoStyles, /pointer-events: none;/);
  assert.match(
    logoStyles,
    /\.ace-home-logo\[data-dynamic-logo-ready="true"\] \.ace-home-logo-fallback\s*\{[\s\S]*visibility: hidden;/,
  );
});

test('default dark logo backdrop retains a local fading blue grid', () => {
  const styles = source('styles/globals.css');
  const start = styles.indexOf('.ace-home-logo {');
  const end = styles.indexOf('.ace-home-title {', start);
  assert.ok(start >= 0 && end > start);
  const logoStyles = styles.slice(start, end);

  assert.equal((logoStyles.match(/\[data-theme="dark"\] \.ace-home-logo::before/g) || []).length, 1);
  assert.match(
    logoStyles,
    /\[data-theme="dark"\] \.ace-home-logo::before\s*\{[\s\S]*content: "";[\s\S]*position: absolute;[\s\S]*z-index: 0;/,
  );
  assert.match(logoStyles, /width: 240px;[\s\S]*height: 220px;/);
  assert.match(
    logoStyles,
    /linear-gradient\(rgba\(var\(--ace-logo-color-rgb, 61, 144, 197\), 0\.04\) 1px, transparent 1px\)/,
  );
  assert.match(
    logoStyles,
    /linear-gradient\(90deg, rgba\(var\(--ace-logo-color-rgb, 61, 144, 197\), 0\.04\) 1px, transparent 1px\)/,
  );
  assert.match(logoStyles, /radial-gradient\(\s*ellipse 50% 50% at center,[\s\S]*rgba\(var\(--ace-logo-color-rgb, 5, 74, 124\), 0\.48\) 0%/);
  assert.match(logoStyles, /background-size: 5px 5px, 5px 5px, 100% 100%;/);
  assert.match(logoStyles, /-webkit-mask-image: radial-gradient\(/);
  assert.match(logoStyles, /mask-image: radial-gradient\(/);
  assert.match(logoStyles, /pointer-events: none;/);
  assert.match(
    logoStyles,
    /\.ace-home-logo-fallback,\s*\.ace-home-logo-canvas\s*\{[\s\S]*z-index: 1;/,
  );
  assert.doesNotMatch(logoStyles, /:root:not\(\[data-theme="dark"\]\) \.ace-home-logo::before/);
  assert.doesNotMatch(logoStyles, /animation:/);
});

test('dark grid fades fully before every rectangular edge and stays subdued', () => {
  const styles = source('styles/globals.css');
  const start = styles.indexOf('[data-theme="dark"] .ace-home-logo::before {');
  const end = styles.indexOf('.ace-home-logo-fallback,', start);
  assert.ok(start >= 0 && end > start);
  const backdropStyles = styles.slice(start, end);

  assert.equal(
    (backdropStyles.match(/rgba\(var\(--ace-logo-color-rgb, 61, 144, 197\), 0\.04\)/g) || []).length,
    2,
  );
  assert.doesNotMatch(backdropStyles, /rgba\(61, 144, 197, 0\.10\)/);
  assert.equal(
    (backdropStyles.match(/ellipse 50% 50% at center/g) || []).length,
    3,
  );
  assert.equal((backdropStyles.match(/transparent 100%/g) || []).length, 3);
  assert.match(backdropStyles, /-webkit-mask-repeat: no-repeat;/);
  assert.match(backdropStyles, /-webkit-mask-size: 100% 100%;/);
  assert.match(backdropStyles, /mask-repeat: no-repeat;/);
  assert.match(backdropStyles, /mask-size: 100% 100%;/);
  assert.doesNotMatch(backdropStyles, /transparent 88%|transparent 86%/);
});
