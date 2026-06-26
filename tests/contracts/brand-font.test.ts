/**
 * Contract / QA guard (Agent 9) — brand wordmark font.
 *
 * The "wayfold" logo wordmark must stay wired through the design-system token
 * (`--font-brand` + the `font-brand` utility), NOT through a fragile
 * index.html <link> + inline `style={{ fontFamily }}` (that approach silently
 * failed to render and is the regression this test exists to prevent).
 *
 * Pure source check — no app runtime needed.
 * Run: npm test   (or: node_modules/.bin/tsx tests/contracts/brand-font.test.ts)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

let passed = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    console.error('  ✗', name, '\n      ', (e as Error).message);
    process.exitCode = 1;
  }
};

console.log('Brand font contract (design-system token, not inline/link)');

// 1) The token + font load live in the design system (the proven mechanism).
const tokens = read('design-system/tokens.css');
check('tokens.css loads IBM Plex Sans via the Google Fonts @import', () =>
  assert.match(tokens, /@import url\([^)]*IBM\+Plex\+Sans[^)]*\)/, 'IBM Plex Sans missing from the @import'));
check('tokens.css defines the --font-brand theme token', () =>
  assert.match(tokens, /--font-brand:\s*["']?IBM Plex Sans["']?/, '--font-brand token missing or not IBM Plex Sans'));

// 2) Every wordmark consumes the token via the utility, with no inline fallback.
for (const f of ['app-shell/TopHeader.tsx', 'app-shell/ShareModal.tsx']) {
  const src = read(f);
  const span = src.match(/<span[^>]*>WAYFOLD<\/span>/);
  check(`${f}: wordmark span present`, () => assert.ok(span, 'WAYFOLD wordmark span not found'));
  if (span) {
    check(`${f}: wordmark uses the font-brand utility`, () =>
      assert.match(span[0], /\bfont-brand\b/, 'wordmark is missing the font-brand class'));
    check(`${f}: wordmark has NO inline fontFamily (the regression guard)`, () =>
      assert.doesNotMatch(span[0], /fontFamily/, 'wordmark regressed to an inline fontFamily style'));
  }
}

// 3) The exception is documented so the "Inter only" rule isn't violated silently.
check('design-rules.md documents the font-brand exception', () =>
  assert.match(read('output/design-rules.md'), /font-brand/, 'design-rules.md does not mention font-brand'));

console.log(process.exitCode ? '\nFAILED' : `\nOK — ${passed} checks passed`);
