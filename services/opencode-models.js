const OPENCODE_MODEL_LIST_URL = 'https://opencode.ai/zen/v1/models';

const OPENCODE_ENDPOINTS = {
  'openai-chat': 'https://opencode.ai/inference/openai/v1',
  'openai-responses': 'https://opencode.ai/inference/openai/v1',
  'anthropic-messages': 'https://opencode.ai/inference/anthropic/v1',
  'gemini-generate-content': 'https://opencode.ai/inference/google'
};

const VERIFIED_EXTERNAL_FREE = new Set([
  'mimo-v2.5-free',
  'nemotron-3-super-free'
]);

const EXTRA_INFERENCE_MODELS = [
  'nemotron-3-super-free'
];

function isKnownRestrictedFree(id) {
  return id.endsWith('-free') && !VERIFIED_EXTERNAL_FREE.has(id);
}

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

  if (/^gpt-/i.test(id) || /^grok-4(?:\.|-)/i.test(id)) {
    protocol = 'openai-responses';
  } else if (/^claude-/i.test(id) || /^qwen3(?:\.|-)/i.test(id)) {
    protocol = 'anthropic-messages';
  } else if (/^gemini-/i.test(id)) {
    protocol = 'gemini-generate-content';
  } else if (/^grok-build-/i.test(id)) {
    protocol = 'openai-chat';
  }

  const externalAvailable = !isKnownRestrictedFree(id);
  return {
    id,
    protocol,
    baseURL: OPENCODE_ENDPOINTS[protocol],
    externalAvailable,
    reason: externalAvailable
      ? ''
      : 'Model free này hiện không được xác nhận dùng được từ API bên ngoài OpenCode.'
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
  EXTRA_INFERENCE_MODELS.forEach(id => ids.add(id));

  return [...ids]
    .sort((a, b) => a.localeCompare(b))
    .map(classifyOpenCodeModel);
}
