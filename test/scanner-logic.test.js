import test from 'node:test';
import assert from 'node:assert/strict';
import { ScannerService } from '../services/scanner.js';
import { GitHubService } from '../services/github.js';

function scanner() {
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENAI_API_KEY;
  return new ScannerService();
}

test('1. parameterized SQL with ? is not reported as SQLi', () => {
  const result = scanner().mockAnalysis(
    'const row = db.get("SELECT * FROM users WHERE id = ?", [userId]);',
    'javascript'
  );
  assert.equal(result.vulnerabilities.some(v => v.type.includes('SQL Injection')), false);
});

test('2. interpolated SQL is reported as SQLi', () => {
  const result = scanner().mockAnalysis(
    'const query = `SELECT * FROM users WHERE id = ${userId}`;',
    'javascript'
  );
  assert.equal(result.vulnerabilities.some(v => v.type.includes('SQL Injection')), true);
});

test('3. static innerHTML is not reported as DOM XSS', () => {
  const result = scanner().mockAnalysis(
    'target.innerHTML = "<strong>Welcome</strong>";',
    'javascript'
  );
  assert.equal(result.vulnerabilities.some(v => v.type.includes('XSS')), false);
});

test('4. dynamic unsanitized innerHTML is reported as DOM XSS', () => {
  const result = scanner().mockAnalysis(
    'target.innerHTML = userInput;',
    'javascript'
  );
  assert.equal(result.vulnerabilities.some(v => v.type.includes('XSS')), true);
});

test('5. placeholder/example secrets are ignored', () => {
  const result = scanner().mockAnalysis(
    'const API_KEY = "example-api-key-placeholder";',
    'javascript'
  );
  assert.equal(result.vulnerabilities.some(v => v.type.includes('Hardcoded Secrets')), false);
});

test('6. realistic hardcoded secret is reported', () => {
  const result = scanner().mockAnalysis(
    'const API_KEY = "sk_live_51ABCDEF1234567890";',
    'javascript'
  );
  assert.equal(result.vulnerabilities.some(v => v.type.includes('Hardcoded Secrets')), true);
});

test('7. normalized path join is not reported as traversal', () => {
  const result = scanner().mockAnalysis(
    'const safe = path.resolve(BASE_DIR, path.basename(filename));\nfs.readFile(safe, cb);',
    'javascript'
  );
  assert.equal(result.vulnerabilities.some(v => v.type.includes('Path Traversal')), false);
});

test('8. raw user-controlled path join is reported as traversal', () => {
  const result = scanner().mockAnalysis(
    'const target = path.join(BASE_DIR, req.query.filename);\nfs.readFile(target, cb);',
    'javascript'
  );
  assert.equal(result.vulnerabilities.some(v => v.type.includes('Path Traversal')), true);
});

test('9. multiple API keys are parsed before client selection', () => {
  const service = scanner();
  assert.deepEqual(
    service.parseApiKeys('key_one_12345,key_two_67890\nkey_three_abcde'),
    ['key_one_12345', 'key_two_67890', 'key_three_abcde']
  );
});

test('10. short AI failure is fail-closed and marked incomplete', async () => {
  const service = scanner();
  service.createClient = () => ({ fake: true });
  service.requestAi = async () => {
    throw new Error('rate limit');
  };

  const result = await service.scanCode('const x = 1;', 'javascript', {
    apiKey: 'key_one_12345',
    provider: 'openai'
  });

  assert.equal(result.is_safe, false);
  assert.equal(result.incomplete, true);
  assert.equal(result.scan_status, 'incomplete');
});

