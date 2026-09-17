import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UniversalAIClient,
  normalizeUniversalEndpoint,
  parseExtraHeaders
} from '../services/universal-ai.js';

function fakeFetch(payload, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      text: async () => JSON.stringify(payload)
    };
  };
  return { fetchImpl, calls };
}

test('universal endpoint requires HTTPS remotely but allows localhost HTTP', () => {
  assert.equal(normalizeUniversalEndpoint('http://localhost:11434'), 'http://localhost:11434');
  assert.throws(() => normalizeUniversalEndpoint('http://example.com/v1'), /HTTPS/);
});

test('extra headers must be an object and unsafe transport headers are dropped', () => {
  assert.deepEqual(parseExtraHeaders('{"X-Test":"1","Host":"evil"}'), { 'X-Test': '1' });
  assert.throws(() => parseExtraHeaders('[1,2]'), /JSON object/);
});

test('OpenAI Chat adapter appends chat/completions and uses bearer auth', async () => {
  const mock = fakeFetch({ choices: [{ message: { content: '{"vulnerabilities":[]}' } }] });
  const client = new UniversalAIClient('sk-test', {
    protocol: 'openai-chat', endpoint: 'https://api.example.com/v1', authType: 'bearer'
  }, mock.fetchImpl);

  const result = await client.chat.completions.create({
    model: 'model-a', messages: [{ role: 'user', content: 'hello' }], response_format: { type: 'json_object' }
  });

  assert.equal(mock.calls[0].url, 'https://api.example.com/v1/chat/completions');
  assert.equal(mock.calls[0].init.headers.Authorization, 'Bearer sk-test');
  assert.equal(mock.calls[0].body.model, 'model-a');
  assert.equal(result.choices[0].message.content, '{"vulnerabilities":[]}');
});

test('OpenAI Responses adapter normalizes output_text', async () => {
  const mock = fakeFetch({ output_text: '{"vulnerabilities":[]}' });
  const client = new UniversalAIClient('key', {
    protocol: 'openai-responses', endpoint: 'https://provider.example/v1', authType: 'bearer'
  }, mock.fetchImpl);

  const result = await client.chat.completions.create({ model: 'reasoning-model', messages: [{ role: 'user', content: 'scan' }] });
  assert.equal(mock.calls[0].url, 'https://provider.example/v1/responses');
  assert.deepEqual(mock.calls[0].body.input, [{ role: 'user', content: 'scan' }]);
  assert.equal(result.choices[0].message.content, '{"vulnerabilities":[]}');
});

test('Anthropic adapter uses messages endpoint and x-api-key', async () => {
  const mock = fakeFetch({ content: [{ type: 'text', text: '{"vulnerabilities":[]}' }] });
  const client = new UniversalAIClient('anthropic-key', {
    protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com', authType: 'auto'
  }, mock.fetchImpl);

  const result = await client.chat.completions.create({ model: 'claude-model', messages: [{ role: 'user', content: 'scan' }] });
  assert.equal(mock.calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(mock.calls[0].init.headers['x-api-key'], 'anthropic-key');
  assert.equal(mock.calls[0].init.headers['anthropic-version'], '2023-06-01');
  assert.equal(result.choices[0].message.content, '{"vulnerabilities":[]}');
});

test('Gemini adapter builds model URL and uses x-goog-api-key', async () => {
  const mock = fakeFetch({ candidates: [{ content: { parts: [{ text: '{"vulnerabilities":[]}' }] } }] });
  const client = new UniversalAIClient('gem-key', {
    protocol: 'gemini-generate-content', endpoint: 'https://generativelanguage.googleapis.com', authType: 'auto'
  }, mock.fetchImpl);

  const result = await client.chat.completions.create({ model: 'gemini-test', messages: [{ role: 'user', content: 'scan' }] });
  assert.equal(mock.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
  assert.equal(mock.calls[0].init.headers['x-goog-api-key'], 'gem-key');
  assert.equal(result.choices[0].message.content, '{"vulnerabilities":[]}');
});

test('Ollama adapter supports no-auth localhost', async () => {
  const mock = fakeFetch({ message: { content: '{"vulnerabilities":[]}' } });
  const client = new UniversalAIClient('__no_auth__', {
    protocol: 'ollama-chat', endpoint: 'http://localhost:11434', authType: 'none'
  }, mock.fetchImpl);

  await client.chat.completions.create({ model: 'qwen', messages: [{ role: 'user', content: 'scan' }], response_format: { type: 'json_object' } });
  assert.equal(mock.calls[0].url, 'http://localhost:11434/api/chat');
  assert.equal(mock.calls[0].init.headers.Authorization, undefined);
  assert.equal(mock.calls[0].body.format, 'json');
});

test('Generic JSON adapter supports custom header, template placeholders and response path', async () => {
  const mock = fakeFetch({ result: { answer: '{"vulnerabilities":[]}' } });
  const client = new UniversalAIClient('secret', {
    protocol: 'generic-json',
    endpoint: 'https://vendor.example/generate',
    authType: 'custom-header',
    authHeaderName: 'X-Token',
    extraHeaders: { 'X-Org': 'abc' },
    requestTemplate: JSON.stringify({ engine: '{{model}}', input: '{{prompt}}', history: '{{messages}}' }),
    responsePath: 'result.answer'
  }, mock.fetchImpl);

  const result = await client.chat.completions.create({ model: 'vendor-model', messages: [{ role: 'user', content: 'scan me' }] });
  assert.equal(mock.calls[0].init.headers['X-Token'], 'secret');
  assert.equal(mock.calls[0].init.headers['X-Org'], 'abc');
  assert.equal(mock.calls[0].body.engine, 'vendor-model');
  assert.deepEqual(mock.calls[0].body.history, [{ role: 'user', content: 'scan me' }]);
  assert.match(mock.calls[0].body.input, /scan me/);
  assert.equal(result.choices[0].message.content, '{"vulnerabilities":[]}');
});
