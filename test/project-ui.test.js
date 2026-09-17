import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../public/project-scan-ui.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('project UI adapter is injected', () => assert.ok(server.includes('project-scan-ui.js')));
test('folder scan uses project endpoint', () => assert.ok(ui.includes("fetch('/api/scan-project'")));
test('project queue is visible', () => assert.ok(ui.includes('Project Scan Queue')));
test('limited AI coverage is not treated as full clean', () => {
  assert.ok(ui.includes('limited_coverage'));
  assert.ok(ui.includes('KHÔNG CÓ FINDING TRONG PHẦN AI ĐÃ KIỂM TRA'));
  assert.ok(ui.includes('Scan coverage:'));
});
test('generated and minified paths are filtered', () => {
  assert.ok(ui.includes('node_modules|dist|build|vendor|coverage'));
  assert.ok(ui.includes('\\.min\\.'));
});
