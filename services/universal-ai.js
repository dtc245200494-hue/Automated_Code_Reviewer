const SUPPORTED_PROTOCOLS = new Set([
  'openai-chat',
  'openai-responses',
  'anthropic-messages',
  'gemini-generate-content',
  'ollama-chat',
  'generic-json'
]);

const BLOCKED_HEADER_NAMES = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding'
]);

export function normalizeUniversalEndpoint(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) throw new Error('Cần nhập API Endpoint/Base URL.');

  let parsed;
  try {
    parsed = new URL(raw.replace('{model}', '__MODEL__'));
  } catch {
    throw new Error('API Endpoint/Base URL không phải URL hợp lệ.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Không đặt username/password trực tiếp trong URL API.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalhost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
  const allowed = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocalhost);
  if (!allowed) {
    throw new Error('API từ xa phải dùng HTTPS. HTTP chỉ được phép với localhost/127.0.0.1.');
  }

  return raw.replace(/\/+$/, '');
}

export function parseExtraHeaders(value) {
  if (!value) return {};
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('Extra Headers phải là JSON object hợp lệ.');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Extra Headers phải là JSON object.');
  }

  const headers = {};
  for (const [name, rawValue] of Object.entries(parsed)) {
    const key = String(name).trim();
    if (!key || BLOCKED_HEADER_NAMES.has(key.toLowerCase())) continue;
    if (rawValue === undefined || rawValue === null) continue;
    headers[key] = String(rawValue);
  }
  return headers;
}

function joinPath(base, suffix) {
  return `${base.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`;
}

function resolveEndpoint(protocol, endpoint, model) {
  const base = normalizeUniversalEndpoint(endpoint);
  const encodedModel = encodeURIComponent(model || '');
  if (base.includes('{model}')) return base.replaceAll('{model}', encodedModel);

  if (protocol === 'openai-chat') {
    if (/\/chat\/completions\/?$/i.test(base)) return base;
    return joinPath(base, 'chat/completions');
  }
  if (protocol === 'openai-responses') {
    if (/\/responses\/?$/i.test(base)) return base;
    return joinPath(base, 'responses');
  }
  if (protocol === 'anthropic-messages') {
    if (/\/messages\/?$/i.test(base)) return base;
    if (/\/v1\/?$/i.test(base)) return joinPath(base, 'messages');
    return joinPath(base, 'v1/messages');
  }
  if (protocol === 'gemini-generate-content') {
    if (/:generateContent\/?$/i.test(base)) return base;
    if (/\/models\/[^/]+$/i.test(base)) return `${base}:generateContent`;
    return joinPath(base, `v1beta/models/${encodedModel}:generateContent`);
  }
  if (protocol === 'ollama-chat') {
    if (/\/api\/chat\/?$/i.test(base)) return base;
    return joinPath(base, 'api/chat');
  }
  return base;
}

function normalizeMessageText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') return part.text || part.content || '';
      return '';
    }).filter(Boolean).join('\n');
  }
  if (content && typeof content === 'object') return JSON.stringify(content);
  return '';
}

function promptFromMessages(messages = []) {
  return messages
    .map(msg => `${msg.role || 'user'}: ${normalizeMessageText(msg.content)}`)
    .join('\n\n');
}

function valueAtPath(root, path) {
  if (!path) return root;
  const parts = String(path).split('.').filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    const key = /^\d+$/.test(part) ? Number(part) : part;
    current = current[key];
  }
  return current;
}

function deepSubstitute(value, context) {
  if (Array.isArray(value)) return value.map(item => deepSubstitute(item, context));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepSubstitute(v, context)]));
  }
  if (typeof value !== 'string') return value;

  if (value === '{{messages}}') return context.messages;
  if (value === '{{prompt}}') return context.prompt;
  if (value === '{{model}}') return context.model;
  if (value === '{{temperature}}') return context.temperature;
  if (value === '{{max_tokens}}') return context.maxTokens;

  return value
    .replaceAll('{{prompt}}', context.prompt)
    .replaceAll('{{model}}', context.model)
    .replaceAll('{{temperature}}', String(context.temperature ?? ''))
    .replaceAll('{{max_tokens}}', String(context.maxTokens ?? ''));
}

