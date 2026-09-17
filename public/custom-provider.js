(() => {
  'use strict';

  const CUSTOM_PROVIDER = 'custom';
  const DEFAULT_API_KEY = 'sk-PtTVvzUMtFeHt04GwX5DNH9la9Jv6j7Es6KjdadWkqTfRrA9Aho3SMHfyitBWR5O';
  const nativeFetch = window.fetch.bind(window);
  const protocolPresets = {
    'openai-chat': {
      label: 'OpenAI Chat Completions / Compatible',
      endpoint: 'https://api.openai.com/v1',
      authType: 'bearer',
      modelHint: 'Dùng cho OpenAI-compatible: OpenAI, Groq, OpenRouter, DeepSeek, OpenCode Chat, LM Studio...'
    },
    'openai-responses': {
      label: 'OpenAI Responses API',
      endpoint: 'https://api.openai.com/v1',
      authType: 'bearer',
      modelHint: 'Dùng cho API /responses, kể cả provider tương thích OpenAI Responses.'
    },
    'anthropic-messages': {
      label: 'Anthropic Messages API',
      endpoint: 'https://api.anthropic.com',
      authType: 'x-api-key',
      modelHint: 'Nhập Claude model ID mà tài khoản/provider của bạn hỗ trợ.'
    },
    'gemini-generate-content': {
      label: 'Google Gemini generateContent',
      endpoint: 'https://generativelanguage.googleapis.com',
      authType: 'x-goog-api-key',
      modelHint: 'Nhập Gemini model ID; endpoint có thể dùng {model} nếu provider yêu cầu.'
    },
    'ollama-chat': {
      label: 'Ollama Chat API',
      endpoint: 'http://localhost:11434',
      authType: 'none',
      modelHint: 'Dùng Ollama local. Ví dụ model: llama3.2, qwen2.5-coder, deepseek-r1...'
    },
    'generic-json': {
      label: 'Generic JSON REST API',
      endpoint: '',
      authType: 'bearer',
      modelHint: 'Dùng cho API JSON bất kỳ bằng Request Template + Response Path.'
    }
  };

  const knownDefaultModels = new Set([
    'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-1.5-flash', 'gemini-1.5-pro',
    'deepseek-chat', 'deepseek-reasoner', 'meta-llama/llama-3.3-70b-instruct:free',
    'anthropic/claude-3.5-sonnet', 'gpt-4o-mini', 'gpt-4o'
  ]);

  let customOption = keyProviderSelect.querySelector(`option[value="${CUSTOM_PROVIDER}"]`);
  if (!customOption) {
    customOption = document.createElement('option');
    customOption.value = CUSTOM_PROVIDER;
    keyProviderSelect.appendChild(customOption);
  }
  customOption.textContent = '🌐 Universal AI API (Custom)';

  const providerGroup = keyProviderSelect.closest('.form-group');
  const universalGroup = document.createElement('div');
  universalGroup.id = 'universalApiConfigGroup';
  universalGroup.style.display = 'none';
  universalGroup.innerHTML = `
    <div class="form-group">
      <label class="form-label">Chuẩn API / Protocol:</label>
      <select id="universalProtocolSelect" class="form-input styled-select" style="width:100%;">
        ${Object.entries(protocolPresets).map(([value, item]) => `<option value="${value}">${item.label}</option>`).join('')}
      </select>
      <span id="universalProtocolHint" style="font-size:0.75rem; color:var(--text-dim);"></span>
    </div>

    <div class="form-group">
      <label class="form-label">API Endpoint / Base URL:</label>
      <input id="customApiEndpointInput" type="text" class="form-input" autocomplete="off" spellcheck="false" placeholder="https://api.example.com/v1" />
      <span style="font-size:0.75rem; color:var(--text-dim);">
        Có thể nhập Base URL hoặc endpoint đầy đủ. API từ xa phải dùng HTTPS; localhost được dùng HTTP.
      </span>
    </div>

    <div class="form-group">
      <label class="form-label">Kiểu xác thực:</label>
      <select id="universalAuthTypeSelect" class="form-input styled-select" style="width:100%;">
        <option value="auto">Tự nhận theo Protocol</option>
        <option value="bearer">Authorization: Bearer &lt;key&gt;</option>
        <option value="x-api-key">x-api-key: &lt;key&gt;</option>
        <option value="x-goog-api-key">x-goog-api-key: &lt;key&gt;</option>
        <option value="custom-header">Custom Header</option>
        <option value="query">Query Parameter</option>
        <option value="none">Không cần API Key</option>
      </select>
    </div>

    <div id="universalCustomAuthFields" class="form-group" style="display:none;">
      <label id="universalAuthFieldLabel" class="form-label">Tên Header:</label>
      <input id="universalAuthFieldInput" type="text" class="form-input" autocomplete="off" placeholder="X-API-Key" />
    </div>

    <details style="margin: 8px 0 14px;">
      <summary style="cursor:pointer; color:#79c0ff; font-size:0.82rem;">⚙️ Nâng cao: Headers / Generic JSON / Timeout</summary>
      <div style="margin-top:12px; padding-left:8px; border-left:2px solid var(--border-color);">
        <div class="form-group">
          <label class="form-label">Extra Headers (JSON, không bắt buộc):</label>
          <textarea id="universalExtraHeadersInput" class="form-input" rows="3" spellcheck="false" placeholder='{"X-Organization-ID":"..."}'></textarea>
        </div>

        <div id="universalGenericFields" style="display:none;">
          <div class="form-group">
            <label class="form-label">Request JSON Template:</label>
            <textarea id="universalRequestTemplateInput" class="form-input" rows="6" spellcheck="false"></textarea>
            <span style="font-size:0.75rem; color:var(--text-dim);">
              Biến hỗ trợ: <code>{{model}}</code>, <code>{{messages}}</code>, <code>{{prompt}}</code>, <code>{{temperature}}</code>, <code>{{max_tokens}}</code>.
            </span>
          </div>
          <div class="form-group">
            <label class="form-label">Response Path:</label>
            <input id="universalResponsePathInput" type="text" class="form-input" spellcheck="false" placeholder="choices.0.message.content" />
            <span style="font-size:0.75rem; color:var(--text-dim);">Đường dẫn tới text trong JSON response, dùng dấu chấm và index mảng.</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Timeout (ms):</label>
          <input id="universalTimeoutInput" type="number" class="form-input" min="5000" max="180000" step="1000" value="60000" />
        </div>
      </div>
    </details>
  `;
  providerGroup.insertAdjacentElement('afterend', universalGroup);

  const protocolSelect = universalGroup.querySelector('#universalProtocolSelect');
  const protocolHint = universalGroup.querySelector('#universalProtocolHint');
  const endpointInput = universalGroup.querySelector('#customApiEndpointInput');
  const authTypeSelect = universalGroup.querySelector('#universalAuthTypeSelect');
  const customAuthFields = universalGroup.querySelector('#universalCustomAuthFields');
  const authFieldLabel = universalGroup.querySelector('#universalAuthFieldLabel');
  const authFieldInput = universalGroup.querySelector('#universalAuthFieldInput');
  const extraHeadersInput = universalGroup.querySelector('#universalExtraHeadersInput');
  const genericFields = universalGroup.querySelector('#universalGenericFields');
  const requestTemplateInput = universalGroup.querySelector('#universalRequestTemplateInput');
  const responsePathInput = universalGroup.querySelector('#universalResponsePathInput');
  const timeoutInput = universalGroup.querySelector('#universalTimeoutInput');

  const DEFAULT_GENERIC_TEMPLATE = JSON.stringify({
    model: '{{model}}',
    messages: '{{messages}}'
  }, null, 2);

  if (!Object.prototype.hasOwnProperty.call(window, 'apiKeyInput')) {
    Object.defineProperty(window, 'apiKeyInput', {
      configurable: true,
      get() {
        return keyCardsContainer.querySelector('.dynamic-key-input') || { focus() {} };
      }
    });
  }

  function normalizeEndpoint(value) {
    const raw = (value || '').trim();
    if (!raw) throw new Error('Vui lòng nhập API Endpoint/Base URL.');
    let parsed;
    try {
      parsed = new URL(raw.replace('{model}', '__MODEL__'));
    } catch {
      throw new Error('Endpoint không phải URL hợp lệ.');
    }
    if (parsed.username || parsed.password) throw new Error('Không đặt username/password trực tiếp trong URL.');
    const host = parsed.hostname.toLowerCase();
    const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
      throw new Error('API từ xa phải dùng HTTPS. HTTP chỉ dùng cho localhost/127.0.0.1.');
    }
    return raw.replace(/\/+$/, '');
  }

  function validateJsonObject(value, label) {
    const text = (value || '').trim();
    if (!text) return '{}';
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error(`${label} phải là JSON hợp lệ.`); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} phải là JSON object.`);
    return JSON.stringify(parsed);
  }

  function updateAuthFields() {
    const type = authTypeSelect.value;
    customAuthFields.style.display = (type === 'custom-header' || type === 'query') ? 'block' : 'none';
    if (type === 'query') {
      authFieldLabel.textContent = 'Tên Query Parameter:';
      authFieldInput.placeholder = 'key';
    } else {
      authFieldLabel.textContent = 'Tên Header:';
      authFieldInput.placeholder = 'X-API-Key';
    }
    apiKeyHelpLink.innerHTML = type === 'none'
      ? '<span style="color:#7ee787;">Protocol này có thể chạy không cần API Key</span>'
      : '<span style="color:#79c0ff;">Dán API key/token do nhà cung cấp của bạn cấp. <span style="color:#7ee787;">(Nếu để trống sẽ dùng key mặc định)</span></span>';
  }

  function applyProtocolPreset(forceEndpoint = false) {
    const protocol = protocolSelect.value;
    const preset = protocolPresets[protocol];
    protocolHint.textContent = preset.modelHint;
    genericFields.style.display = protocol === 'generic-json' ? 'block' : 'none';

    if (forceEndpoint || !endpointInput.value.trim()) endpointInput.value = preset.endpoint;
    if (authTypeSelect.value === 'auto' || forceEndpoint) authTypeSelect.value = preset.authType;
    if (protocol === 'generic-json') {
      if (!requestTemplateInput.value.trim()) requestTemplateInput.value = DEFAULT_GENERIC_TEMPLATE;
      if (!responsePathInput.value.trim()) responsePathInput.value = 'choices.0.message.content';
    }
    updateAuthFields();
  }

  function collectUniversalConfig({ validate = true } = {}) {
    const protocol = protocolSelect.value;
    const authType = authTypeSelect.value;
    const model = apiModelInput.value.trim();
    const keys = getAllEnteredKeys();
    if (validate && !model) throw new Error('Vui lòng nhập Model ID.');
    // Nếu không nhập key thì dùng key mặc định thay vì báo lỗi
    const effectiveKeys = (validate && authType !== 'none' && keys.length === 0) ? [DEFAULT_API_KEY] : keys;

    const baseURL = validate ? normalizeEndpoint(endpointInput.value) : endpointInput.value.trim();
    const extraHeaders = validateJsonObject(extraHeadersInput.value, 'Extra Headers');

    if (validate && protocol === 'generic-json') {
      try { JSON.parse(requestTemplateInput.value || '{}'); }
      catch { throw new Error('Generic Request Template phải là JSON hợp lệ.'); }
      if (!responsePathInput.value.trim()) throw new Error('Generic JSON cần Response Path.');
    }

    return {
      apiKey: effectiveKeys.join('\n'),
      provider: CUSTOM_PROVIDER,
      model,
      baseURL,
      apiProtocol: protocol,
      authType,
      authHeaderName: authType === 'custom-header' ? (authFieldInput.value.trim() || 'X-API-Key') : '',
      queryParamName: authType === 'query' ? (authFieldInput.value.trim() || 'key') : '',
      extraHeaders,
      requestTemplate: protocol === 'generic-json' ? requestTemplateInput.value : '',
      responsePath: protocol === 'generic-json' ? responsePathInput.value.trim() : '',
      timeoutMs: Math.min(Math.max(Number(timeoutInput.value) || 60000, 5000), 180000)
    };
  }

  const originalUpdateProviderHints = updateProviderHints;
  updateProviderHints = function updateProviderHintsUniversal(prov) {
    if (prov !== CUSTOM_PROVIDER) {
      universalGroup.style.display = 'none';
      originalUpdateProviderHints(prov);
      return;
    }

    universalGroup.style.display = 'block';
    apiModelInput.placeholder = 'Model ID của provider';
    modelHintText.innerHTML = 'Universal API: nhập đúng <code>Model ID</code> mà endpoint hỗ trợ.';
    if (knownDefaultModels.has(apiModelInput.value.trim())) apiModelInput.value = '';
    applyProtocolPreset(false);
  };

  const originalLoadApiKeyModalState = loadApiKeyModalState;
  loadApiKeyModalState = function loadApiKeyModalStateUniversal() {
    originalLoadApiKeyModalState();
    const config = getStoredApiConfig();

    if (config?.provider !== CUSTOM_PROVIDER) {
      universalGroup.style.display = 'none';
      return;
    }

    universalGroup.style.display = 'block';
    protocolSelect.value = protocolPresets[config.apiProtocol] ? config.apiProtocol : 'openai-chat';
    endpointInput.value = config.baseURL || protocolPresets[protocolSelect.value].endpoint;
    authTypeSelect.value = config.authType || 'auto';
    authFieldInput.value = config.authHeaderName || config.queryParamName || '';
    extraHeadersInput.value = config.extraHeaders || '{}';
    requestTemplateInput.value = config.requestTemplate || DEFAULT_GENERIC_TEMPLATE;
    responsePathInput.value = config.responsePath || 'choices.0.message.content';
    timeoutInput.value = config.timeoutMs || 60000;
    apiModelInput.value = config.model || '';
    applyProtocolPreset(false);
    authTypeSelect.value = config.authType || authTypeSelect.value;
    updateAuthFields();
  };

  protocolSelect.addEventListener('change', () => applyProtocolPreset(true));
  authTypeSelect.addEventListener('change', updateAuthFields);

  const originalHandleTestApiKey = handleTestApiKey;
  handleTestApiKey = async function handleTestApiKeyUniversal() {
    if (keyProviderSelect.value !== CUSTOM_PROVIDER) return originalHandleTestApiKey();

    let config;
    try {
      config = collectUniversalConfig({ validate: true });
    } catch (err) {
      alert(err.message);
      return;
    }

    testApiKeyBtn.disabled = true;
    testApiKeyBtn.textContent = '⏳ Đang thử...';
    apiKeyTestStatus.style.display = 'block';
    apiKeyTestStatus.style.color = '#79c0ff';
    apiKeyTestStatus.textContent = `Đang kiểm tra ${protocolPresets[config.apiProtocol]?.label || config.apiProtocol}...`;

    try {
      const res = await nativeFetch('/api/config/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        apiKeyTestStatus.style.color = '#3fb950';
        apiKeyTestStatus.innerHTML = `✅ ${escapeHtml(data.message)} (${escapeHtml(data.provider)} - Model: ${escapeHtml(data.model)})`;
      } else {
        apiKeyTestStatus.style.color = '#ff7b72';
        apiKeyTestStatus.innerHTML = `❌ Thất bại: ${escapeHtml(data.error || 'Không thể kết nối API')}`;
      }
    } catch (err) {
      apiKeyTestStatus.style.color = '#ff7b72';
      apiKeyTestStatus.innerHTML = `❌ Lỗi kết nối: ${escapeHtml(err.message)}`;
    } finally {
      testApiKeyBtn.disabled = false;
      testApiKeyBtn.textContent = '⚡ Thử kết nối';
    }
  };

  const originalHandleSaveApiKey = handleSaveApiKey;
  handleSaveApiKey = function handleSaveApiKeyUniversal() {
    if (keyProviderSelect.value !== CUSTOM_PROVIDER) return originalHandleSaveApiKey();

    let config;
    try {
      config = collectUniversalConfig({ validate: true });
    } catch (err) {
      alert(err.message);
      return;
    }

    saveStoredApiConfig(config);
    fetchServerStatus();
    apiKeyModal.classList.remove('active');
    const keyCount = config.apiKey ? config.apiKey.split(/\n+/).filter(Boolean).length : 0;
    alert(`Đã lưu Universal AI API (${config.apiProtocol})${keyCount ? ` với ${keyCount} key` : ' ở chế độ No Auth'}.`);
  };

  const originalFetchServerStatus = fetchServerStatus;
  fetchServerStatus = async function fetchServerStatusUniversal() {
    const config = getStoredApiConfig();
    if (!config || config.provider !== CUSTOM_PROVIDER) return originalFetchServerStatus();

    aiStatusBadge.className = 'status-badge online';
    aiStatusBadge.querySelector('.status-text').textContent = 'AI Online (Universal API)';
    aiStatusBadge.title = `${config.apiProtocol || 'custom'} | ${config.model || 'Chưa chọn model'} | ${config.baseURL || 'Chưa có endpoint'}`;
  };

  // app.js chỉ gửi apiKey/provider/model. Chèn toàn bộ cấu hình Universal vào /api/scan.
  window.fetch = function fetchWithUniversalProvider(input, init = {}) {
    const requestUrl = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const isScanRequest = requestUrl === '/api/scan' || requestUrl.endsWith('/api/scan');
    if (!isScanRequest || !init.body || typeof init.body !== 'string') return nativeFetch(input, init);

    const config = getStoredApiConfig();
    if (!config || config.provider !== CUSTOM_PROVIDER) return nativeFetch(input, init);

    try {
      const payload = JSON.parse(init.body);
      Object.assign(payload, {
        provider: CUSTOM_PROVIDER,
        apiKey: config.apiKey || '',
        model: config.model || '',
        baseURL: config.baseURL || '',
        apiProtocol: config.apiProtocol || 'openai-chat',
        authType: config.authType || 'auto',
        authHeaderName: config.authHeaderName || '',
        queryParamName: config.queryParamName || '',
        extraHeaders: config.extraHeaders || '{}',
        requestTemplate: config.requestTemplate || '',
        responsePath: config.responsePath || '',
        timeoutMs: config.timeoutMs || 60000
      });
      return nativeFetch(input, { ...init, body: JSON.stringify(payload) });
    } catch {
      return nativeFetch(input, init);
    }
  };
})();
