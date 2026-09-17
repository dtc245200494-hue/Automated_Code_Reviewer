(() => {
  'use strict';

  const STORAGE_KEY = 'ai_security_scanner_apiconfig';
  const universalGroup = document.getElementById('universalApiConfigGroup');
  const providerSelect = document.getElementById('keyProviderSelect');
  const protocolSelect = document.getElementById('universalProtocolSelect');
  const endpointInput = document.getElementById('customApiEndpointInput');
  const authTypeSelect = document.getElementById('universalAuthTypeSelect');
  const modelInput = document.getElementById('apiModelInput');
  const modelHint = document.getElementById('modelHintText');
  const openModalBtn = document.getElementById('openApiKeyModalBtn');

  if (!universalGroup || !providerSelect || !protocolSelect || !endpointInput || !authTypeSelect || !modelInput) {
    return;
  }

  universalGroup.insertAdjacentHTML('afterbegin', `
    <div class="form-group" id="universalServicePresetGroup">
      <label class="form-label">Preset nhà cung cấp:</label>
      <select id="universalServicePresetSelect" class="form-input styled-select" style="width:100%;">
        <option value="manual">⚙️ Tự cấu hình</option>
        <option value="opencode">🟣 OpenCode - tự tải model & endpoint</option>
      </select>
      <span style="font-size:0.75rem; color:var(--text-dim);">
        Chọn OpenCode để app tự tải danh sách model và tự đặt đúng Protocol/Endpoint.
      </span>
    </div>

    <div class="form-group" id="openCodeModelGroup" style="display:none;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:6px;">
        <label class="form-label" style="margin-bottom:0;">Model OpenCode:</label>
        <button type="button" id="refreshOpenCodeModelsBtn" class="btn-secondary" style="font-size:0.76rem; padding:5px 10px;">↻ Tải lại model</button>
      </div>
      <select id="openCodeModelSelect" class="form-input styled-select" style="width:100%;">
        <option value="">Chọn OpenCode để tải danh sách model...</option>
      </select>
      <div id="openCodeModelStatus" style="margin-top:6px; font-size:0.75rem; color:var(--text-dim);"></div>
    </div>
  `);

  const presetSelect = document.getElementById('universalServicePresetSelect');
  const modelGroup = document.getElementById('openCodeModelGroup');
  const modelSelect = document.getElementById('openCodeModelSelect');
  const modelStatus = document.getElementById('openCodeModelStatus');
  const refreshBtn = document.getElementById('refreshOpenCodeModelsBtn');
  const modelInputGroup = modelInput.closest('.form-group');

  let modelsCache = [];
  let loading = false;

  function readStoredConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function isOpenCodeConfig(config) {
    if (!config || config.provider !== 'custom') return false;
    try {
      return new URL(config.baseURL || '').hostname.toLowerCase() === 'opencode.ai';
    } catch {
      return false;
    }
  }

  function setStatus(text, type = 'normal') {
    modelStatus.textContent = text;
    modelStatus.style.color = type === 'error'
      ? '#ff7b72'
      : type === 'success'
        ? '#3fb950'
        : type === 'warn'
          ? '#d29922'
          : 'var(--text-dim)';
  }

  function protocolLabel(protocol) {
    const labels = {
      'openai-chat': 'Chat Completions',
      'openai-responses': 'Responses',
      'anthropic-messages': 'Anthropic Messages',
      'gemini-generate-content': 'Gemini generateContent'
    };
    return labels[protocol] || protocol;
  }

  function applyOpenCodeModel(modelId) {
    const item = modelsCache.find(model => model.id === modelId);
    if (!item) return;

    modelInput.value = item.id;
    protocolSelect.value = item.protocol;
    protocolSelect.dispatchEvent(new Event('change', { bubbles: true }));

    endpointInput.value = item.baseURL;
    authTypeSelect.value = 'bearer';
    authTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    if (modelHint) {
      modelHint.innerHTML = `OpenCode: <code>${item.id}</code> • ${protocolLabel(item.protocol)} • endpoint tự động.`;
    }

    if (item.externalAvailable) {
      setStatus(`✓ ${item.id} sẽ dùng ${protocolLabel(item.protocol)} qua OpenCode Inference API.`, 'success');
    } else {
      setStatus(item.reason || 'Model này chưa được xác nhận cho API bên ngoài OpenCode.', 'warn');
    }
  }

  function renderModels(models, preferredModel = '') {
    modelsCache = Array.isArray(models) ? models : [];
    modelSelect.innerHTML = '';

    const available = modelsCache.filter(item => item.externalAvailable);
    const restricted = modelsCache.filter(item => !item.externalAvailable);

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = available.length ? '— Chọn model OpenCode —' : 'Không có model khả dụng';
    modelSelect.appendChild(placeholder);

    const groups = new Map();
    for (const item of available) {
      if (!groups.has(item.protocol)) groups.set(item.protocol, []);
      groups.get(item.protocol).push(item);
    }

    for (const [protocol, items] of groups.entries()) {
      const group = document.createElement('optgroup');
      group.label = protocolLabel(protocol);
      for (const item of items) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.id;
        group.appendChild(option);
      }
      modelSelect.appendChild(group);
    }

    if (restricted.length) {
      const group = document.createElement('optgroup');
      group.label = '⚠️ Zen/OpenCode-only hoặc chưa xác nhận API ngoài';
      for (const item of restricted) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.id} — không chọn`;
        option.disabled = true;
        group.appendChild(option);
      }
      modelSelect.appendChild(group);
    }

    if (preferredModel && available.some(item => item.id === preferredModel)) {
      modelSelect.value = preferredModel;
      applyOpenCodeModel(preferredModel);
    } else if (preferredModel && restricted.some(item => item.id === preferredModel)) {
      modelSelect.value = '';
      setStatus(`⚠️ Model đã lưu "${preferredModel}" không dùng được/không được xác nhận cho API ngoài. Hãy chọn model khác.`, 'warn');
    } else if (available.length) {
      setStatus(`Đã tải ${available.length} model dùng được qua API ngoài; ${restricted.length} model bị khóa để tránh lỗi 403.`, 'success');
    }
  }

  async function loadModels({ force = false, preferredModel = '' } = {}) {
    if (loading) return;
    if (modelsCache.length && !force) {
      renderModels(modelsCache, preferredModel || modelInput.value.trim());
      return;
    }

    loading = true;
    refreshBtn.disabled = true;
    modelSelect.disabled = true;
    setStatus('Đang tải danh sách model từ OpenCode...', 'normal');

    try {
      const response = await fetch('/api/providers/opencode/models', { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      renderModels(data.models || [], preferredModel || modelInput.value.trim());
    } catch (err) {
      modelSelect.innerHTML = '<option value="">Không tải được model - dùng cấu hình thủ công</option>';
      setStatus(`Không tải được danh sách OpenCode: ${err.message}`, 'error');
    } finally {
      loading = false;
      refreshBtn.disabled = false;
      modelSelect.disabled = false;
    }
  }

  async function setPreset(value, { preferredModel = '' } = {}) {
    const isOpenCode = value === 'opencode';
    modelGroup.style.display = isOpenCode ? 'block' : 'none';
    if (modelInputGroup) modelInputGroup.style.display = isOpenCode ? 'none' : '';

    if (!isOpenCode) return;

    providerSelect.value = 'custom';
    endpointInput.value = 'https://opencode.ai/inference/openai/v1';
    authTypeSelect.value = 'bearer';
    authTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await loadModels({ preferredModel });
  }

  presetSelect.addEventListener('change', () => {
    setPreset(presetSelect.value, { preferredModel: modelInput.value.trim() });
  });

  modelSelect.addEventListener('change', () => {
    if (modelSelect.value) applyOpenCodeModel(modelSelect.value);
  });

  refreshBtn.addEventListener('click', () => {
    loadModels({ force: true, preferredModel: modelInput.value.trim() });
  });

  providerSelect.addEventListener('change', () => {
    if (providerSelect.value !== 'custom') {
      presetSelect.value = 'manual';
      modelGroup.style.display = 'none';
      if (modelInputGroup) modelInputGroup.style.display = '';
    }
  });

  if (openModalBtn) {
    openModalBtn.addEventListener('click', () => {
      setTimeout(() => {
        const config = readStoredConfig();
        if (isOpenCodeConfig(config)) {
          presetSelect.value = 'opencode';
          setPreset('opencode', { preferredModel: config.model || '' });
        } else {
          presetSelect.value = 'manual';
          modelGroup.style.display = 'none';
          if (modelInputGroup) modelInputGroup.style.display = '';
        }
      }, 0);
    });
  }
})();
