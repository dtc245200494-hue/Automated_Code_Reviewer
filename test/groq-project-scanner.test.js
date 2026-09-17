import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ScannerService,
  SINGLE_REQUEST_MAX_LINES,
  CHUNK_SIZE,
  findSuspectRegions,
  selectLargeFileChunks,
  countCoveredLines,
  isFatalAiError
} from '../services/groq-scanner.js';
import {
  filterProjectFiles,
  buildDependencyGraph,
  buildProjectScanPlan,
  ProjectScannerService
} from '../services/project-scanner.js';

test('groq scanner defaults use 400/450 line strategy', () => {
  assert.equal(SINGLE_REQUEST_MAX_LINES, 400);
  assert.equal(CHUNK_SIZE, 450);
});

test('heuristic risk scoring prioritizes command injection over weak crypto', () => {
  const regions = findSuspectRegions('const a = md5(x);\nexec("ping " + req.query.host);');
  assert.equal(regions[0].type, 'command-injection');
  assert.ok(regions[0].risk > regions[1].risk);
});

test('large file with no suspects samples beginning, middle and end instead of only first chunk', () => {
  const lines = Array.from({ length: 6000 }, (_, i) => `const x${i} = ${i};`);
  const chunks = selectLargeFileChunks(lines, []);
  assert.ok(chunks.length >= 3);
  assert.equal(chunks[0].startLineNumber, 1);
  assert.ok(chunks.some(c => c.startLineNumber > 2000 && c.endLineNumber < 5000));
  assert.equal(chunks.at(-1).endLineNumber, 6000);
  assert.ok(countCoveredLines(chunks, 6000) > 450);
});

test('targeted large scan remains capped and includes sampling coverage', () => {
  const lines = Array.from({ length: 10000 }, (_, i) => `line ${i + 1}`);
  const suspects = Array.from({ length: 100 }, (_, i) => ({ line: 50 + i * 90, risk: 100 - (i % 40), type: 'test' }));
  const chunks = selectLargeFileChunks(lines, suspects);
  assert.ok(chunks.length <= 10);
  assert.ok(chunks.some(c => c.kind === 'targeted'));
  assert.ok(chunks.some(c => c.kind === 'sample'));
});

test('404 is fatal configuration error', () => {
  assert.equal(isFatalAiError(Object.assign(new Error('model not found'), { status: 404 })), true);
});

test('validateAiResult repairs findings/issues schema', () => {
  const service = new ScannerService();
  const repaired = service.validateAiResult({ findings: [{ type: 'XSS', line_number: 9 }], suggestions: ['escape output'] });
  assert.equal(repaired.vulnerabilities.length, 1);
  assert.equal(repaired.vulnerabilities[0].start_line, 9);
  assert.deepEqual(repaired.recommendations, ['escape output']);
});

test('project filter accepts js/html and skips generated/minified directories', () => {
  const { accepted, skipped } = filterProjectFiles([
    { path: 'index.html', content: '<script src="app.js"></script>' },
    { path: 'app.js', content: 'console.log(1)' },
    { path: 'dist/app.min.js', content: 'x=1' },
    { path: 'logo.png', content: '' }
  ]);
  assert.deepEqual(accepted.map(f => f.path), ['index.html', 'app.js']);
  assert.equal(skipped.length, 2);
});

test('dependency graph connects HTML script src and JS imports', () => {
  const { accepted } = filterProjectFiles([
    { path: 'index.html', content: '<script src="./js/app.js"></script>' },
    { path: 'js/app.js', content: "import { login } from './auth.js';" },
    { path: 'js/auth.js', content: 'export const login = () => true;' }
  ]);
  const graph = buildDependencyGraph(accepted);
  assert.deepEqual(graph['index.html'], ['js/app.js']);
  assert.deepEqual(graph['js/app.js'], ['js/auth.js']);
});

test('project scan plan batches small related files under 400 lines', () => {
  const { accepted } = filterProjectFiles([
    { path: 'a.js', content: "import './b.js';\n" + 'a\n'.repeat(50) },
    { path: 'b.js', content: 'b\n'.repeat(60) },
    { path: 'big.js', content: 'x\n'.repeat(600) }
  ]);
  const graph = buildDependencyGraph(accepted);
  const plan = buildProjectScanPlan(accepted, graph);
  assert.ok(plan.some(item => item.kind === 'batch' && item.files.length >= 2));
  assert.ok(plan.some(item => item.files[0].path === 'big.js'));
});

test('project scanner maps batched findings back to original file lines', async () => {
  const fakeScan = async code => {
    const lines = code.split('\n');
    const marker = lines.findIndex(line => line.includes('FILE: b.js'));
    return {
      is_safe: false,
      incomplete: false,
      vulnerabilities: [{ type: 'DOM XSS', start_line: marker + 3, end_line: marker + 3 }],
      recommendations: [],
      overall_summary: 'finding',
      chunk_count: 1
    };
  };
  const svc = new ProjectScannerService({ scanFile: fakeScan });
  const result = await svc.scanProject([
    { path: 'a.js', content: "import './b.js';\nconst a = 1;", language: 'javascript' },
    { path: 'b.js', content: 'const x = 1;\npanel.innerHTML = userInput;', language: 'javascript' }
  ]);
  const b = result.file_results.find(item => item.path === 'b.js').result;
  assert.equal(b.vulnerabilities.length, 1);
  assert.equal(b.vulnerabilities[0].start_line, 2);
});
