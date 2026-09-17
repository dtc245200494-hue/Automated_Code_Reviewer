import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOpenCodeModel } from '../services/opencode-models.js';

test('OpenCode GPT models use Responses API', () => {
  const model = classifyOpenCodeModel('gpt-5.6-terra');
  assert.equal(model.protocol, 'openai-responses');
  assert.equal(model.baseURL, 'https://opencode.ai/inference/openai/v1');
  assert.equal(model.externalAvailable, true);
});

test('OpenCode Claude and Qwen models use Anthropic Messages', () => {
  assert.equal(classifyOpenCodeModel('claude-sonnet-4-6').protocol, 'anthropic-messages');
  assert.equal(classifyOpenCodeModel('qwen3.6-plus').protocol, 'anthropic-messages');
});

test('OpenCode Gemini models use Google generateContent endpoint', () => {
  const model = classifyOpenCodeModel('gemini-3.5-flash');
  assert.equal(model.protocol, 'gemini-generate-content');
  assert.equal(model.baseURL, 'https://opencode.ai/inference/google');
});

test('OpenCode compatible chat models use Chat Completions', () => {
  assert.equal(classifyOpenCodeModel('minimax-m2.7').protocol, 'openai-chat');
  assert.equal(classifyOpenCodeModel('kimi-k2.6').protocol, 'openai-chat');
  assert.equal(classifyOpenCodeModel('grok-build-0.1').protocol, 'openai-chat');
});

test('OpenCode free models not verified for external inference are blocked', () => {
  const restricted = classifyOpenCodeModel('nemotron-3-ultra-free');
  const allowed = classifyOpenCodeModel('nemotron-3-super-free');
  assert.equal(restricted.externalAvailable, false);
  assert.equal(allowed.externalAvailable, true);
});
