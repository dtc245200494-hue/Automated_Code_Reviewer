import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiAssistant, GEMINI_ASSISTANT_DEFAULT_MODEL } from '../services/gemini-assistant.js';

test('Gemini assistant defaults to the low-cost Flash-Lite model', () => {
  assert.equal(GEMINI_ASSISTANT_DEFAULT_MODEL, 'gemini-2.5-flash-lite');
});

test('Gemini assistant stays off when no API key is configured', async () => {
  let calls = 0;
  const assistant = new GeminiAssistant(async () => {
    calls++;
    return {};
  }, { apiKey: '', mode: 'verify_and_fallback' });

  const primary = {
    is_safe: true,
    incomplete: false,
    vulnerabilities: [],
    overall_summary: 'Groq complete'
  };
  const result = await assistant.enhance(primary, 'const ok = true;', 'javascript');

  assert.equal(result, primary);
  assert.equal(calls, 0);
});

test('Gemini Flash-Lite recovers an incomplete Groq scan as fallback', async () => {
  let receivedConfig = null;
  const assistant = new GeminiAssistant(async (_code, _language, config) => {
    receivedConfig = config;
    return {
      is_safe: false,
      incomplete: false,
      scan_status: 'complete',
      overall_summary: 'Gemini completed fallback',
      vulnerabilities: [{ type: 'SQL Injection', severity: 'Cao', cwe: 'CWE-89' }],
      recommendations: []
    };
  }, {
    apiKey: 'AIzaSy-test-only',
    mode: 'verify_and_fallback'
  });

  const result = await assistant.enhance({
    is_safe: false,
    incomplete: true,
    scan_status: 'incomplete',
    overall_summary: 'Groq rate limited',
    vulnerabilities: []
  }, 'query = "SELECT * FROM users WHERE id=" + id;', 'javascript');

  assert.equal(receivedConfig.provider, 'gemini');
  assert.equal(receivedConfig.model, 'gemini-2.5-flash-lite');
  assert.equal(result.gemini_assistant_used, true);
  assert.equal(result.assistant_action, 'fallback');
  assert.equal(result.fallback_recovered, true);
  assert.equal(result.primary_engine, 'groq');
  assert.equal(result.vulnerabilities.length, 1);
});

test('Gemini verifies only priority Groq findings and does not replace the Groq verdict', async () => {
  let calls = 0;
  const assistant = new GeminiAssistant(async () => {
    calls++;
    return {
      is_safe: false,
      incomplete: false,
      scan_status: 'complete',
      vulnerabilities: [{ type: 'Command Injection', severity: 'Cao', cwe: 'CWE-78' }],
      recommendations: []
    };
  }, {
    apiKey: 'AIzaSy-test-only',
    mode: 'verify',
    maxVerifications: 2,
    contextLines: 5,
    maxExcerptLines: 40
  });

  const code = Array.from({ length: 80 }, (_, index) =>
    index === 39 ? 'exec(req.query.cmd);' : `const line${index + 1} = true;`
  ).join('\n');
  const primary = {
    is_safe: false,
    incomplete: false,
    scan_status: 'complete',
    vulnerabilities: [
      { type: 'Command Injection', severity: 'Cao', confidence: 'Cao', cwe: 'CWE-78', start_line: 40, end_line: 40 },
      { type: 'Minor issue', severity: 'Thấp', confidence: 'Cao', cwe: 'CWE-Other', start_line: 70, end_line: 70 }
    ]
  };

  const result = await assistant.enhance(primary, code, 'javascript');

  assert.equal(calls, 1);
  assert.equal(result.is_safe, false);
  assert.equal(result.vulnerabilities.length, 2);
  assert.equal(result.vulnerabilities[0].verification.status, 'confirmed');
  assert.equal(result.vulnerabilities[1].verification, undefined);
  assert.equal(result.assistant_checked_findings, 1);
  assert.equal(result.assistant_confirmed_findings, 1);
});

test('clean Groq result does not spend a Gemini request', async () => {
  let calls = 0;
  const assistant = new GeminiAssistant(async () => {
    calls++;
    return {};
  }, { apiKey: 'AIzaSy-test-only', mode: 'verify_and_fallback' });

  const result = await assistant.enhance({
    is_safe: true,
    incomplete: false,
    scan_status: 'complete',
    vulnerabilities: []
  }, 'const safe = true;', 'javascript');

  assert.equal(calls, 0);
  assert.equal(result.gemini_assistant_used, undefined);
});