test('11. overlapping chunks deduplicate the same finding', async () => {
  const service = scanner();
  service.createClient = () => ({ fake: true });
  service.requestAi = async (_client, _model, prompt) => {
    const hasLine230 = prompt.includes('[L230]');
    return {
      is_safe: !hasLine230,
      overall_summary: '',
      vulnerabilities: hasLine230 ? [{
        type: 'SQL Injection',
        severity: 'Cao',
        owasp_category: 'A03:2021-Injection',
        line_number: 230,
        affected_lines: 'dangerousQuery(userInput)',
        explanation: 'test',
        attack_scenario: 'test',
        remediation: 'test',
        fixed_code: 'test'
      }] : [],
      recommendations: []
    };
  };

  const code = Array.from({ length: 460 }, (_, i) => `line ${i + 1}`).join('\n');
  const result = await service.scanCode(code, 'javascript', {
    apiKey: 'key_one_12345',
    provider: 'openai'
  });

  assert.equal(result.incomplete, false);
  assert.equal(result.vulnerabilities.length, 1);
  assert.equal(result.vulnerabilities[0].line_number, 230);
});

test('12. slash-containing GitHub branch tail is preserved for resolution', () => {
  const service = new GitHubService();
  const parsed = service.parseGitUrl(
    'https://github.com/acme/project/tree/feature/login/fix/src',
    ''
  );
  assert.equal(parsed.owner, 'acme');
  assert.equal(parsed.repo, 'project');
  assert.equal(parsed.treeTail, 'feature/login/fix/src');
});

test('13. OPENAI_API_KEY with sk- prefix defaults to OpenAI when AI_PROVIDER is not set', () => {
  const origKey = process.env.OPENAI_API_KEY;
  const origProv = process.env.AI_PROVIDER;
  const origEndpoint = process.env.OPENAI_API_ENDPOINT;
  try {
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_ENDPOINT;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-proj-test1234567890abcdef';
    const svc = new ScannerService();
    assert.equal(svc.provider, 'OpenAI');
    assert.equal(svc.isOpenCode, false);
    assert.equal(svc.isOpenAI, true);
  } finally {
    if (origKey) process.env.OPENAI_API_KEY = origKey; else delete process.env.OPENAI_API_KEY;
    if (origProv) process.env.AI_PROVIDER = origProv; else delete process.env.AI_PROVIDER;
    if (origEndpoint) process.env.OPENAI_API_ENDPOINT = origEndpoint; else delete process.env.OPENAI_API_ENDPOINT;
  }
});

test('14. AI_PROVIDER=opencode explicitly sets OpenCode provider', () => {
  const origKey = process.env.OPENAI_API_KEY;
  const origProv = process.env.AI_PROVIDER;
  try {
    process.env.AI_PROVIDER = 'opencode';
    process.env.OPENAI_API_KEY = 'sk-anykey12345';
    const svc = new ScannerService();
    assert.equal(svc.provider, 'OpenCode.ai');
    assert.equal(svc.isOpenCode, true);
    assert.equal(svc.model, 'deepseek-v4-flash-free');
  } finally {
    if (origKey) process.env.OPENAI_API_KEY = origKey; else delete process.env.OPENAI_API_KEY;
    if (origProv) process.env.AI_PROVIDER = origProv; else delete process.env.AI_PROVIDER;
  }
});

test('15. OPENAI_API_ENDPOINT pointing to opencode.ai sets OpenCode provider', () => {
  const origKey = process.env.OPENAI_API_KEY;
  const origProv = process.env.AI_PROVIDER;
  const origEndpoint = process.env.OPENAI_API_ENDPOINT;
  try {
    delete process.env.AI_PROVIDER;
    process.env.OPENAI_API_ENDPOINT = 'https://opencode.ai/zen/v1';
    process.env.OPENAI_API_KEY = 'sk-test12345';
    const svc = new ScannerService();
    assert.equal(svc.provider, 'OpenCode.ai');
    assert.equal(svc.isOpenCode, true);
  } finally {
    if (origKey) process.env.OPENAI_API_KEY = origKey; else delete process.env.OPENAI_API_KEY;
    if (origProv) process.env.AI_PROVIDER = origProv; else delete process.env.AI_PROVIDER;
    if (origEndpoint) process.env.OPENAI_API_ENDPOINT = origEndpoint; else delete process.env.OPENAI_API_ENDPOINT;
  }
});

