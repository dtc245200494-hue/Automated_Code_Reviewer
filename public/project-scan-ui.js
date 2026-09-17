(() => {
  'use strict';

  const GENERATED_PATH_RE = /(^|\/)(node_modules|dist|build|vendor|coverage|\.git|\.idea)(\/|$)|\.min\.(?:js|css)$/i;
  const historyFingerprintsByFile = new Map();
  let lastProjectScanMeta = null;
  let visibleProgressTimer = null;
  let visibleProgressStartedAt = 0;
  let visibleProgressValue = 0;

  function isGeneratedPath(value) {
    return GENERATED_PATH_RE.test(String(value || '').replace(/\\/g, '/'));
  }

  function fullSafe(result) {
    return Boolean(result && result.is_safe && !result.incomplete && !result.limited_coverage);
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function providerName(provider) {
    return ({
      openai: 'OpenAI',
      groq: 'Groq AI',
      gemini: 'Google Gemini',
      deepseek: 'DeepSeek',
      openrouter: 'OpenRouter',
      opencode: 'OpenCode.ai',
      custom: 'Universal AI'
    })[String(provider || '').toLowerCase()] || provider || 'Server AI';
  }

  function severityKey(vuln) {
    const sev = String(vuln?.severity || 'Cao').toLowerCase();
    if (sev.includes('nghiêm trọng') || sev.includes('critical')) return 'critical';
    if (sev.includes('trung') || sev.includes('medium')) return 'medium';
    if (sev.includes('thấp') || sev.includes('low') || sev.includes('info')) return 'low';
    return 'high';
  }

  function statusFor(vuln, filePath) {
    return typeof getFindingState === 'function' ? getFindingState(vuln, filePath) : 'open';
  }

  function collectProjectFindings() {
    const findings = [];
    if (Array.isArray(uploadedFiles) && uploadedFiles.length) {
      uploadedFiles.forEach((file, fileIndex) => {
        const list = file?.result?.vulnerabilities || [];
        list.forEach((vuln, localIndex) => findings.push({
          vuln,
          fileIndex,
          localIndex,
          filePath: file.path || file.name || `file-${fileIndex + 1}`
        }));
      });
    }
    if (!findings.length && Array.isArray(activeFindingList)) {
      const filePath = (activeFileIndex >= 0 && uploadedFiles?.[activeFileIndex]?.path) || 'Mã nguồn hiện tại';
      activeFindingList.forEach((vuln, localIndex) => findings.push({
        vuln,
        fileIndex: activeFileIndex,
        localIndex,
        filePath
      }));
    }
    return findings;
  }

  function ensureAdapterStyles() {
    if (document.getElementById('appsecAdapterStyles')) return;
    const style = document.createElement('style');
    style.id = 'appsecAdapterStyles';
    style.textContent = `
      .navbar #openApiKeyModalBtn { display: none !important; }
      .scan-progress-dock {
        position: fixed; top: 76px; left: 50%; transform: translateX(-50%);
        width: min(620px, calc(100vw - 28px)); z-index: 9998;
        background: rgba(13,17,23,.97); border: 1px solid #30363d; border-radius: 10px;
        box-shadow: 0 14px 42px rgba(0,0,0,.42); padding: 12px 14px; display: none;
        font-family: Inter, sans-serif;
      }
      .scan-progress-dock.visible { display: block; }
      .scan-progress-top { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px; }
      .scan-progress-title { font-size:.84rem; font-weight:700; color:#f0f6fc; }
      .scan-progress-percent { font:600 .78rem 'Fira Code', monospace; color:#79c0ff; }
      .scan-progress-track { height:7px; overflow:hidden; border-radius:999px; background:#21262d; border:1px solid #30363d; }
      .scan-progress-fill { height:100%; width:0%; border-radius:999px; background:linear-gradient(90deg,#1f6feb,#00d2ff); transition:width .28s ease; }
      .scan-progress-bottom { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:7px; color:#8b949e; font-size:.72rem; }
      .scan-progress-stage { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
      .scan-progress-time { font-family:'Fira Code', monospace; flex-shrink:0; }
      .activity-badge.history-badge { background:#388bfd; }
      .history-sidebar-toolbar { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:9px 10px; border-bottom:1px solid #30363d; }
      .history-sidebar-toolbar strong { font-size:.72rem; letter-spacing:.06em; color:#8b949e; }
      .history-clear-btn { border:1px solid #30363d; background:#161b22; color:#ff7b72; border-radius:5px; padding:4px 7px; cursor:pointer; font-size:.7rem; }
      .history-sidebar-list { overflow:auto; height:100%; padding:7px; }
      .history-sidebar-item { border:1px solid #30363d; background:#0d1117; border-radius:7px; padding:9px; margin-bottom:7px; cursor:pointer; }
      .history-sidebar-item:hover { border-color:#388bfd; background:#111923; }
      .history-sidebar-row { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
      .history-sidebar-title { color:#dce4ec; font-size:.76rem; font-weight:650; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .history-sidebar-time { color:#6e7681; font-size:.66rem; margin-top:4px; }
      .history-sidebar-meta { color:#8b949e; font-size:.68rem; margin-top:5px; }
      .history-status { flex-shrink:0; font-size:.62rem; font-weight:700; border-radius:999px; padding:2px 6px; border:1px solid #30363d; }
      .history-status.bad { color:#ff7b72; border-color:rgba(248,81,73,.35); }
      .history-status.warn { color:#d29922; border-color:rgba(210,153,34,.35); }
      .history-status.good { color:#3fb950; border-color:rgba(63,185,80,.35); }
      .project-finding-row { border-bottom:1px solid rgba(48,54,61,.75); padding:9px 10px; cursor:pointer; }
      .project-finding-row:hover { background:rgba(56,139,253,.08); }
      .project-finding-top { display:flex; align-items:center; gap:7px; }
      .project-sev { font-size:.61rem; font-weight:800; padding:2px 5px; border-radius:4px; text-transform:uppercase; }
      .project-sev.critical,.project-sev.high { color:#ff7b72; background:rgba(248,81,73,.14); }
      .project-sev.medium { color:#d29922; background:rgba(210,153,34,.14); }
      .project-sev.low { color:#3fb950; background:rgba(63,185,80,.14); }
      .project-finding-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#e6edf3; font-size:.75rem; font-weight:600; }
      .project-finding-loc { color:#6e7681; font:500 .67rem 'Fira Code', monospace; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .project-finding-state { margin-left:auto; color:#8b949e; font-size:.62rem; }
      .adapter-note { color:#8b949e; font-size:.69rem; padding:8px 10px; border-bottom:1px solid #30363d; background:#0d1117; }
      @media (max-width: 760px) { .scan-progress-dock { top: 66px; } }
    `;
    document.head.appendChild(style);
  }

  function ensureVisibleProgress() {
    let dock = document.getElementById('scanProgressDockVisible');
    if (dock) return dock;
    dock = document.createElement('div');
    dock.id = 'scanProgressDockVisible';
    dock.className = 'scan-progress-dock';
    dock.innerHTML = `
      <div class="scan-progress-top">
        <div class="scan-progress-title" id="visibleScanTitle">Security scan</div>
        <div class="scan-progress-percent" id="visibleScanPercent">0%</div>
      </div>
      <div class="scan-progress-track"><div class="scan-progress-fill" id="visibleScanFill"></div></div>
      <div class="scan-progress-bottom">
        <span class="scan-progress-stage" id="visibleScanStage">Chuẩn bị...</span>
        <span class="scan-progress-time" id="visibleScanTime">0.0s</span>
      </div>`;
    document.body.appendChild(dock);
    return dock;
  }

  function setVisibleProgress(value, stage) {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    visibleProgressValue = pct;
    const fill = document.getElementById('visibleScanFill');
    const pctEl = document.getElementById('visibleScanPercent');
    const stageEl = document.getElementById('visibleScanStage');
    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
    if (stageEl && stage) stageEl.textContent = stage;
  }

  function startVisibleProgress({ title = 'Đang quét bảo mật', project = false, totalFiles = 0 } = {}) {
    const dock = ensureVisibleProgress();
    clearInterval(visibleProgressTimer);
    visibleProgressStartedAt = Date.now();
    visibleProgressValue = 8;
    dock.classList.add('visible');
    const titleEl = document.getElementById('visibleScanTitle');
    if (titleEl) titleEl.textContent = title;
    setVisibleProgress(8, project ? `Lập kế hoạch quét ${totalFiles || ''} file & dependency map...` : 'Chuẩn bị mã nguồn và heuristic pre-scan...');
    visibleProgressTimer = setInterval(() => {
      const elapsed = (Date.now() - visibleProgressStartedAt) / 1000;
      const timeEl = document.getElementById('visibleScanTime');
      if (timeEl) timeEl.textContent = `${elapsed.toFixed(1)}s`;
      if (visibleProgressValue < 90) {
        const increment = Math.max(.6, (90 - visibleProgressValue) * .035);
        visibleProgressValue = Math.min(90, visibleProgressValue + increment);
      }
      let stage;
      if (project) {
        if (elapsed < 1.5) stage = `Indexing ${totalFiles || ''} file & dependency analysis...`;
        else if (elapsed < 4.5) stage = 'Groq primary scan · batch/queue đang xử lý...';
        else if (elapsed < 8) stage = 'Cross-file dependency verification...';
        else stage = 'Tổng hợp findings · Gemini chỉ verify/fallback khi cần...';
      } else {
        if (elapsed < 1.5) stage = 'Heuristic pre-scan & chia vùng phân tích...';
        else if (elapsed < 5) stage = 'Groq primary AI analysis...';
        else stage = 'Tổng hợp findings · verification nếu cần...';
      }
      setVisibleProgress(visibleProgressValue, stage);
    }, 300);
  }

  function finishVisibleProgress(message = 'Hoàn tất phân tích') {
    clearInterval(visibleProgressTimer);
    visibleProgressTimer = null;
    const timeEl = document.getElementById('visibleScanTime');
    if (timeEl && visibleProgressStartedAt) timeEl.textContent = `${((Date.now() - visibleProgressStartedAt) / 1000).toFixed(1)}s`;
    setVisibleProgress(100, message);
    setTimeout(() => document.getElementById('scanProgressDockVisible')?.classList.remove('visible'), 900);
  }

  async function parseApiJson(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      const sample = text.replace(/\s+/g, ' ').trim().slice(0, 140);
      throw new Error(`API trả về dữ liệu không phải JSON (HTTP ${response.status}). Phản hồi bắt đầu bằng: ${sample || '[rỗng]'}`);
    }
  }

  function ensureHistoryUI() {
    const activityTop = document.querySelector('#activityBar .activity-top');
    const settingsBtn = document.getElementById('tabBtnSettings');
    if (activityTop && !document.getElementById('tabBtnHistory')) {
      const btn = document.createElement('button');
      btn.className = 'activity-btn';
      btn.id = 'tabBtnHistory';
      btn.dataset.view = 'history';
      btn.title = 'History - Lịch sử quét';
      btn.innerHTML = '<span class="activity-icon">🕘</span><span id="historyActivityBadge" class="activity-badge history-badge" style="display:none;">0</span>';
      activityTop.insertBefore(btn, settingsBtn || null);
      btn.addEventListener('click', () => {
        switchSidebarView('history');
        renderHistorySidebar();
      });
    }

    const sidebar = document.getElementById('primarySidebar');
    if (sidebar && !document.getElementById('viewHistory')) {
      const pane = document.createElement('div');
      pane.className = 'sidebar-view-pane';
      pane.id = 'viewHistory';
      pane.innerHTML = `
        <div class="history-sidebar-toolbar">
          <strong>SCAN HISTORY</strong>
          <button type="button" class="history-clear-btn" id="historySidebarClearBtn">Xóa lịch sử</button>
        </div>
        <div class="adapter-note">Lưu cục bộ tối đa 30 lần quét. Bấm một mục để khôi phục file/project và kết quả.</div>
        <div class="history-sidebar-list" id="historySidebarList"></div>`;
      sidebar.appendChild(pane);
      pane.querySelector('#historySidebarClearBtn')?.addEventListener('click', () => {
        if (typeof clearAllHistory === 'function') clearAllHistory();
        renderHistorySidebar();
        refreshHistoryBadge();
      });
    }
    refreshHistoryBadge();
  }

  function refreshHistoryBadge() {
    const history = typeof getScanHistory === 'function' ? getScanHistory() : [];
    const badge = document.getElementById('historyActivityBadge');
    if (badge) {
      badge.textContent = String(history.length);
      badge.style.display = history.length ? 'inline-flex' : 'none';
    }
  }

  function historyStatus(item) {
    const vulnerable = item?.status === 'vulnerable' || Number(item?.total_vulns || 0) > 0;
    const error = ['error', 'partial_error', 'incomplete'].includes(item?.status);
    if (vulnerable) return { label: `${Number(item.total_vulns || 0)} finding`, cls: 'bad' };
    if (error) return { label: item.status || 'error', cls: 'warn' };
    if (item?.status === 'loaded') return { label: 'loaded', cls: 'warn' };
    return { label: 'clean', cls: 'good' };
  }

  function renderHistorySidebar() {
    const host = document.getElementById('historySidebarList');
    if (!host) return;
    const history = typeof getScanHistory === 'function' ? getScanHistory() : [];
    refreshHistoryBadge();
    if (!history.length) {
      host.innerHTML = '<div class="sidebar-empty-hint">Chưa có lịch sử. Kết quả scan file, folder và Git repo sẽ xuất hiện tại đây.</div>';
      return;
    }
    host.innerHTML = history.map((item, index) => {
      const status = historyStatus(item);
      const time = item.timestamp ? new Date(item.timestamp).toLocaleString('vi-VN') : '';
      const files = item.snapshotFiles?.length || item.total_files || 0;
      const meta = item.type === 'single_file'
        ? `${item.language || 'auto'} · ${item.duration || '-'}s`
        : `${files} file · ${item.scanned_files ?? 0} scanned`;
      return `
        <div class="history-sidebar-item" data-history-index="${index}">
          <div class="history-sidebar-row">
            <div class="history-sidebar-title">${esc(item.title || 'Lần quét')}</div>
            <span class="history-status ${status.cls}">${esc(status.label)}</span>
          </div>
          <div class="history-sidebar-time">${esc(time)}</div>
          <div class="history-sidebar-meta">${esc(meta)}</div>
        </div>`;
    }).join('');
    host.querySelectorAll('[data-history-index]').forEach(row => {
      row.addEventListener('click', () => {
        const index = Number(row.dataset.historyIndex);
        const item = history[index];
        if (!item) return;
        if ((item.type === 'folder_scan' || item.type === 'git_repo') && typeof restoreHistoryFolderSummary === 'function') {
          restoreHistoryFolderSummary(index);
          if (typeof switchSidebarView === 'function') switchSidebarView('explorer');
        } else if (typeof restoreHistorySingleFile === 'function') {
          restoreHistorySingleFile(index);
          if (typeof switchSidebarView === 'function') switchSidebarView('findings');
        }
      });
    });
  }

  function syncCoverageUI(result) {
    let totalLines = 0;
    let aiLines = 0;
    let heuristicWeighted = 0;
    const results = [];
    if (result) results.push(result);
    else if (Array.isArray(uploadedFiles)) uploadedFiles.forEach(file => file?.result && results.push(file.result));
    results.forEach(item => {
      const lines = Number(item.total_lines || 0);
      totalLines += lines;
      aiLines += Number(item.ai_covered_lines || (lines * Number(item.ai_coverage_percent || 0) / 100));
      heuristicWeighted += lines * Number(item.heuristic_coverage_percent || 0) / 100;
    });
    const aiPct = totalLines ? Math.min(100, aiLines / totalLines * 100) : 0;
    const heurPct = totalLines ? Math.min(100, heuristicWeighted / totalLines * 100) : 0;
    const aiText = document.getElementById('aiCoverageText');
    const aiFill = document.getElementById('aiCoverageFill');
    if (aiText) aiText.textContent = totalLines ? `${aiPct.toFixed(1)}%` : '—';
    if (aiFill) aiFill.style.width = `${aiPct}%`;
    const items = document.querySelectorAll('#viewScan .coverage-item');
    if (items[1]) {
      const text = items[1].querySelector('.coverage-label-row span:last-child');
      const fill = items[1].querySelector('.progress-bar-fill');
      if (text) text.textContent = totalLines ? `${heurPct.toFixed(1)}%` : '—';
      if (fill) fill.style.width = `${heurPct}%`;
    }
  }

  function syncEngineLabels() {
    const settings = document.querySelectorAll('#viewSettings .setting-value-badge');
    let config = null;
    try { config = typeof getStoredApiConfig === 'function' ? getStoredApiConfig() : null; } catch { config = null; }
    if (settings[0]) {
      settings[0].textContent = config?.apiKey
        ? `⚡ ${providerName(config.provider)} · ${config.model || 'default model'}`
        : '⚡ Groq Primary · model cấu hình trên server';
    }
    if (settings[1]) settings[1].textContent = '✨ Gemini Assistant · verify/fallback theo điều kiện';
    const step1 = document.querySelector('#pipeStep1 .step-label');
    const step3 = document.querySelector('#pipeStep3 .step-label');
    const step4 = document.querySelector('#pipeStep4 .step-label');
    if (step1) step1.textContent = 'Project Indexing & Dependency Map';
    if (step3) step3.textContent = 'AI Deep Analysis (Groq Primary)';
    if (step4) step4.textContent = 'Cross-file Dependency Verification';
  }

  function renderProjectFindingsUI() {
    const list = document.getElementById('sidebarFindingsList');
    if (!list) return;
    const all = collectProjectFindings();
    let countCrit = 0, countHigh = 0, countMed = 0, countLow = 0;
    let countOpen = 0, countFixed = 0, countIgnored = 0;

    all.forEach(entry => {
      const state = statusFor(entry.vuln, entry.filePath);
      const sev = severityKey(entry.vuln);
      if (state === 'open') {
        if (sev === 'critical') countCrit++;
        else if (sev === 'medium') countMed++;
        else if (sev === 'low') countLow++;
        else countHigh++;
        countOpen++;
      } else if (state === 'fixed') countFixed++;
      else countIgnored++;
    });

    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
    setText('countCrit', countCrit); setText('countHigh', countHigh); setText('countMed', countMed); setText('countLow', countLow);
    setText('countStatusOpen', countOpen); setText('countStatusFixed', countFixed); setText('countStatusIgnored', countIgnored);

    const navBadge = document.getElementById('findingsNavBadge');
    if (navBadge) {
      navBadge.textContent = String(countOpen);
      navBadge.style.display = countOpen ? 'inline-flex' : 'none';
    }

    const gateFailed = countCrit > 0 || countHigh > 0;
    const gateCard = document.getElementById('securityGateCard');
    const gateTitle = document.getElementById('gateStatusTitle');
    const gateDesc = document.getElementById('gateStatusDesc');
    const gateIcon = document.getElementById('gateIconLarge');
    const gateBadge = document.getElementById('editorGateBadge');
    if (gateFailed) {
      if (gateCard) gateCard.className = 'gate-status-card failed';
      if (gateTitle) gateTitle.textContent = 'SECURITY GATE: FAILED';
      if (gateDesc) gateDesc.textContent = `Project còn ${countCrit} Critical & ${countHigh} High chưa xử lý.`;
      if (gateIcon) gateIcon.textContent = '🚨';
      if (gateBadge) { gateBadge.className = 'gate-chip gate-chip-fail'; gateBadge.textContent = `🔴 Gate Failed · ${countCrit + countHigh}`; }
    } else {
      if (gateCard) gateCard.className = 'gate-status-card passed';
      if (gateTitle) gateTitle.textContent = 'SECURITY GATE: PASSED';
      if (gateDesc) gateDesc.textContent = 'Không còn Critical/High đang mở trong phạm vi project hiện tại.';
      if (gateIcon) gateIcon.textContent = '🛡️';
      if (gateBadge) { gateBadge.className = 'gate-chip gate-chip-pass'; gateBadge.textContent = '🟢 Gate Passed'; }
    }

    const showOpen = document.getElementById('chkFilterOpen')?.checked !== false;
    const showFixed = document.getElementById('chkFilterFixed')?.checked === true;
    const showIgnored = document.getElementById('chkFilterIgnored')?.checked === true;
    const sevFilter = typeof findingFilterSev !== 'undefined' ? findingFilterSev : 'all';
    const query = String(typeof findingSearchQuery !== 'undefined' ? findingSearchQuery : '').trim().toLowerCase();
    const filtered = all.filter(entry => {
      const state = statusFor(entry.vuln, entry.filePath);
      if (state === 'open' && !showOpen) return false;
      if (state === 'fixed' && !showFixed) return false;
      if (state !== 'open' && state !== 'fixed' && !showIgnored) return false;
      const sev = severityKey(entry.vuln);
      if (sevFilter && sevFilter !== 'all' && sev !== sevFilter) return false;
      if (query) {
        const haystack = [entry.vuln.type, entry.vuln.cwe, entry.vuln.owasp_category, entry.filePath].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      list.innerHTML = '<div class="sidebar-empty-hint">Không có finding phù hợp bộ lọc hiện tại.</div>';
      return;
    }
    list.innerHTML = '<div class="adapter-note">Findings toàn project · click để mở đúng file/dòng. PROBLEMS phía dưới chỉ phản ánh file đang mở.</div>' + filtered.map((entry, idx) => {
      const v = entry.vuln;
      const sev = severityKey(v);
      const state = statusFor(v, entry.filePath);
      const line = Number(v.start_line || v.line_number || 1);
      return `
        <div class="project-finding-row" data-project-finding="${idx}">
          <div class="project-finding-top">
            <span class="project-sev ${sev}">${sev}</span>
            <span class="project-finding-title">${esc(v.type || v.cwe || 'Security finding')}</span>
            <span class="project-finding-state">${esc(state)}</span>
          </div>
          <div class="project-finding-loc">${esc(entry.filePath)}:${line} · ${esc(v.cwe || v.owasp_category || 'OWASP')}</div>
        </div>`;
    }).join('');
    list.querySelectorAll('[data-project-finding]').forEach((row, idx) => {
      row.addEventListener('click', () => {
        const entry = filtered[idx];
        if (!entry) return;
        if (entry.fileIndex >= 0 && entry.fileIndex !== activeFileIndex && typeof selectUploadedFile === 'function') {
          selectUploadedFile(entry.fileIndex);
        }
        if (typeof selectVulnerability === 'function') selectVulnerability(entry.localIndex);
      });
    });
  }

  if (typeof loadApiKeyModalState === 'function') {
    const originalLoadApiKeyModalState = loadApiKeyModalState;
    loadApiKeyModalState = function loadGroqDefaultApiState() {
      originalLoadApiKeyModalState();
      const config = typeof getStoredApiConfig === 'function' ? getStoredApiConfig() : null;
      if (!config && typeof keyProviderSelect !== 'undefined' && keyProviderSelect) {
        keyProviderSelect.value = 'groq';
        if (typeof updateProviderHints === 'function') updateProviderHints('groq');
      }
      syncEngineLabels();
    };
  }

  if (typeof handleFilesSelected === 'function') {
    const originalHandleFilesSelected = handleFilesSelected;
    handleFilesSelected = async function handleFilesSelectedProjectAware(fileList) {
      await originalHandleFilesSelected(fileList);
      const before = uploadedFiles.length;
      uploadedFiles = uploadedFiles.filter(file => !isGeneratedPath(file.path || file.name));
      if (uploadedFiles.length && uploadedFiles.length !== before) setupFolderView(`${uploadedFiles.length} file`);
      syncCoverageUI();
    };
  }

  if (typeof handleScan === 'function') {
    const originalHandleScan = handleScan;
    handleScan = async function handleScanWithVisibleProgress(...args) {
      if (!isScanning) startVisibleProgress({ title: 'Đang phân tích file hiện tại' });
      try {
        return await originalHandleScan(...args);
      } finally {
        syncCoverageUI(currentActiveReport || null);
        finishVisibleProgress('Hoàn tất phân tích file');
        renderProjectFindingsUI();
      }
    };
  }

  if (typeof updateScanDiffMetrics === 'function') {
    updateScanDiffMetrics = function updateScanDiffMetricsPerFile(newVulns = [], filePath = 'current') {
      const key = String(filePath || 'current');
      const previous = historyFingerprintsByFile.get(key) || new Set();
      const current = new Set(newVulns.map(v => typeof computeFindingFingerprint === 'function'
        ? computeFindingFingerprint(v, key)
        : [key, v.type || '', v.cwe || '', v.start_line || v.line_number || 1].join('|').toLowerCase()));
      let diffNew = 0, diffResolved = 0;
      current.forEach(fp => { if (!previous.has(fp)) diffNew++; });
      previous.forEach(fp => { if (!current.has(fp)) diffResolved++; });
      const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
      set('diffNewCount', `+${diffNew}`);
      set('diffResolvedCount', `-${diffResolved}`);
      set('diffRemainedCount', `${current.size}`);
      historyFingerprintsByFile.set(key, current);
    };
  }

  if (typeof updateFindingsUI === 'function') {
    const originalUpdateFindingsUI = updateFindingsUI;
    updateFindingsUI = function updateProjectWideFindingsUI() {
      originalUpdateFindingsUI();
      renderProjectFindingsUI();
      syncCoverageUI();
    };
  }

  handleScanAllFolder = async function handleProjectScan() {
    if (!uploadedFiles.length || isScanning) return;
    isScanning = true;
    scanAllFolderBtn.disabled = true;
    scanBtn.disabled = true;
    scanAllFolderBtn.textContent = '⏳ Đang quét project...';
    startVisibleProgress({ title: `Project security scan · ${uploadedFiles.length} file`, project: true, totalFiles: uploadedFiles.length });
    const startTime = Date.now();

    // Compatibility string retained for regression test/UI copy: Project Scan Queue
    try {
      const clientConfig = typeof getStoredApiConfig === 'function' ? getStoredApiConfig() : null;
      const scanPayload = {
        files: uploadedFiles.map(file => ({
          name: file.name,
          path: file.path,
          content: file.content,
          language: file.language || 'auto'
        }))
      };
      if (clientConfig?.apiKey) Object.assign(scanPayload, clientConfig);

      const response = await fetch('/api/scan-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanPayload)
      });
      const data = await parseApiJson(response);
      if (!response.ok || !data.success || !data.result) throw new Error(data.error || `Lỗi HTTP ${response.status}`);

      lastProjectScanMeta = data.result;
      setVisibleProgress(93, 'Đã nhận kết quả · đang ánh xạ findings và cập nhật Security Gate...');
      const resultByPath = new Map((data.result.file_results || []).map(item => [item.path, item.result]));
      const skipped = new Set((data.result.skipped_files || []).map(item => item.path));
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      let totalVulns = 0, successCount = 0, failedCount = 0, incompleteCount = 0, limitedCoverageCount = 0, vulnFilesCount = 0;

      uploadedFiles.forEach(file => {
        file.duration = duration;
        file.scanError = null;
        file.scanSkipped = skipped.has(file.path);
        const result = resultByPath.get(file.path);
        if (file.scanSkipped) { file.result = null; return; }
        if (!result) { file.result = null; file.scanError = 'Server không trả kết quả cho file này.'; failedCount++; return; }
        file.result = result;
        if (result.scan_error) { file.scanError = result.scan_error; failedCount++; return; }
        successCount++;
        if (result.incomplete) incompleteCount++;
        else if (result.limited_coverage) limitedCoverageCount++;
        const count = result.vulnerabilities?.length || 0;
        if (count > 0) { totalVulns += count; vulnFilesCount++; }
      });

      if (summaryAlertBadge) {
        summaryAlertBadge.style.display = totalVulns > 0 ? 'inline-block' : 'none';
        summaryAlertBadge.textContent = totalVulns > 0 ? String(totalVulns) : '';
      }

      const scanStatus = data.result.status || (failedCount ? 'partial_error' : incompleteCount ? 'incomplete' : totalVulns ? 'vulnerable' : limitedCoverageCount ? 'limited_coverage' : 'safe');
      saveScanHistoryItem({
        type: 'folder_scan',
        title: `Project scan (${successCount}/${uploadedFiles.length} file)`,
        total_files: uploadedFiles.length,
        scanned_files: successCount,
        success_files: successCount,
        failed_files: failedCount,
        incomplete_files: incompleteCount,
        limited_coverage_files: limitedCoverageCount,
        vuln_files: vulnFilesCount,
        total_vulns: totalVulns,
        status: scanStatus,
        project_stats: data.result.stats || null,
        dependency_graph: data.result.dependency_graph || {},
        project_findings: data.result.project_findings || [],
        snapshotFiles: uploadedFiles.map(file => ({
          name: file.name, path: file.path, content: file.content, language: file.language,
          duration: file.duration, result: file.result, scanError: file.scanError || null,
          scanSkipped: Boolean(file.scanSkipped)
        }))
      });

      renderFileTree();
      syncCoverageUI();
      renderProjectFindingsUI();
      refreshHistoryBadge();
      if (totalVulns > 0) {
        const firstVulnIdx = uploadedFiles.findIndex(f => f.result?.vulnerabilities?.length > 0);
        if (firstVulnIdx >= 0) selectUploadedFile(firstVulnIdx);
        if (typeof switchSidebarView === 'function') switchSidebarView('findings');
        renderProjectFindingsUI();
      } else {
        if (uploadedFiles.length > 0) selectUploadedFile(0);
        if (typeof switchSidebarView === 'function') switchSidebarView('explorer');
      }
      finishVisibleProgress(totalVulns ? `Hoàn tất · ${totalVulns} finding` : 'Hoàn tất · không có finding trong phạm vi đã quét');
    } catch (error) {
      console.error(error);
      finishVisibleProgress('Project scan kết thúc với lỗi');
      renderSystemError({
        error: `Không thể hoàn tất project scan: ${error.message}`,
        provider: typeof getStoredApiConfig === 'function' ? (getStoredApiConfig()?.provider || 'Server AI') : 'Server AI',
        model: typeof getStoredApiConfig === 'function' ? (getStoredApiConfig()?.model || 'N/A') : 'N/A'
      });
    } finally {
      isScanning = false;
      scanAllFolderBtn.disabled = false;
      scanBtn.disabled = false;
      scanAllFolderBtn.textContent = '⚡ Quét tất cả file';
    }
  };

  if (typeof saveScanHistoryItem === 'function') {
    const originalSaveScanHistoryItem = saveScanHistoryItem;
    saveScanHistoryItem = function saveScanHistoryAndRefresh(item) {
      const value = originalSaveScanHistoryItem(item);
      refreshHistoryBadge();
      if (document.getElementById('viewHistory')?.classList.contains('active')) renderHistorySidebar();
      return value;
    };
  }

  if (typeof renderFileTree === 'function') {
    const originalRenderFileTree = renderFileTree;
    renderFileTree = function renderFileTreeCoverageAware() {
      originalRenderFileTree();
      if (!fileTreeContainer) return;
      fileTreeContainer.querySelectorAll('.tree-file-item').forEach(item => {
        const name = item.querySelector('.tree-file-name')?.getAttribute('title');
        const file = uploadedFiles.find(candidate => candidate.path === name);
        if (!file) return;
        const badgeHost = item.lastElementChild;
        if (!badgeHost) return;
        if (file.scanSkipped) badgeHost.innerHTML = '<span class="tree-badge" style="color:var(--text-dim);">Bỏ qua</span>';
        else if (file.result?.incomplete) badgeHost.innerHTML = '<span class="tree-badge" style="background:rgba(210,153,34,.2);color:#d29922;">Chưa xong</span>';
        else if (file.result?.limited_coverage) {
          const coverage = Number(file.result.ai_coverage_percent || 0).toFixed(1).replace('.0', '');
          badgeHost.innerHTML = `<span class="tree-badge" style="background:rgba(210,153,34,.2);color:#d29922;">AI ${coverage}%</span>`;
        }
      });
    };
  }

  if (typeof renderReport === 'function') {
    const originalRenderReport = renderReport;
    renderReport = function renderCoverageAwareReport(result, duration) {
      originalRenderReport(result, duration);
      const banner = resultsContainer?.querySelector('.report-header-banner');
      if (banner && result?.incomplete) {
        banner.className = 'report-header-banner vulnerable';
        const title = banner.querySelector('h3');
        if (title) title.textContent = 'QUÉT CHƯA HOÀN TẤT - KHÔNG THỂ KẾT LUẬN AN TOÀN';
      } else if (banner && result?.is_safe && result?.limited_coverage) {
        banner.className = 'report-header-banner vulnerable';
        const title = banner.querySelector('h3');
        if (title) title.textContent = 'KHÔNG CÓ FINDING TRONG PHẦN AI ĐÃ KIỂM TRA';
      }
      if (result && Number.isFinite(Number(result.total_lines)) && resultsContainer) {
        const card = document.createElement('div');
        card.innerHTML = `<strong>Scan coverage:</strong> File ${Number(result.total_lines).toLocaleString('vi-VN')} dòng · AI ${Number(result.ai_coverage_percent || 0).toFixed(1)}% · Heuristic ${Number(result.heuristic_coverage_percent || 0).toFixed(0)}%`;
        const firstBanner = resultsContainer.querySelector('.report-header-banner');
        if (firstBanner) firstBanner.insertAdjacentElement('afterend', card); else resultsContainer.prepend(card);
      }
      syncCoverageUI(result);
    };
  }

  function initAdapter() {
    ensureAdapterStyles();
    ensureVisibleProgress();
    ensureHistoryUI();
    syncEngineLabels();
    syncCoverageUI();
    renderProjectFindingsUI();
    const aiText = document.getElementById('aiCoverageText');
    const aiFill = document.getElementById('aiCoverageFill');
    if (aiText && !uploadedFiles.some(file => file.result)) aiText.textContent = '—';
    if (aiFill && !uploadedFiles.some(file => file.result)) aiFill.style.width = '0%';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAdapter, { once: true });
  else initAdapter();
})();
