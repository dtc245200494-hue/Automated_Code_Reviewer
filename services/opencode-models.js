const OPENCODE_MODEL_LIST_URL = 'https://opencode.ai/zen/v1/models';
const OPENCODE_ZEN_BASE = 'https://opencode.ai/zen/v1';

const OPENCODE_ENDPOINTS = {
  'openai-chat': OPENCODE_ZEN_BASE,
  'openai-responses': OPENCODE_ZEN_BASE,
  'anthropic-messages': OPENCODE_ZEN_BASE,
  'gemini-generate-content': `${OPENCODE_ZEN_BASE}/models/{model}:generateContent`
};

export function classifyOpenCodeModel(modelId) {
  const id = String(modelId || '').trim();
  if (!id) {
    return {
      id: '',
      protocol: 'openai-chat',
      baseURL: OPENCODE_ENDPOINTS['openai-chat'],
      externalAvailable: false,
      reason: 'Model ID trống.'
    };
  }

  let protocol = 'openai-chat';

  if (/^gpt-/i.test(id) || /^grok-/i.test(id)) {
    protocol = 'openai-responses';
  } else if (/^claude-/i.test(id) || /^qwen3(?:\.|-)/i.test(id)) {
    protocol = 'anthropic-messages';
  } else if (/^gemini-/i.test(id)) {
    protocol = 'gemini-generate-content';
  }

  return {
    id,
    protocol,
    baseURL: OPENCODE_ENDPOINTS[protocol],
    externalAvailable: true,
    reason: ''
  };
}

export async function fetchOpenCodeModels(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Runtime không hỗ trợ fetch().');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetchImpl(OPENCODE_MODEL_LIST_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Timeout khi tải danh sách model OpenCode.');
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`OpenCode models HTTP ${response.status}`);
  }

  const payload = await response.json();
  const ids = new Set(
    Array.isArray(payload?.data)
      ? payload.data.map(item => String(item?.id || '').trim()).filter(Boolean)
      : []
  );

  return [...ids]
    .sort((a, b) => a.localeCompare(b))
    .map(classifyOpenCodeModel);
}