function openAiShape(text, raw) {
  const content = typeof text === 'string' ? text : JSON.stringify(text);
  return {
    choices: [{ message: { role: 'assistant', content } }],
    _universal_raw: raw
  };
}

function extractResponsesText(data) {
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
  const texts = [];
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (typeof part?.text === 'string') texts.push(part.text);
      else if (typeof part?.output_text === 'string') texts.push(part.output_text);
    }
  }
  return texts.join('\n');
}

function extractAnthropicText(data) {
  return (data?.content || [])
    .map(part => part?.type === 'text' ? part.text : '')
    .filter(Boolean)
    .join('\n');
}

function extractGeminiText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n');
}

export class UniversalAIClient {
  constructor(apiKey = '', options = {}, fetchImpl = globalThis.fetch) {
    this.apiKey = String(apiKey || '').trim();
    this.protocol = options.protocol || 'openai-chat';
    if (!SUPPORTED_PROTOCOLS.has(this.protocol)) {
      throw new Error(`Giao thức API không được hỗ trợ: ${this.protocol}`);
    }
    this.endpoint = normalizeUniversalEndpoint(options.endpoint || options.baseURL || '');
    this.authType = options.authType || 'auto';
    this.authHeaderName = (options.authHeaderName || 'x-api-key').trim();
    this.queryParamName = (options.queryParamName || 'key').trim();
    this.extraHeaders = parseExtraHeaders(options.extraHeaders || {});
    this.requestTemplate = options.requestTemplate || '';
    this.responsePath = (options.responsePath || '').trim();
    this.timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 60000, 5000), 180000);
    if (typeof fetchImpl !== 'function') throw new Error('Runtime không hỗ trợ fetch().');
    this.fetchImpl = fetchImpl;

    this.chat = {
      completions: {
        create: params => this.createCompletion(params)
      }
    };
  }

  buildAuth(url, headers) {
    const authType = this.authType === 'auto'
      ? (this.protocol === 'anthropic-messages'
          ? 'x-api-key'
          : this.protocol === 'gemini-generate-content'
            ? 'x-goog-api-key'
            : this.protocol === 'ollama-chat'
              ? 'none'
              : 'bearer')
      : this.authType;

    if (authType === 'none' || !this.apiKey || this.apiKey === '__no_auth__') return url;
    if (authType === 'bearer') headers.Authorization = `Bearer ${this.apiKey}`;
    else if (authType === 'x-api-key') headers['x-api-key'] = this.apiKey;
    else if (authType === 'x-goog-api-key') headers['x-goog-api-key'] = this.apiKey;
    else if (authType === 'custom-header') headers[this.authHeaderName || 'x-api-key'] = this.apiKey;
    else if (authType === 'query') {
      const parsed = new URL(url);
      parsed.searchParams.set(this.queryParamName || 'key', this.apiKey);
      return parsed.toString();
    } else {
      throw new Error(`Kiểu xác thực không được hỗ trợ: ${authType}`);
    }
    return url;
  }

  async postJson(url, body, protocolHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...this.extraHeaders,
      ...protocolHeaders
    };
    const targetUrl = this.buildAuth(url, headers);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await this.fetchImpl(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw new Error(`AI API timeout sau ${this.timeoutMs}ms.`);
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const rawText = await response.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      if (!response.ok) throw new Error(`AI API HTTP ${response.status}: ${rawText.slice(0, 500)}`);
      throw new Error('AI API trả về dữ liệu không phải JSON.');
    }

    if (!response.ok) {
      const detail = data?.error?.message || data?.message || rawText || response.statusText;
      throw new Error(`AI API HTTP ${response.status}: ${String(detail).slice(0, 700)}`);
    }
    return data;
  }

  async createCompletion(params = {}) {
    const model = params.model || '';
    const messages = Array.isArray(params.messages) ? params.messages : [];
    const prompt = promptFromMessages(messages);
    const endpoint = resolveEndpoint(this.protocol, this.endpoint, model);

    if (this.protocol === 'openai-chat') {
      const body = {
        model,
        messages,
        ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
        ...(params.max_tokens !== undefined ? { max_tokens: params.max_tokens } : {}),
        ...(params.response_format ? { response_format: params.response_format } : {})
      };
      const data = await this.postJson(endpoint, body);
      const text = data?.choices?.[0]?.message?.content;
      if (text === undefined || text === null) throw new Error('OpenAI-compatible API không trả về choices[0].message.content.');
      return openAiShape(text, data);
    }

    if (this.protocol === 'openai-responses') {
      const body = {
        model,
        input: messages,
        ...(params.max_tokens !== undefined ? { max_output_tokens: params.max_tokens } : {})
      };
      const data = await this.postJson(endpoint, body);
      const text = extractResponsesText(data);
      if (!text) throw new Error('Responses API không trả về output text.');
      return openAiShape(text, data);
    }

    if (this.protocol === 'anthropic-messages') {
      const body = {
        model,
        max_tokens: params.max_tokens || 4096,
        messages: messages
          .filter(msg => msg.role !== 'system')
          .map(msg => ({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: normalizeMessageText(msg.content) }))
      };
      const systemText = messages.filter(msg => msg.role === 'system').map(msg => normalizeMessageText(msg.content)).join('\n');
      if (systemText) body.system = systemText;
      const data = await this.postJson(endpoint, body, { 'anthropic-version': '2023-06-01' });
      const text = extractAnthropicText(data);
      if (!text) throw new Error('Anthropic API không trả về content text.');
      return openAiShape(text, data);
    }

    if (this.protocol === 'gemini-generate-content') {
      const body = {
        contents: messages.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: normalizeMessageText(msg.content) }]
        })),
        generationConfig: {
          ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
          ...(params.max_tokens !== undefined ? { maxOutputTokens: params.max_tokens } : {}),
          ...(params.response_format ? { responseMimeType: 'application/json' } : {})
        }
      };
      const data = await this.postJson(endpoint, body);
      const text = extractGeminiText(data);
      if (!text) throw new Error('Gemini API không trả về candidates[0].content.parts[].text.');
      return openAiShape(text, data);
    }

    if (this.protocol === 'ollama-chat') {
      const body = {
        model,
        messages: messages.map(msg => ({ role: msg.role || 'user', content: normalizeMessageText(msg.content) })),
        stream: false,
        ...(params.response_format ? { format: 'json' } : {})
      };
      const data = await this.postJson(endpoint, body);
      const text = data?.message?.content ?? data?.response;
      if (text === undefined || text === null) throw new Error('Ollama API không trả về message.content/response.');
      return openAiShape(text, data);
    }

    let template;
    if (this.requestTemplate) {
      try {
        template = typeof this.requestTemplate === 'string' ? JSON.parse(this.requestTemplate) : this.requestTemplate;
      } catch {
        throw new Error('Generic Request Template phải là JSON hợp lệ.');
      }
    } else {
      template = { model: '{{model}}', messages: '{{messages}}' };
    }

    const body = deepSubstitute(template, {
      model,
      messages,
      prompt,
      temperature: params.temperature,
      maxTokens: params.max_tokens
    });
    const data = await this.postJson(endpoint, body);
    const extracted = valueAtPath(data, this.responsePath || 'choices.0.message.content');
    if (extracted === undefined || extracted === null) {
      throw new Error(`Không tìm thấy nội dung tại Response Path: ${this.responsePath || 'choices.0.message.content'}`);
    }
    return openAiShape(extracted, data);
  }
}

export function createUniversalAIClient(apiKey, options, fetchImpl) {
  return new UniversalAIClient(apiKey, options, fetchImpl);
}
