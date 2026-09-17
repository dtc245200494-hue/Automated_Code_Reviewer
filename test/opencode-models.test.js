import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOpenCodeModel } from '../services/opencode-models.js';

test('OpenCode GPT models use Zen Responses API', () => {
  const model = classifyOpenCodeModel('gpt-5.6-terra');
  assert.equal(model.protocol, 'openai-responses');
  assert.equal(model.baseURL, 'https://opencode.ai/zen/v1');
  assert.equal(model.externalAvailable, true);
});

test('OpenCode Claude and Qwen models use Zen Anthropic Messages', () => {
  const claude = classifyOpenCodeModel('claude-sonnet-4-6');
  const qwen = classifyOpenCodeModel('qwen3.6-plus');
  assert.equal(claude.protocol, 'anthropic-messages');
  assert.equal(qwen.protocol, 'anthropic-messages');
  assert.equal(claude.baseURL, 'https://opencode.ai/zen/v1');
});

test('OpenCode Gemini models use Zen model generateContent endpoint', () => {
  const model = classifyOpenCodeModel('gemini-3.5-flash');
  assert.equal(model.protocol, 'gemini-generate-content');
  assert.equal(model.baseURL, 'https://opencode.ai/zen/v1/models/{model}:generateContent');
});

test('OpenCode compatible chat models use Zen Chat Completions', () => {
  const minimax = classifyOpenCodeModel('minimax-m2.7');
  const kimi = classifyOpenCodeModel('kimi-k2.6');
  const deepseek = classifyOpenCodeModel('deepseek-v4-flash-vision-exp');
  assert.equal(minimax.protocol, 'openai-chat');
  assert.equal(kimi.protocol, 'openai-chat');
  assert.equal(deepseek.protocol, 'openai-chat');
  assert.equal(deepseek.baseURL, 'https://opencode.ai/zen/v1');
});

test('OpenCode Grok models use Responses API, including grok-build', () => {
  assert.equal(classifyOpenCodeModel('grok-4.5').protocol, 'openai-responses');
  assert.equal(classifyOpenCodeModel('grok-build-0.1').protocol, 'openai-responses');
});

test('OpenCode Zen free models are available through the Zen API', () => {
  assert.equal(classifyOpenCodeModel('nemotron-3-ultra-free').externalAvailable, true);
  assert.equal(classifyOpenCodeModel('deepseek-v4-flash-free').externalAvailable, true);
  assert.equal(classifyOpenCodeModel('mimo-v2.5-free').externalAvailable, true);
});
