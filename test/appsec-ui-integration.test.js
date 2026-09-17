import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../public/project-scan-ui.js', import.meta.url), 'utf8');

test('new AppSec adapter exposes visible scan progress', () => {
  assert.match(ui, /scanProgressDockVisible/);
  assert.match(ui, /startVisibleProgress/);
  assert.match(ui, /finishVisibleProgress/);
});

test('history is restored into the Activity Bar and primary sidebar', () => {
  assert.match(ui, /tabBtnHistory/);
  assert.match(ui, /viewHistory/);
  assert.match(ui, /renderHistorySidebar/);
  assert.match(ui, /historyActivityBadge/);
});

test('findings and security gate aggregate the whole project', () => {
  assert.match(ui, /collectProjectFindings/);
  assert.match(ui, /uploadedFiles\.forEach/);
  assert.match(ui, /renderProjectFindingsUI/);
  assert.match(ui, /Project còn \$\{countCrit\} Critical/);
});

test('scan diff fingerprints are isolated by file', () => {
  assert.match(ui, /historyFingerprintsByFile = new Map/);
  assert.match(ui, /historyFingerprintsByFile\.get\(key\)/);
  assert.match(ui, /historyFingerprintsByFile\.set\(key, current\)/);
});

test('coverage and engine labels are synchronized dynamically', () => {
  assert.match(ui, /syncCoverageUI/);
  assert.match(ui, /aiCoverageText/);
  assert.match(ui, /Groq Primary/);
  assert.match(ui, /Gemini Assistant/);
  assert.doesNotMatch(ui, /gemini-3\.5-flash-lite/);
});

test('non-JSON API responses are reported explicitly', () => {
  assert.match(ui, /API trả về dữ liệu không phải JSON/);
  assert.match(ui, /response\.text\(\)/);
});
