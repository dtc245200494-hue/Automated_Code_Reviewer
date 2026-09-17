(() => {
  'use strict';

  const CUSTOM_PROVIDER = 'custom';
  const knownDefaultModels = new Set([
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'deepseek-chat',
    'deepseek-reasoner',
    'meta-llama/llama-3.3-70b-instruct:free',
    'anthropic/claude-3.5-sonnet',
    'gpt-4o-mini',
    'gpt-4o'
  ]);

  if (!keyProviderSelect.querySelector(`option[value="${CUSTOM_PROVIDER}"]`)) {
    const option = document.createElement('option');
    option.value = CUSTOM_PROVIDER;
    option.textContent = '🧩 Custom API AI (OpenAI-compatible)';
    keyProviderSelect.appendChild(option);
  }

  const providerGroup = keyProviderSelect.closest('.form-group');
  const endpointGroup = document.createElement('div');
  endpointGroup.id = 'customApiEndpointGroup';
  endpointGroup.className = 'form-group';
  endpointGroup.style.display = 'none';
  endpointGroup.innerHTML = `
    <label class="form-label">Custom API Endpoint / Base URL:</label>
    <input
      type="text"
      id="customApiEndpointInput"
      class="form-input"
      autocomplete="off"
      spellcheck="false"
      placeholder="Ví dụ: https://api.example.com/v1"
    />
    <span style="font-size:0.75rem; color: var(--text-dim);">
      API phải tương thích OpenAI Chat Completions. API từ xa dùng HTTPS; localhost có thể dùng HTTP.
    </span>
  `;
  providerGroup.insertAdjacentElement('afterend', endpointGroup);

  const customApiEndpointInput = endpointGroup.querySelector('#customApiEndpointInput');

  function normalizeCustomEndpoint(value) {
    const raw = (value || '').trim();
    if (!raw) {
      throw new Error('Vui lòng nhập Custom API Endpoint/Base URL.');
    }

    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error('Endpoint Custom API không phải URL hợp lệ.');
    }

    if (parsed.username || parsed.password) {
      throw new Error('Không đặt username/password trực tiếp trong URL.');
    }

    const hostname = parsed.hostname.toLowerCase();
    const isLocalhost = hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '[::1]'
      || hostname === '::1';
    const allowed = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocalhost);

    if (!allowed) {
      throw new Error('Endpoint từ xa phải dùng HTTPS. HTTP chỉ dùng cho localhost/127.0.0.1.');
    }

    return parsed.toString().replace(/\/+$/, '');
  }

  // app.js cũ gọi apiKeyInput.focus(); cung cấp alias an toàn cho input động đầu tiên.
  if (!Object.prototype.hasOwnProperty.call(window, 'apiKeyInput')) {
    Object.defineProperty(window, 'apiKeyInput', {
      configurable: true,
      get() {
        return keyCardsContainer.querySelector('.dynamic-key-input') || { focus() {} };
      }
    });
  }

  const originalUpdateProviderHints = updateProviderHints;
  updateProviderHints = function updateProviderHintsWithCustom(prov) {
    if (prov !== CUSTOM_PROVIDER) {
      endpointGroup.style.display = 'none';
      originalUpdateProviderHints(prov);
      return;
    }

    endpointGroup.style.display = 'block';
    apiKeyHelpLink.innerHTML = '<span style="color:#79c0ff;">Dùng API key do nhà cung cấp Custom API cấp</span>';
    apiModelInput.placeholder = 'Ví dụ: model-name hoặc vendor/model-name';
    modelHintText.innerHTML = 'Custom API: nhập đúng <code>Model ID</code> mà endpoint của bạn hỗ trợ.';

    if (knownDefaultModels.has(apiModelInput.value.trim())) {
      apiModelInput.value = '';
    }
  };

  const originalLoadApiKeyModalState = loadApiKeyModalState;
  loadApiKeyModalState = function loadApiKeyModalStateWithCustom() {
    originalLoadApiKeyModalState();
    const config = getStoredApiConfig();

    if (config?.provider === CUSTOM_PROVIDER) {
      endpointGroup.style.display = 'block';
      customApiEndpointInput.value = config.baseURL || '';
      apiModelInput.value = config.model || '';
    } else {
      endpointGroup.style.display = 'none';
      customApiEndpointInput.value = '';
    }
  };

  const originalHandleTestApiKey = handleTestApiKey;
  handleTestApiKey = async function handleTestApiKeyWithCustom() {
    if (keyProviderSelect.value !== CUSTOM_PROVIDER) {
      return originalHandleTestApiKey();
    }

    const keys = getAllEnteredKeys();
    const model = apiModelInput.value.trim();
    let baseURL;

    if (keys.length === 0) {
      alert('Vui lòng nhập ít nhất 1 API Key để kiểm tra.');
      return;
    }
    if (!model) {
      alert('Vui lòng nhập Model ID của Custom API.');
      apiModelInput.focus();
      return;
    }

    try {
      baseURL = normalizeCustomEndpoint(customApiEndpointInput.value);
    } catch (err) {
      alert(err.message);
      customApiEndpointInput.focus();
      return;
    }

    testApiKeyBtn.disabled = true;
    testApiKeyBtn.textContent = '⏳ Đang thử...';
    apiKeyTestStatus.style.display = 'block';
    apiKeyTestStatus.style.color = '#79c0ff';
    apiKeyTestStatus.textContent = 'Đang xác thực Custom API...';

    try {
      const res = await nativeFetch('/api/config/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: keys.join('\n'),
          provider: CUSTOM_PROVIDER,
          model,
          baseURL
        })
      });
      const data = await res.json();

      if (data.success) {
        apiKeyTestStatus.style.color = '#3fb950';
        apiKeyTestStatus.innerHTML = `✅ ${escapeHtml(data.message)} (${escapeHtml(data.provider)} - Model: ${escapeHtml(data.model)})`;
      } else {
        apiKeyTestStatus.style.color = '#ff7b72';
        apiKeyTestStatus.innerHTML = `❌ Thất bại: ${escapeHtml(data.error || 'Không thể kết nối Custom API')}`;
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
  handleSaveApiKey = function handleSaveApiKeyWithCustom() {
    if (keyProviderSelect.value !== CUSTOM_PROVIDER) {
      return originalHandleSaveApiKey();
    }

    const keys = getAllEnteredKeys();
    const model = apiModelInput.value.trim();
    let baseURL;

    if (keys.length === 0) {
      alert('Vui lòng nhập ít nhất 1 API Key hoặc bấm "Xóa Key" nếu không muốn sử dụng.');
      return;
    }
    if (!model) {
      alert('Vui lòng nhập Model ID của Custom API.');
      apiModelInput.focus();
      return;
    }

    try {
      baseURL = normalizeCustomEndpoint(customApiEndpointInput.value);
    } catch (err) {
      alert(err.message);
      customApiEndpointInput.focus();
      return;
    }

    saveStoredApiConfig({
      apiKey: keys.join('\n'),
      provider: CUSTOM_PROVIDER,
      model,
      baseURL
    });

    fetchServerStatus();
    apiKeyModal.classList.remove('active');
    alert(`Đã lưu Custom API thành công với ${keys.length} API Key.`);
  };

  const originalFetchServerStatus = fetchServerStatus;
  fetchServerStatus = async function fetchServerStatusWithCustom() {
    const clientConfig = getStoredApiConfig();
    if (!clientConfig?.apiKey || clientConfig.provider !== CUSTOM_PROVIDER) {
      return originalFetchServerStatus();
    }

    aiStatusBadge.className = 'status-badge online';
    aiStatusBadge.querySelector('.status-text').textContent = 'AI Online (Custom API)';
    aiStatusBadge.title = `Custom API: ${clientConfig.model || 'Chưa chọn model'} @ ${clientConfig.baseURL || 'Chưa có endpoint'}`;
  };

  // Bổ sung baseURL vào mọi yêu cầu /api/scan mà không thay đổi app.js hiện có.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function fetchWithCustomProvider(input, init = {}) {
    const requestUrl = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const isScanRequest = requestUrl === '/api/scan' || requestUrl.endsWith('/api/scan');

    if (!isScanRequest || !init.body || typeof init.body !== 'string') {
      return nativeFetch(input, init);
    }

    const config = getStoredApiConfig();
    if (!config?.apiKey || config.provider !== CUSTOM_PROVIDER || !config.baseURL) {
      return nativeFetch(input, init);
    }

    try {
      const payload = JSON.parse(init.body);
      payload.baseURL = config.baseURL;
      return nativeFetch(input, { ...init, body: JSON.stringify(payload) });
    } catch {
      return nativeFetch(input, init);
    }
  };
})();
