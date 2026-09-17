/**
 * AI Security Code Reviewer & Web Scanner
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2025-2026 dtc245200494-hue & Contributors
 *
 * Licensed under the MIT License (OSI-approved).
 * See LICENSE file in the project root for full license information.
 */
// State
let samplesData = [];
let isScanning = false;
let uploadedFiles = []; // { name, path, content, language, result, duration }
let activeFileIndex = -1;
let currentViewMode = 'detail'; // 'detail' | 'summary' | 'history'

// LocalStorage History Key
const HISTORY_STORAGE_KEY = 'ai_security_scanner_history';

// DOM Elements
const mainLayout = document.getElementById('mainLayout');
const folderSidebar = document.getElementById('folderSidebar');
const fileTreeContainer = document.getElementById('fileTreeContainer');
const fileCountBadge = document.getElementById('fileCountBadge');
const fileSearchInput = document.getElementById('fileSearchInput');
const scanAllFolderBtn = document.getElementById('scanAllFolderBtn');

const currentFileTitle = document.getElementById('currentFileTitle');
const fileModifiedBadge = document.getElementById('fileModifiedBadge');
const codeEditor = document.getElementById('codeEditor');
const codeViewer = document.getElementById('codeViewer');
const monacoEditorContainer = document.getElementById('monacoEditorContainer');
const problemsPanel = document.getElementById('problemsPanel');
const problemsBadge = document.getElementById('problemsBadge');
const problemsList = document.getElementById('problemsList');
const reScanCurrentBtn = document.getElementById('reScanCurrentBtn');

let monacoInstance = null;
let monacoDecorations = [];
let isEditorModified = false;
let isMonacoLoaded = false;

const languageSelect = document.getElementById('languageSelect');
const sampleChips = document.getElementById('sampleChips');
const scanBtn = document.getElementById('scanBtn');
const clearBtn = document.getElementById('clearBtn');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');

const lineCount = document.getElementById('lineCount');
const charCount = document.getElementById('charCount');
const toggleEditBtn = document.getElementById('toggleEditBtn');
const toggleEditText = document.getElementById('toggleEditText');
const exportCodeBtn = document.getElementById('exportCodeBtn');
const exportReportBtn = document.getElementById('exportReportBtn');
let isEditMode = false;
let currentActiveReport = null; // Lưu báo cáo hiện tại để xuất file

const resultsContainer = document.getElementById('resultsContainer');
const aiStatusBadge = document.getElementById('aiStatusBadge');
const resultMeta = document.getElementById('resultMeta');

const tabDetailView = document.getElementById('tabDetailView');
const tabSummaryView = document.getElementById('tabSummaryView');
const tabHistoryView = document.getElementById('tabHistoryView');
const summaryAlertBadge = document.getElementById('summaryAlertBadge');
const historyCountBadge = document.getElementById('historyCountBadge');

// Git Modal Elements
const openGitModalBtn = document.getElementById('openGitModalBtn');
const gitModal = document.getElementById('gitModal');
const closeGitModalBtn = document.getElementById('closeGitModalBtn');
const cancelGitBtn = document.getElementById('cancelGitBtn');
const submitGitBtn = document.getElementById('submitGitBtn');
const gitRepoUrl = document.getElementById('gitRepoUrl');
const gitFolderInput = document.getElementById('gitFolderInput');
const gitTokenInput = document.getElementById('gitTokenInput');

// Guide Modal Elements
const viewGuideBtn = document.getElementById('viewGuideBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const guideModal = document.getElementById('guideModal');

// API Key Modal Elements & Storage
const API_CONFIG_STORAGE_KEY = 'ai_security_scanner_apiconfig';
const openApiKeyModalBtn = document.getElementById('openApiKeyModalBtn');
const apiKeyModal = document.getElementById('apiKeyModal');
const closeApiKeyModalBtn = document.getElementById('closeApiKeyModalBtn');
const keyProviderSelect = document.getElementById('keyProviderSelect');
const keyCardsContainer = document.getElementById('keyCardsContainer');
const addKeyCardBtn = document.getElementById('addKeyCardBtn');
const modelHintText = document.getElementById('modelHintText');
const apiModelInput = document.getElementById('apiModelInput');
const apiKeyHelpLink = document.getElementById('apiKeyHelpLink');
const apiKeyTestStatus = document.getElementById('apiKeyTestStatus');
const testApiKeyBtn = document.getElementById('testApiKeyBtn');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const clearApiKeyBtn = document.getElementById('clearApiKeyBtn');

const EXT_TO_LANG = {
  'py': 'python',
  'js': 'javascript',
  'jsx': 'javascript',
  'ts': 'typescript',
  'tsx': 'typescript',
  'php': 'php',
  'java': 'java',
  'go': 'go',
  'cs': 'csharp',
  'sql': 'sql',
  'c': 'c',
  'cpp': 'cpp',
  'rb': 'ruby',
  'sh': 'bash',
  'html': 'html',
  'htm': 'html',
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'db': 'sql',
  'sqlite': 'sql',
  'sqlite3': 'sql'
};

const CODE_EXTENSIONS = new Set([
  'py', 'js', 'jsx', 'ts', 'tsx', 'php', 'java', 'go', 'cs', 'sql', 'c', 'cpp', 'rb', 'sh', 'html', 'htm', 'json', 'yaml', 'yml', 'db', 'sqlite', 'sqlite3'
]);

function getMonacoLanguage(lang) {
  if (!lang || lang === 'auto') return 'javascript';
  const map = {
    'python': 'python',
    'javascript': 'javascript',
    'typescript': 'typescript',
    'php': 'php',
    'java': 'java',
    'go': 'go',
    'csharp': 'csharp',
    'sql': 'sql',
    'html': 'html',
    'c': 'c',
    'cpp': 'cpp',
    'ruby': 'ruby',
    'bash': 'shell',
    'json': 'json',
    'yaml': 'yaml'
  };
  return map[lang.toLowerCase()] || 'plaintext';
}

function getEditorCode() {
  if (isMonacoLoaded && monacoInstance) {
    return monacoInstance.getValue();
  }
  return codeEditor ? codeEditor.value : '';
}

function setEditorCode(code, lang) {
  const content = code || '';
  if (codeEditor) codeEditor.value = content;
  if (isMonacoLoaded && monacoInstance) {
    monacoInstance.setValue(content);
    if (lang) {
      const monacoLang = getMonacoLanguage(lang);
      const model = monacoInstance.getModel();
      if (model && window.monaco) {
        window.monaco.editor.setModelLanguage(model, monacoLang);
      }
    }
  }
  setFileModifiedState(false);
  updateEditorStats();
}

function setFileModifiedState(isModified) {
  isEditorModified = isModified;
  if (fileModifiedBadge) {
    fileModifiedBadge.style.display = isModified ? 'inline-block' : 'none';
  }
  if (reScanCurrentBtn) {
    reScanCurrentBtn.style.display = (isModified && currentActiveReport) ? 'inline-flex' : 'none';
  }
  if (isModified && isMonacoLoaded && currentActiveReport && currentActiveReport.vulnerabilities) {
    updateMonacoDecorations(currentActiveReport.vulnerabilities, true);
    renderProblemsPanel(currentActiveReport.vulnerabilities, true);
  }
}

function fallbackToTextarea() {
  isMonacoLoaded = false;
  if (monacoEditorContainer) monacoEditorContainer.style.display = 'none';
  if (codeEditor) codeEditor.style.display = 'block';
}

function initMonacoEditor() {
  const container = document.getElementById('monacoEditorContainer');
  if (!container) return;

  if (typeof window.require !== 'undefined') {
    try {
      window.require.config({
        paths: {
          vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs'
        }
      });

      window.require(['vs/editor/editor.main'], function () {
        if (!window.monaco || !window.monaco.editor) {
          fallbackToTextarea();
          return;
        }
        isMonacoLoaded = true;
        monacoInstance = window.monaco.editor.create(container, {
          value: codeEditor ? codeEditor.value : '',
          language: getMonacoLanguage(languageSelect ? languageSelect.value : 'auto'),
          theme: 'vs-dark',
          automaticLayout: true,
          fontSize: 13,
          fontFamily: "'Fira Code', Consolas, 'Courier New', monospace",
          fontLigatures: true,
          minimap: { enabled: true, renderCharacters: false },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderLineHighlight: 'all',
          glyphMargin: true,
          readOnly: false,
          roundedSelection: true,
          cursorBlinking: 'smooth',
          overviewRulerBorder: false,
          wordWrap: 'on'
        });

        monacoInstance.onDidChangeModelContent(() => {
          const val = monacoInstance.getValue();
          if (codeEditor) codeEditor.value = val;
          if (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]) {
            uploadedFiles[activeFileIndex].content = val;
          }
          updateEditorStats();
          setFileModifiedState(true);
        });

        monacoInstance.onDidChangeCursorPosition((e) => {
          const line = e.position.lineNumber;
          const col = e.position.column;
          const cursorPosElem = document.getElementById('editorCursorPos');
          if (cursorPosElem) cursorPosElem.textContent = `Ln ${line}, Col ${col}`;
          const bcLine = document.getElementById('breadcrumbLineNumber');
          if (bcLine) bcLine.textContent = line;
        });

        monacoInstance.onMouseDown((e) => {
          if (window.monaco && e.target && e.target.type === window.monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
            const line = e.target.position?.lineNumber;
            if (line && Array.isArray(activeFindingList) && activeFindingList.length) {
              const foundIdx = activeFindingList.findIndex(v => (v.start_line || v.line_number || 1) === line);
              if (foundIdx >= 0) {
                selectVulnerability(foundIdx);
              }
            }
          }
        });

        if (codeEditor) codeEditor.style.display = 'none';
        if (codeViewer) codeViewer.style.display = 'none';
      }, function (err) {
        console.warn('Monaco load failed, falling back:', err);
        fallbackToTextarea();
      });
    } catch (e) {
      console.warn('Error loading Monaco config:', e);
      fallbackToTextarea();
    }
  } else {
    fallbackToTextarea();
  }
}

function updateMonacoDecorations(vulnerabilities = [], isDimmed = false) {
  if (!isMonacoLoaded || !monacoInstance || !window.monaco) return;
  try {
    const model = monacoInstance.getModel();
    if (!model) return;

    const totalLines = model.getLineCount();
    const newDecorations = [];
    const filePath = (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]?.path) || 'current';

    vulnerabilities.forEach((v, idx) => {
      let startLine = Number.parseInt(v.start_line || v.line_number, 10);
      if (!Number.isFinite(startLine) || startLine < 1) startLine = 1;
      if (startLine > totalLines) startLine = totalLines;

      let endLine = Number.parseInt(v.end_line || startLine, 10);
      if (!Number.isFinite(endLine) || endLine < startLine) endLine = startLine;
      if (endLine > totalLines) endLine = totalLines;

      const startCol = 1;
      const endCol = model.getLineMaxColumn(endLine);

      const sev = (v.severity || 'Cao').toLowerCase();
      let sevKey = 'high';
      if (sev.includes('nghiêm trọng') || sev.includes('critical')) sevKey = 'critical';
      else if (sev.includes('thấp') || sev.includes('low')) sevKey = 'low';
      else if (sev.includes('trung') || sev.includes('medium')) sevKey = 'medium';

      const st = (typeof getFindingState === 'function') ? getFindingState(v, filePath) : 'open';
      if (st === 'fixed' || st === 'ignored') {
        return; // Không bôi đỏ lỗi đã fix hoặc đã bỏ qua
      }

      const className = isDimmed ? `monaco-squiggly-${sevKey} monaco-vuln-range-dimmed` : `monaco-squiggly-${sevKey}`;

      const mdText = `🛡️ **[${v.severity || 'Cao'}] ${v.type || 'Lỗ hổng bảo mật'}**\n\n`
        + `- **Tiêu chuẩn**: \`${v.owasp_category || 'OWASP Top 10:2025'}\` | \`${v.cwe || 'CWE'}\`\n`
        + `- **Độ tin cậy**: ${v.confidence || 'Cao'}\n\n`
        + (v.explanation ? `**Cơ chế:** ${v.explanation}\n\n` : '')
        + (v.remediation ? `💡 **Khắc phục:** ${v.remediation}\n\n` : '')
        + `⚡ *Nhấp biểu tượng ở lề hoặc bấm F8 để mở chi tiết & Áp dụng Quick Fix tự động.*`;

      const hoverMessage = {
        value: mdText,
        isTrusted: true
      };

      const rangeObj = (window.monaco.Range && typeof window.monaco.Range === 'function')
        ? new window.monaco.Range(startLine, startCol, endLine, endCol)
        : { startLineNumber: startLine, startColumn: startCol, endLineNumber: endLine, endColumn: endCol };

      newDecorations.push({
        range: rangeObj,
        options: {
          isWholeLine: true,
          className: className,
          glyphMarginClassName: `monaco-vuln-gutter-${sevKey}`,
          hoverMessage: hoverMessage,
          overviewRuler: {
            color: sevKey === 'critical' ? '#f85149' : (sevKey === 'medium' ? '#d29922' : (sevKey === 'low' ? '#3fb950' : '#ff7b72')),
            position: window.monaco.editor?.OverviewRulerLane?.Right || 2
          }
        }
      });
    });

    monacoDecorations = monacoInstance.deltaDecorations(monacoDecorations, newDecorations);
  } catch (err) {
    console.warn('Lỗi khi cập nhật decorations trên Monaco Editor:', err);
  }
}

function revealVulnerabilityInEditor(vuln) {
  if (!vuln) return;
  const line = Number.parseInt(vuln.start_line || vuln.line_number, 10) || 1;

  if (isMonacoLoaded && monacoInstance) {
    monacoInstance.revealLineInCenter(line);
    monacoInstance.setPosition({ lineNumber: line, column: 1 });
    monacoInstance.focus();
  } else {
    scrollToCodeLine(line);
  }
}

function renderProblemsPanel(vulnerabilities = [], isDimmed = false) {
  if (!problemsPanel || !problemsList) return;
  const count = vulnerabilities.length;
  if (problemsBadge) problemsBadge.textContent = count;

  if (count === 0) {
    problemsList.innerHTML = '<div class="problems-empty" style="padding:10px 14px;color:var(--text-dim);font-size:0.8rem;">Chưa có phát hiện bảo mật nào trong file này.</div>';
    return;
  }

  let html = '';
  const filePath = (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]?.path) || 'source_code';
  const fileName = filePath.split('/').pop().split('\\').pop();

  vulnerabilities.forEach((v, idx) => {
    const sev = (v.severity || 'Cao').toLowerCase();
    let sevKey = 'high';
    let sevSlug = 'cao';
    if (sev.includes('nghiêm trọng') || sev.includes('critical')) {
      sevKey = 'critical';
      sevSlug = 'nghiêm-trọng';
    } else if (sev.includes('thấp') || sev.includes('low')) {
      sevKey = 'low';
      sevSlug = 'thấp';
    } else if (sev.includes('trung') || sev.includes('medium')) {
      sevKey = 'medium';
      sevSlug = 'trung-bình';
    }

    const startLine = v.start_line || v.line_number || 1;
    const endLine = v.end_line || startLine;
    const lineLabel = startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`;
    const st = (typeof getFindingState === 'function') ? getFindingState(v, filePath) : 'open';

    html += `
      <div class="problems-row" data-vuln-index="${idx}" onclick="selectVulnerability(${idx})" title="Bấm để xem chi tiết và fix lỗi">
        <div class="problems-col-sev">
          <span class="vuln-badge-severity severity-${sevSlug}" style="font-size:0.68rem;padding:1px 6px;">${escapeHtml(v.severity || 'Cao')}</span>
        </div>
        <div class="problems-col-rule">
          <strong>${escapeHtml(v.type || 'Lỗ hổng')}</strong>: ${escapeHtml(v.cwe || 'CWE')} - ${escapeHtml(v.owasp_category || 'OWASP')}
        </div>
        <div class="problems-col-file">${escapeHtml(fileName)}:${startLine}</div>
        <div class="problems-col-status">
          <span style="font-size:0.72rem;">${st === 'open' ? '🔴 Open' : (st === 'fixed' ? '✅ Fixed' : '⏸️ Ignored')}</span>
        </div>
      </div>
    `;
  });

  problemsList.innerHTML = html;
}


function renderSystemError(info) {
  const errMessage = typeof info === 'string' ? info : (info.error || info.message || 'Lỗi không xác định');
  const provider = info.provider || 'AI Provider';
  const model = info.model || 'N/A';
  const status = info.status ? `HTTP ${info.status}` : 'Kết nối thất bại';

  resultsContainer.innerHTML = `
    <div class="system-error-card">
      <div class="system-error-title">
        <span>⚠️ LỖI HỆ THỐNG / KẾT NỐI API</span>
      </div>
      <div class="system-error-meta">
        <strong>Trạng thái:</strong> ${escapeHtml(status)} | <strong>Provider:</strong> ${escapeHtml(provider)} | <strong>Model:</strong> ${escapeHtml(model)}
      </div>
      <p style="font-size: 0.85rem; color: var(--text-main); margin-bottom: 6px;">
        Không thể hoàn tất quá trình rà soát bảo mật do sự cố đường truyền hoặc dịch vụ AI từ chối yêu cầu.
      </p>
      <div class="system-error-pre">${escapeHtml(errMessage)}</div>
      <div style="margin-top: 12px; font-size: 0.8rem; color: var(--text-muted);">
        💡 <strong>Khuyến nghị khắc phục:</strong>
        <ul style="padding-left: 18px; margin-top: 4px;">
          <li>Kiểm tra lại tính hợp lệ của API Key trong cấu hình 🔑 API Key.</li>
          <li>Nếu gặp lỗi Quota/Rate Limit (429) hoặc 403 (Console Free Tier), vui lòng chuyển sang model khác hoặc thêm API Key dự phòng.</li>
          <li>File hiện tại <strong>CHƯA ĐƯỢC XÁC NHẬN AN TOÀN</strong>. Vui lòng bấm quét lại sau khi kiểm tra kết nối.</li>
        </ul>
      </div>
    </div>
  `;
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  initMonacoEditor();
  fetchServerStatus();
  fetchSamples();
  setupEventListeners();
  updateEditorStats();
  updateHistoryBadge();
});

// History Manager (Lưu và tải từ LocalStorage)
function getScanHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveScanHistoryItem(item) {
  try {
    const history = getScanHistory();
    // Giữ tối đa 30 lần quét gần nhất
    history.unshift({
      id: 'scan_' + Date.now(),
      timestamp: new Date().toISOString(),
      ...item
    });
    if (history.length > 30) history.pop();

    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (quotaErr) {
      console.warn('LocalStorage quota reached, pruning source code content from snapshots...', quotaErr);
      // Khi vượt quota trình duyệt, cắt tỉa source content để giữ lại thông tin báo cáo
      const lightHistory = history.map(h => {
        if (!h.snapshotFiles) return h;
        return {
          ...h,
          code: (h.code && h.code.length > 3000) ? h.code.slice(0, 3000) + '\n...[cắt bớt do dung lượng bộ nhớ]' : h.code,
          snapshotFiles: h.snapshotFiles.map(sf => ({
            name: sf.name,
            path: sf.path,
            language: sf.language,
            duration: sf.duration,
            result: sf.result,
            scanError: sf.scanError
          }))
        };
      });
      while (lightHistory.length > 15) lightHistory.pop();
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(lightHistory));
      } catch (innerErr) {
        // Nếu vẫn không đủ dung lượng, chỉ giữ 5 bản ghi mới nhất không có snapshot
        const minimalHistory = lightHistory.slice(0, 5).map(h => ({
          ...h,
          code: '',
          snapshotFiles: []
        }));
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(minimalHistory));
      }
    }
    updateHistoryBadge();
  } catch (e) {
    console.error('Không thể lưu lịch sử quét:', e);
  }
}

function updateHistoryBadge() {
  const history = getScanHistory();
  if (historyCountBadge) {
    historyCountBadge.textContent = history.length;
  }
}

function clearAllHistory() {
  if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử quét?')) {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    updateHistoryBadge();
    renderHistoryDashboard();
  }
}

// Quản lý cấu hình API Key lưu tại LocalStorage
function getStoredApiConfig() {
  try {
    const raw = localStorage.getItem(API_CONFIG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveStoredApiConfig(config) {
  try {
    localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Không thể lưu API config:', e);
  }
}

function clearStoredApiConfig() {
  localStorage.removeItem(API_CONFIG_STORAGE_KEY);
}

// Kiểm tra trạng thái kết nối backend & cập nhật badge theo key của client (nếu có)
async function fetchServerStatus() {
  const clientConfig = getStoredApiConfig();

  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    if (clientConfig && clientConfig.apiKey) {
      aiStatusBadge.className = 'status-badge online';
      const provName = clientConfig.provider === 'openai' ? 'OpenAI' : 'Groq AI';
      aiStatusBadge.querySelector('.status-text').textContent = `AI Online (${provName} Custom)`;
      aiStatusBadge.title = `Đang sử dụng API Key người dùng: ${clientConfig.model || 'Default model'}`;
    } else if (data.ai_configured) {
      aiStatusBadge.className = 'status-badge online';
      aiStatusBadge.querySelector('.status-text').textContent = `AI Online (${data.model})`;
      aiStatusBadge.title = `Server AI Configured (${data.provider})`;
    } else {
      aiStatusBadge.className = 'status-badge warning';
      aiStatusBadge.querySelector('.status-text').textContent = 'Heuristic Mode (Mô phỏng sẵn)';
      aiStatusBadge.title = 'Bấm "🔑 API Key" ở thanh trên để thêm API Key AI thật!';
    }
  } catch (err) {
    aiStatusBadge.className = 'status-badge';
    aiStatusBadge.querySelector('.status-text').textContent = 'Offline';
  }
}

// Lấy danh sách mẫu code (nếu có thanh mẫu)
async function fetchSamples() {
  if (!sampleChips) return;
  try {
    const res = await fetch('/api/samples');
    const data = await res.json();
    samplesData = data.samples || [];
    renderSampleChips();
  } catch (err) {
    if (sampleChips) sampleChips.innerHTML = '<span style="color:#f85149;font-size:0.8rem;">Lỗi tải mẫu</span>';
  }
}

// Render chip các mẫu thử (nếu có thanh mẫu)
function renderSampleChips() {
  if (!sampleChips) return;
  sampleChips.innerHTML = '';
  samplesData.forEach(sample => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = sample.name;
    chip.title = `${sample.category} - ${sample.description}`;
    chip.addEventListener('click', () => loadSample(sample, chip));
    sampleChips.appendChild(chip);
  });
}

// Nạp mẫu vào Editor
function loadSample(sample, activeChip) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (activeChip) activeChip.classList.add('active');

  currentFileTitle.textContent = `Mẫu: ${sample.name}`;
  languageSelect.value = sample.language || 'auto';
  setEditorCode(sample.code, sample.language || 'auto');
  switchViewTab('detail');
  resetResults();
  if (isMonacoLoaded && monacoInstance) {
    monacoInstance.focus();
  } else if (codeEditor) {
    codeEditor.focus();
  }
}

// Cập nhật số dòng & ký tự
function updateEditorStats() {
  const text = getEditorCode();
  const lines = text ? text.split('\n').length : 0;
  lineCount.textContent = lines;
  charCount.textContent = text.length;
}

// Xử lý nạp danh sách file từ fileInput hoặc folderInput
async function handleFilesSelected(fileList) {
  const filesArray = Array.from(fileList);
  if (!filesArray.length) return;

  const filtered = filesArray.filter(f => {
    const p = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
    if (p.includes('/node_modules/') || p.startsWith('node_modules/') ||
        p.includes('/.git/') || p.startsWith('.git/') ||
        p.includes('/dist/') || p.startsWith('dist/') ||
        p.includes('/build/') || p.startsWith('build/') ||
        p.includes('/.idea/') || p.startsWith('.idea/')) {
      return false;
    }
    const parts = f.name.split('.');
    if (parts.length < 2) return false;
    const ext = parts.pop().toLowerCase();
    return CODE_EXTENSIONS.has(ext);
  });

  if (!filtered.length) {
    alert('Không tìm thấy file mã nguồn phù hợp (.js, .ts, .py, .php, .java, .go, .sql,...) trong thư mục đã chọn.');
    return;
  }

  uploadedFiles = [];
  for (const file of filtered) {
    try {
      const content = await file.text();
      const ext = file.name.split('.').pop().toLowerCase();
      const lang = EXT_TO_LANG[ext] || 'auto';
      uploadedFiles.push({
        name: file.name,
        path: (file.webkitRelativePath || file.name).replace(/\\/g, '/'),
        content,
        language: lang,
        result: null
      });
    } catch (err) {
      console.warn('Không thể đọc nội dung file:', file.name, err);
    }
  }

  if (uploadedFiles.length === 0) {
    alert('Không thể nạp nội dung của các file đã chọn.');
    return;
  }

  setupFolderView(`${uploadedFiles.length} file`);
}

function setupFolderView(badgeText) {
  if (fileCountBadge) fileCountBadge.textContent = badgeText;
  if (folderSidebar) folderSidebar.style.display = 'flex';
  if (mainLayout) mainLayout.classList.add('has-sidebar');
  if (tabSummaryView) tabSummaryView.style.display = 'flex';

  // Chuyển ngay sang Explorer tab và mở sidebar nếu đang đóng
  if (typeof switchSidebarView === 'function') {
    switchSidebarView('explorer');
  }
  if (typeof togglePrimarySidebar === 'function') {
    togglePrimarySidebar(false);
  }

  renderFileTree();
  selectUploadedFile(0);
}

// Render cây thư mục / danh sách file
function renderFileTree() {
  const searchTerm = fileSearchInput ? fileSearchInput.value.trim().toLowerCase() : '';
  fileTreeContainer.innerHTML = '';

  uploadedFiles.forEach((file, index) => {
    if (searchTerm && !file.path.toLowerCase().includes(searchTerm)) {
      return;
    }

    const item = document.createElement('div');
    item.className = `tree-file-item ${index === activeFileIndex ? 'active' : ''}`;
    
    let badgeHtml = '';
    if (file.scanError) {
      badgeHtml = `<span class="tree-badge vuln" style="background: rgba(248, 81, 73, 0.2); color: #ff7b72;">Lỗi</span>`;
    } else if (file.result) {
      if (file.result.incomplete) {
        badgeHtml = `<span class="tree-badge" style="background: rgba(210, 153, 34, 0.2); color: #d29922;">Chưa xong</span>`;
      } else if (file.result.is_safe) {
        badgeHtml = `<span class="tree-badge safe">Clean</span>`;
      } else {
        const count = file.result.vulnerabilities ? file.result.vulnerabilities.length : 1;
        badgeHtml = `<span class="tree-badge vuln">${count} Lỗi</span>`;
      }
    }

    item.innerHTML = `
      <div class="tree-file-info">
        <span>📄</span>
        <span class="tree-file-name" title="${escapeHtml(file.path)}">${escapeHtml(file.path)}</span>
      </div>
      <div>${badgeHtml}</div>
    `;

    item.addEventListener('click', () => {
      selectUploadedFile(index);
    });

    fileTreeContainer.appendChild(item);
  });
}

// Chọn file cụ thể để xem và sửa
function selectUploadedFile(index) {
  if (index < 0 || index >= uploadedFiles.length) return;
  activeFileIndex = index;
  const file = uploadedFiles[index];

  currentFileTitle.textContent = file.path;
  const fileName = (file.path || file.name || 'file').split('/').pop().split('\\').pop();
  const bcName = document.getElementById('breadcrumbFileName');
  if (bcName) bcName.textContent = fileName;
  const bcLine = document.getElementById('breadcrumbLineNumber');
  if (bcLine) bcLine.textContent = '1';

  languageSelect.value = file.language || 'auto';
  setEditorCode(file.content, file.language || 'auto');
  renderFileTree();

  switchViewTab('detail');

  if (file.result) {
    renderReport(file.result, file.duration || '0.1');
  } else {
    resetResults();
    if (!isMonacoLoaded) {
      renderCodeViewerWithHighlights(file.content, []);
    }
  }
}

// Chuyển đổi giữa các tab: Chi tiết file | Tổng quan thư mục | Lịch sử quét
function switchViewTab(mode) {
  currentViewMode = mode;
  tabDetailView.classList.remove('active');
  tabSummaryView.classList.remove('active');
  tabHistoryView.classList.remove('active');

  if (mode === 'detail') {
    tabDetailView.classList.add('active');
    if (activeFileIndex >= 0 && uploadedFiles[activeFileIndex] && uploadedFiles[activeFileIndex].result) {
      renderReport(uploadedFiles[activeFileIndex].result, uploadedFiles[activeFileIndex].duration || '0.1');
    } else {
      resetResults();
    }
  } else if (mode === 'summary') {
    tabSummaryView.classList.add('active');
    renderFolderSummaryDashboard();
  } else if (mode === 'history') {
    tabHistoryView.classList.add('active');
    renderHistoryDashboard();
  }
}

// Xử lý sự kiện
function setupEventListeners() {
  codeEditor.addEventListener('input', () => {
    updateEditorStats();
    if (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]) {
      uploadedFiles[activeFileIndex].content = codeEditor.value;
    }
    setFileModifiedState(true);
  });

  languageSelect.addEventListener('change', () => {
    if (isMonacoLoaded && monacoInstance) {
      const monacoLang = getMonacoLanguage(languageSelect.value);
      const model = monacoInstance.getModel();
      if (model && window.monaco) {
        window.monaco.editor.setModelLanguage(model, monacoLang);
      }
    }
  });

  if (reScanCurrentBtn) {
    reScanCurrentBtn.addEventListener('click', handleScan);
  }

  if (fileSearchInput) {
    fileSearchInput.addEventListener('input', renderFileTree);
  }

  tabDetailView.addEventListener('click', () => switchViewTab('detail'));
  tabSummaryView.addEventListener('click', () => switchViewTab('summary'));
  tabHistoryView.addEventListener('click', () => switchViewTab('history'));

  clearBtn.addEventListener('click', () => {
    setEditorCode('', 'javascript');
    uploadedFiles = [];
    activeFileIndex = -1;
    if (folderSidebar) folderSidebar.style.display = 'none';
    if (mainLayout) mainLayout.classList.remove('has-sidebar');
    if (tabSummaryView) tabSummaryView.style.display = 'none';
    if (fileCountBadge) fileCountBadge.textContent = '0 file';
    if (currentFileTitle) currentFileTitle.textContent = 'Mã nguồn cần quét';
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    renderFileTree();
    switchViewTab('detail');
    resetResults();
  });

  // Nút bấm kích hoạt mở File / Thư mục dự án
  document.getElementById('btnTriggerFileUpload')?.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  document.getElementById('btnTriggerFolderUpload')?.addEventListener('click', () => {
    folderInput.value = '';
    folderInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
    }
  });

  folderInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
    }
  });

  scanBtn.addEventListener('click', handleScan);
  scanAllFolderBtn.addEventListener('click', handleScanAllFolder);

  // Bật / Tắt chế độ Chỉnh sửa mã nguồn / Định dạng
  if (toggleEditBtn) {
    toggleEditBtn.addEventListener('click', () => {
      if (isMonacoLoaded && monacoInstance) {
        monacoInstance.focus();
        const action = monacoInstance.getAction('editor.action.formatDocument');
        if (action) {
          action.run();
        }
      } else {
        isEditMode = !isEditMode;
        if (isEditMode) {
          codeEditor.style.display = 'block';
          codeViewer.style.display = 'none';
          toggleEditBtn.classList.add('active-edit');
          if (toggleEditText) toggleEditText.textContent = 'Đang sửa';
          codeEditor.focus();
        } else {
          toggleEditBtn.classList.remove('active-edit');
          if (toggleEditText) toggleEditText.textContent = 'Chỉnh sửa';
          if (currentActiveReport && currentActiveReport.vulnerabilities) {
            renderCodeViewerWithHighlights(codeEditor.value, currentActiveReport.vulnerabilities);
          } else {
            renderCodeViewerWithHighlights(codeEditor.value, []);
          }
        }
      }
    });
  }

  // Xuất file mã nguồn hiện tại về máy (.js, .py, .php, .html,...)
  if (exportCodeBtn) {
    exportCodeBtn.addEventListener('click', () => {
      const code = getEditorCode();
      if (!code || !code.trim()) {
        alert('Không có nội dung mã nguồn để xuất file.');
        return;
      }

      // Xác định tên file phù hợp
      let filename = 'source_code';
      if (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]) {
        const fullPath = uploadedFiles[activeFileIndex].path || uploadedFiles[activeFileIndex].name;
        filename = fullPath.split('/').pop().split('\\').pop();
      } else {
        const lang = languageSelect.value || 'javascript';
        const extMap = {
          'javascript': 'js',
          'python': 'py',
          'html': 'html',
          'php': 'php',
          'java': 'java',
          'sql': 'sql',
          'typescript': 'ts',
          'go': 'go',
          'csharp': 'cs'
        };
        const ext = extMap[lang] || 'txt';
        filename = `fixed_code_${Date.now()}.${ext}`;
      }

      downloadBlobFile(code, filename, 'text/plain;charset=utf-8');
    });
  }

  // Xuất Báo cáo Bảo mật (Markdown & JSON)
  if (exportReportBtn) {
    exportReportBtn.addEventListener('click', () => {
      if (!currentActiveReport) {
        alert('Chưa có dữ liệu báo cáo để xuất.');
        return;
      }
      exportSecurityReport();
    });
  }

  // GitHub Modal Events
  openGitModalBtn.addEventListener('click', () => {
    gitModal.classList.add('active');
    gitModal.style.display = 'flex';
    gitRepoUrl.focus();
  });

  closeGitModalBtn.addEventListener('click', () => {
    gitModal.classList.remove('active');
    gitModal.style.display = 'none';
  });

  cancelGitBtn.addEventListener('click', () => {
    gitModal.classList.remove('active');
    gitModal.style.display = 'none';
  });

  submitGitBtn.addEventListener('click', handleFetchAndScanGit);

  gitModal.addEventListener('click', (e) => {
    if (e.target === gitModal) {
      gitModal.classList.remove('active');
      gitModal.style.display = 'none';
    }
  });

  // Guide Modal Events
  viewGuideBtn.addEventListener('click', () => {
    guideModal.classList.add('active');
    guideModal.style.display = 'flex';
  });

  closeModalBtn.addEventListener('click', () => {
    guideModal.classList.remove('active');
    guideModal.style.display = 'none';
  });

  guideModal.addEventListener('click', (e) => {
    if (e.target === guideModal) {
      guideModal.classList.remove('active');
      guideModal.style.display = 'none';
    }
  });

  // API Key Modal Events
  openApiKeyModalBtn.addEventListener('click', () => {
    loadApiKeyModalState();
    apiKeyModal.classList.add('active');
    apiKeyModal.style.display = 'flex';
    if (keyProviderSelect) keyProviderSelect.focus();
  });

  closeApiKeyModalBtn.addEventListener('click', () => {
    apiKeyModal.classList.remove('active');
    apiKeyModal.style.display = 'none';
  });

  apiKeyModal.addEventListener('click', (e) => {
    if (e.target === apiKeyModal) {
      apiKeyModal.classList.remove('active');
      apiKeyModal.style.display = 'none';
    }
  });

  keyProviderSelect.addEventListener('change', () => {
    const prov = keyProviderSelect.value;
    updateProviderHints(prov);
  });

  addKeyCardBtn.addEventListener('click', () => {
    createKeyCard('');
  });

  testApiKeyBtn.addEventListener('click', handleTestApiKey);
  saveApiKeyBtn.addEventListener('click', handleSaveApiKey);
  clearApiKeyBtn.addEventListener('click', handleClearApiKey);
}

// Cập nhật gợi ý model và link đăng ký theo loại AI
function updateProviderHints(prov) {
  if (prov === 'opencode') {
    apiKeyHelpLink.innerHTML = '<a href="https://opencode.ai" target="_blank" style="color: #58a6ff; text-decoration: underline;">Lấy API key OpenCode.ai miễn phí</a>';
    apiModelInput.placeholder = 'deepseek-v4-flash-free';
    modelHintText.innerHTML = `
      <div style="line-height:1.8;">
        🆓 <strong>Free Models:</strong><br>
        <code>deepseek-v4-flash-free</code> · <code>muse-spark-1.3-contributor-free</code> · <code>muse-spark-1.2-contributor-free</code><br>
        <code>nemotron-3-ultra-free</code> · <code>nemotron-3.5-lightning-free</code> · <code>mimo-v2.5-free</code> · <code>ling-3.0-flash-fin-free</code>
      </div>`;
    if (!apiModelInput.value || ['openai/gpt-oss-120b','openai/gpt-oss-20b','gpt-4o-mini','gemini-1.5-flash','deepseek-chat'].includes(apiModelInput.value)) {
      apiModelInput.value = 'deepseek-v4-flash-free';
    }
  } else if (prov === 'groq') {
    apiKeyHelpLink.innerHTML = '<a href="https://console.groq.com/keys" target="_blank" style="color: #58a6ff; text-decoration: underline;">Lấy API key Groq miễn phí</a>';
    apiModelInput.placeholder = 'llama-3.3-70b-versatile';
    modelHintText.innerHTML = 'Gợi ý Groq: <code>llama-3.3-70b-versatile</code>, <code>llama-3.1-8b-instant</code>, <code>mixtral-8x7b-32768</code>';
    if (!apiModelInput.value || ['openai/gpt-oss-120b','openai/gpt-oss-20b'].includes(apiModelInput.value)) {
      apiModelInput.value = 'llama-3.3-70b-versatile';
    }
  } else if (prov === 'gemini') {
    apiKeyHelpLink.innerHTML = '<a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: #58a6ff; text-decoration: underline;">Lấy Gemini API Key miễn phí (Google AI Studio)</a>';
    apiModelInput.placeholder = 'gemini-1.5-flash';
    modelHintText.innerHTML = 'Gợi ý Google: <code>gemini-1.5-flash</code> (siêu nhanh, miễn phí), <code>gemini-1.5-pro</code>';
    apiModelInput.value = 'gemini-1.5-flash';
  } else if (prov === 'deepseek') {
    apiKeyHelpLink.innerHTML = '<a href="https://platform.deepseek.com/api_keys" target="_blank" style="color: #58a6ff; text-decoration: underline;">Lấy API Key DeepSeek</a>';
    apiModelInput.placeholder = 'deepseek-chat';
    modelHintText.innerHTML = 'Gợi ý DeepSeek: <code>deepseek-chat</code>, <code>deepseek-reasoner</code> (R1)';
    apiModelInput.value = 'deepseek-chat';
  } else if (prov === 'openrouter') {
    apiKeyHelpLink.innerHTML = '<a href="https://openrouter.ai/keys" target="_blank" style="color: #58a6ff; text-decoration: underline;">Lấy API Key OpenRouter (Hàng trăm model AI)</a>';
    apiModelInput.placeholder = 'meta-llama/llama-3.3-70b-instruct:free';
    modelHintText.innerHTML = 'Gợi ý OpenRouter: <code>meta-llama/llama-3.3-70b-instruct:free</code>, <code>anthropic/claude-3.5-sonnet</code>';
    apiModelInput.value = 'meta-llama/llama-3.3-70b-instruct:free';
  } else {
    apiKeyHelpLink.innerHTML = '<a href="https://platform.openai.com/api-keys" target="_blank" style="color: #58a6ff; text-decoration: underline;">Lấy API key OpenAI</a>';
    apiModelInput.placeholder = 'gpt-4o-mini';
    modelHintText.innerHTML = 'Gợi ý OpenAI: <code>gpt-4o-mini</code>, <code>gpt-4o</code>';
    apiModelInput.value = 'gpt-4o-mini';
  }
}

// Tạo 1 dòng card API Key chuyên nghiệp
function createKeyCard(val = '') {
  const card = document.createElement('div');
  card.className = 'key-card-row';
  card.style.cssText = 'display: flex; align-items: center; gap: 8px; background: rgba(33, 38, 45, 0.6); padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-color);';

  const count = keyCardsContainer.children.length + 1;

  card.innerHTML = `
    <span style="font-size: 0.78rem; font-family: var(--font-mono); color: #79c0ff; min-width: 55px; font-weight: 600;">Key #${count}:</span>
    <input type="password" class="form-input dynamic-key-input" style="flex: 1; padding: 6px 10px; font-size: 0.82rem;" placeholder="Dán API Key vào đây... (để trống = dùng key mặc định)" value="${escapeHtml(val)}" />
    <button type="button" class="btn-icon btn-toggle-show" style="border:none; background:transparent; font-size: 1rem; cursor:pointer;" title="Hiện/Ẩn Key">👁️</button>
    <button type="button" class="btn-icon btn-remove-card" style="border:none; background:transparent; color:#ff7b72; font-size: 1rem; cursor:pointer;" title="Xóa Key này">❌</button>
  `;

  const inputEl = card.querySelector('.dynamic-key-input');
  const toggleBtn = card.querySelector('.btn-toggle-show');
  const removeBtn = card.querySelector('.btn-remove-card');

  toggleBtn.addEventListener('click', () => {
    if (inputEl.type === 'password') {
      inputEl.type = 'text';
      toggleBtn.textContent = '🙈';
    } else {
      inputEl.type = 'password';
      toggleBtn.textContent = '👁️';
    }
  });

  removeBtn.addEventListener('click', () => {
    if (keyCardsContainer.children.length <= 1) {
      inputEl.value = '';
    } else {
      card.remove();
      refreshKeyCardLabels();
    }
  });

  keyCardsContainer.appendChild(card);
}

function refreshKeyCardLabels() {
  Array.from(keyCardsContainer.children).forEach((card, idx) => {
    const lbl = card.querySelector('span');
    if (lbl) lbl.textContent = `Key #${idx + 1}:`;
  });
}

function getAllEnteredKeys() {
  const inputs = keyCardsContainer.querySelectorAll('.dynamic-key-input');
  const keys = [];
  inputs.forEach(inp => {
    const val = inp.value.trim();
    if (val) keys.push(val);
  });
  return keys;
}

// Nạp dữ liệu cấu hình đã lưu vào Modal API Key
function loadApiKeyModalState() {
  const config = getStoredApiConfig();
  apiKeyTestStatus.style.display = 'none';
  apiKeyTestStatus.innerHTML = '';
  keyCardsContainer.innerHTML = '';

  const prov = config?.provider || 'opencode';
  keyProviderSelect.value = prov;
  updateProviderHints(prov);

  if (config && config.apiKey) {
    const rawKeys = config.apiKey.split(/[\n,;]+/).map(k => k.trim()).filter(k => k.length > 5);
    if (rawKeys.length > 0) {
      rawKeys.forEach(k => createKeyCard(k));
    } else {
      createKeyCard('');
    }
    apiModelInput.value = config.model || '';
  } else {
    createKeyCard('');
  }
}

// Kiểm tra kết nối API Key trực tiếp với Backend
async function handleTestApiKey() {
  const keys = getAllEnteredKeys();
  const provider = keyProviderSelect.value;
  const model = apiModelInput.value.trim();

  if (keys.length === 0) {
    alert('Vui lòng nhập ít nhất 1 API Key để kiểm tra.');
    return;
  }

  testApiKeyBtn.disabled = true;
  testApiKeyBtn.textContent = '⏳ Đang thử...';
  apiKeyTestStatus.style.display = 'block';
  apiKeyTestStatus.style.color = '#79c0ff';
  apiKeyTestStatus.innerHTML = 'Đang gửi yêu cầu xác thực API Key tới máy chủ...';

  try {
    const res = await fetch('/api/config/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: keys.join('\n'), provider, model })
    });

    const data = await res.json();
    if (data.success) {
      apiKeyTestStatus.style.color = '#3fb950';
      apiKeyTestStatus.innerHTML = `✅ ${data.message} (${data.provider} - Model: ${data.model})`;
    } else {
      apiKeyTestStatus.style.color = '#ff7b72';
      apiKeyTestStatus.innerHTML = `❌ Thất bại: ${escapeHtml(data.error || 'API Key không hợp lệ')}`;
    }
  } catch (err) {
    apiKeyTestStatus.style.color = '#ff7b72';
    apiKeyTestStatus.innerHTML = `❌ Lỗi kết nối: ${escapeHtml(err.message)}`;
  } finally {
    testApiKeyBtn.disabled = false;
    testApiKeyBtn.textContent = '⚡ Thử kết nối';
  }
}

// Lưu cấu hình API Key vào LocalStorage
const DEFAULT_API_KEY = 'sk-PtTVvzUMtFeHt04GwX5DNH9la9Jv6j7Es6KjdadWkqTfRrA9Aho3SMHfyitBWR5O';
function handleSaveApiKey() {
  const enteredKeys = getAllEnteredKeys();
  const provider = keyProviderSelect.value;
  const model = apiModelInput.value.trim() || 'deepseek-v4-flash-free';

  // Nếu không nhập key thì dùng key mặc định
  const keys = enteredKeys.length > 0 ? enteredKeys : [DEFAULT_API_KEY];
  const usingDefault = enteredKeys.length === 0;

  saveStoredApiConfig({
    apiKey: keys.join('\n'),
    provider: provider,
    model: model
  });

  fetchServerStatus();
  apiKeyModal.classList.remove('active');
  if (usingDefault) {
    alert(`Đã lưu cấu hình với key mặc định! Hệ thống sẵn sàng quét.`);
  } else {
    alert(`Đã lưu cấu hình thành công với ${keys.length} API Key! Hệ thống sẽ kích hoạt quét đa luồng siêu tốc.`);
  }
}

// Xóa API Key khỏi LocalStorage
function handleClearApiKey() {
  if (confirm('Bạn có chắc chắn muốn xóa toàn bộ API Key đã lưu trên trình duyệt?')) {
    clearStoredApiConfig();
    keyCardsContainer.innerHTML = '';
    createKeyCard('');
    apiKeyTestStatus.style.display = 'none';
    fetchServerStatus();
    apiKeyModal.classList.remove('active');
    alert('Đã xóa API Key thành công!');
  }
}

// Xử lý Tải và Quét từ GitHub
async function handleFetchAndScanGit() {
  const url = gitRepoUrl.value.trim();
  const folder = gitFolderInput.value.trim();
  const token = gitTokenInput.value.trim();

  if (!url) {
    alert('Vui lòng nhập đường dẫn GitHub Repository.');
    gitRepoUrl.focus();
    return;
  }

  submitGitBtn.disabled = true;
  submitGitBtn.innerHTML = '<span>⏳ Đang kết nối GitHub...</span>';

  try {
    const res = await fetch('/api/github/fetch-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, folder, token })
    });

    const data = await res.json();
    if (!data.success) {
      alert('Lỗi tải từ GitHub: ' + (data.error || 'Không xác định'));
      return;
    }

    gitModal.classList.remove('active');
    const repoData = data.data;
    uploadedFiles = repoData.files;

    if (!uploadedFiles || !uploadedFiles.length) {
      alert('Không có file mã nguồn nào được tải về.');
      return;
    }

    setupFolderView(`${repoData.repo} (${uploadedFiles.length} file)`);

    // Lưu vào lịch sử là đã nạp Git Repo kèm danh sách file (snapshot)
    saveScanHistoryItem({
      type: 'git_repo',
      title: `Git: ${repoData.repo}${folder ? ` / ${folder}` : ''}`,
      repo_url: url,
      total_files: uploadedFiles.length,
      scanned_files: 0,
      vuln_files: 0,
      total_vulns: 0,
      status: 'loaded',
      snapshotFiles: uploadedFiles.map(f => ({
        name: f.name,
        path: f.path,
        content: f.content,
        language: f.language,
        duration: f.duration || '0.1',
        result: f.result || null
      }))
    });

  } catch (err) {
    alert('Không thể kết nối đến máy chủ: ' + err.message);
  } finally {
    submitGitBtn.disabled = false;
    submitGitBtn.innerHTML = '<span>⚡ Tải và Quét Repo</span>';
  }
}

// Quét toàn bộ các file trong thư mục đã tải
async function handleScanAllFolder() {
  if (!uploadedFiles.length) return;
  if (isScanning) return;
  isScanning = true;

  scanAllFolderBtn.disabled = true;
  scanBtn.disabled = true;
  scanAllFolderBtn.textContent = '⏳ Đang quét toàn bộ...';

  let totalVulns = 0;
  let successCount = 0;
  let failedCount = 0;
  let incompleteCount = 0;
  let vulnFilesCount = 0;

  for (let i = 0; i < uploadedFiles.length; i++) {
    const file = uploadedFiles[i];
    activeFileIndex = i;
    currentFileTitle.textContent = file.path;
    languageSelect.value = file.language || 'auto';
    setEditorCode(file.content, file.language || 'auto');
    renderFileTree();

    const pct = Math.round(((i) / uploadedFiles.length) * 100);
    resultsContainer.innerHTML = `
      <div class="loading-box">
        <div class="spinner"></div>
        <div style="text-align: center; width: 100%; max-width: 460px;">
          <h3 style="margin-bottom: 6px;">Đang quét (${i + 1}/${uploadedFiles.length}): ${escapeHtml(file.path)}</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">Kiểm tra các mẫu bảo mật OWASP Top 10...</p>

          <div class="scan-progress-container">
            <div class="scan-progress-bar-bg">
              <div class="scan-progress-bar-fill" style="width: ${pct}%;"></div>
            </div>
            <div class="scan-progress-info">
              <span>Đã quét ${i}/${uploadedFiles.length} file</span>
              <span>${pct}%</span>
            </div>
          </div>
        </div>
      </div>
    `;

    try {
      const startTime = Date.now();
      const clientConfig = getStoredApiConfig();
      const scanPayload = {
        code: file.content,
        language: file.language
      };
      if (clientConfig && clientConfig.apiKey) {
        scanPayload.apiKey = clientConfig.apiKey;
        scanPayload.provider = clientConfig.provider;
        scanPayload.model = clientConfig.model;
      }

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanPayload)
      });
      const data = await res.json();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (res.ok && data.success && data.result) {
        file.result = data.result;
        file.duration = duration;
        file.scanError = null;
        successCount++;
        if (data.result.incomplete) {
          incompleteCount++;
        }
        if (!data.result.is_safe && data.result.vulnerabilities && data.result.vulnerabilities.length > 0) {
          totalVulns += data.result.vulnerabilities.length;
          vulnFilesCount++;
        }
      } else {
        failedCount++;
        file.result = null;
        file.scanError = data.error || data.message || `Lỗi HTTP ${res.status}`;
      }
      renderFileTree();
    } catch (err) {
      console.error(err);
      failedCount++;
      file.result = null;
      file.scanError = err.message || 'Lỗi kết nối';
      renderFileTree();
    }
  }

  isScanning = false;
  scanAllFolderBtn.disabled = false;
  scanBtn.disabled = false;
  scanAllFolderBtn.textContent = '⚡ Quét tất cả file';
  renderFileTree();

  if (totalVulns > 0) {
    summaryAlertBadge.style.display = 'inline-block';
    summaryAlertBadge.textContent = totalVulns;
  } else {
    summaryAlertBadge.style.display = 'none';
  }

  // Xác định trạng thái chính xác: chỉ safe khi tất cả file thành công và is_safe === true
  let scanStatus = 'safe';
  if (totalVulns > 0) {
    scanStatus = 'vulnerable';
  } else if (failedCount > 0) {
    scanStatus = successCount > 0 ? 'partial_error' : 'error';
  } else if (incompleteCount > 0) {
    scanStatus = 'incomplete';
  } else if (successCount === uploadedFiles.length && uploadedFiles.length > 0) {
    const allClean = uploadedFiles.every(f => f.result && f.result.is_safe === true);
    scanStatus = allClean ? 'safe' : 'vulnerable';
  } else {
    scanStatus = 'error';
  }

  // Tự động lưu kết quả quét toàn bộ thư mục vào Lịch sử (kèm snapshot để khôi phục)
  saveScanHistoryItem({
    type: 'folder_scan',
    title: `Quét thư mục (${successCount}/${uploadedFiles.length} file)`,
    total_files: uploadedFiles.length,
    scanned_files: successCount,
    success_files: successCount,
    failed_files: failedCount,
    incomplete_files: incompleteCount,
    vuln_files: vulnFilesCount,
    total_vulns: totalVulns,
    status: scanStatus,
    snapshotFiles: uploadedFiles.map(f => ({
      name: f.name,
      path: f.path,
      content: f.content,
      language: f.language,
      duration: f.duration,
      result: f.result,
      scanError: f.scanError || null
    }))
  });

  // Mở tab Tổng quan
  switchViewTab('summary');
}

// Render Dashboard Thống Kê Tổng Quan Của Thư Mục
function renderFolderSummaryDashboard() {
  const totalFiles = uploadedFiles.length;
  let scannedFiles = 0;
  let safeFiles = 0;
  let vulnFiles = 0;
  let totalVulns = 0;
  let failedFiles = 0;
  let incompleteFiles = 0;

  uploadedFiles.forEach(f => {
    if (f.scanError) {
      failedFiles++;
    } else if (f.result) {
      scannedFiles++;
      if (f.result.incomplete) {
        incompleteFiles++;
      }
      if (f.result.is_safe) {
        safeFiles++;
      } else {
        vulnFiles++;
        totalVulns += (f.result.vulnerabilities ? f.result.vulnerabilities.length : 0);
      }
    }
  });

  resultMeta.innerHTML = `
    <span style="font-size:0.75rem; color:var(--text-dim); background:var(--bg-card); padding:4px 8px; border-radius:4px; border:1px solid var(--border-color);">
      📊 Tổng quan | ${scannedFiles}/${totalFiles} file đã quét ${failedFiles > 0 ? `(${failedFiles} file lỗi)` : ''}
    </span>
  `;

  let bannerClass = 'safe';
  let bannerIcon = '🛡️';
  let bannerTitle = 'TẤT CẢ FILE ĐÃ QUÉT ĐỀU AN TOÀN (LGTM)';
  let bannerDesc = 'Không phát hiện thấy dấu hiệu lỗ hổng nghiêm trọng nào trong thư mục.';

  if (totalVulns > 0) {
    bannerClass = 'vulnerable';
    bannerIcon = '🚨';
    bannerTitle = `PHÁT HIỆN ${totalVulns} NGUY CƠ BẢO MẬT TRONG DỰ ÁN`;
    bannerDesc = `Có ${vulnFiles} tệp mã nguồn chứa lỗ hổng nguy hiểm theo tiêu chuẩn OWASP Top 10 cần được xử lý ngay.`;
  } else if (failedFiles > 0) {
    bannerClass = 'vulnerable';
    bannerIcon = '⚠️';
    bannerTitle = `CÓ ${failedFiles}/${totalFiles} FILE QUÉT BỊ LỖI - CHƯA THỂ KẾT LUẬN AN TOÀN`;
    bannerDesc = 'Một số file không thể quét thành công (lỗi mạng hoặc API). Hãy kiểm tra lại kết nối và thử quét lại.';
  } else if (incompleteFiles > 0) {
    bannerClass = 'vulnerable';
    bannerIcon = '⚠️';
    bannerTitle = `CÓ ${incompleteFiles} FILE QUÉT CHƯA HOÀN TẤT ĐẦY ĐỦ`;
    bannerDesc = 'Một số tệp có phân đoạn quét chưa hoàn tất hoặc gặp giới hạn token AI.';
  } else if (scannedFiles < totalFiles) {
    bannerClass = 'vulnerable';
    bannerIcon = 'ℹ️';
    bannerTitle = `MỚI QUÉT ${scannedFiles}/${totalFiles} FILE - CHƯA QUÉT TOÀN BỘ`;
    bannerDesc = 'Bấm "⚡ Quét tất cả file" để hệ thống rà soát toàn bộ thư mục.';
  }

  let html = `
    <div class="dashboard-stats-grid">
      <div class="stat-card">
        <span class="stat-label">Tổng số file</span>
        <span class="stat-val total">${totalFiles}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">File an toàn</span>
        <span class="stat-val safe">${safeFiles}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">File có lỗ hổng</span>
        <span class="stat-val ${vulnFiles > 0 ? 'critical' : 'safe'}">${vulnFiles}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">${failedFiles > 0 ? 'File quét lỗi' : 'Tổng số lỗ hổng'}</span>
        <span class="stat-val ${totalVulns > 0 || failedFiles > 0 ? 'critical' : 'safe'}">${failedFiles > 0 ? failedFiles : totalVulns}</span>
      </div>
    </div>

    <div class="report-header-banner ${bannerClass}" style="margin-bottom: 16px;">
      <div class="banner-status-icon">${bannerIcon}</div>
      <div class="banner-status-info">
        <h3>${bannerTitle}</h3>
        <p>${bannerDesc}</p>
      </div>
    </div>

    <div class="dashboard-table-card">
      <div class="table-header">
        <span>TẬP TIN MÃ NGUỒN</span>
        <span>TRẠNG THÁI / LỖ HỔNG</span>
      </div>
      <div class="table-body">
  `;

  uploadedFiles.forEach((file, index) => {
    let statusText = '<span style="color:var(--text-dim);font-size:0.75rem;">Chưa quét</span>';
    let descText = 'Nhấn vào file để xem code và bắt đầu quét';

    if (file.scanError) {
      statusText = '<span class="tree-badge vuln" style="background: rgba(248,81,73,0.2); color:#ff7b72;">❌ Lỗi quét</span>';
      descText = `Lỗi: ${file.scanError}`;
    } else if (file.result) {
      if (file.result.incomplete) {
        statusText = '<span class="tree-badge" style="background: rgba(210,153,34,0.2); color:#d29922;">⚠️ Chưa xong</span>';
        descText = file.result.overall_summary || 'Quét chưa hoàn tất đầy đủ';
      } else if (file.result.is_safe) {
        statusText = '<span class="tree-badge safe">✓ An toàn</span>';
        descText = file.result.overall_summary || 'Không có lỗ hổng';
      } else {
        const count = file.result.vulnerabilities ? file.result.vulnerabilities.length : 0;
        statusText = `<span class="tree-badge vuln">⚠️ ${count} Lỗ hổng</span>`;
        descText = file.result.overall_summary || 'Phát hiện nguy cơ bảo mật';
      }
    }

    html += `
      <div class="summary-file-row" onclick="selectUploadedFile(${index})">
        <div class="row-left">
          <span>📄</span>
          <div>
            <div class="row-path">${escapeHtml(file.path)}</div>
            <div class="row-desc">${escapeHtml(descText)}</div>
          </div>
        </div>
        <div>${statusText}</div>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  resultsContainer.innerHTML = html;
}

// Render Dashboard Lịch Sử Quét dạng Cấp Thư Mục (Folder Hierarchy)
function renderHistoryDashboard() {
  const history = getScanHistory();

  resultMeta.innerHTML = `
    <span style="font-size:0.75rem; color:var(--text-dim); background:var(--bg-card); padding:4px 8px; border-radius:4px; border:1px solid var(--border-color);">
      🕒 Lịch sử lưu trữ (${history.length} mục)
    </span>
  `;

  if (!history.length) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🕒</div>
        <h3>Chưa có lịch sử quét nào</h3>
        <p>Mỗi khi bạn quét 1 đoạn code, quét 1 file hay quét toàn bộ thư mục/Git Repo, kết quả sẽ tự động được lưu lại tại đây.</p>
      </div>
    `;
    return;
  }

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
      <h3 style="font-size:1rem; font-weight:600;">📁 Lịch sử quét theo từng Thư mục / File:</h3>
      <button onclick="clearAllHistory()" class="btn-secondary" style="font-size:0.78rem; padding: 4px 10px; color:#ff7b72; border-color: rgba(248,81,73,0.3);">
        🗑️ Xóa toàn bộ lịch sử
      </button>
    </div>
  `;

  history.forEach((item, index) => {
    const timeStr = new Date(item.timestamp).toLocaleString('vi-VN');
    const isVuln = item.status === 'vulnerable' || (item.total_vulns && item.total_vulns > 0);
    const isErr = item.status === 'error' || item.status === 'partial_error';
    const isIncomplete = item.status === 'incomplete';
    const badgeClass = isVuln ? 'severity-cao' : (isErr ? 'severity-cao' : (isIncomplete ? 'severity-trung-bình' : 'severity-thấp'));
    const badgeText = isVuln
      ? `⚠️ ${item.total_vulns} Lỗ hổng`
      : (isErr
          ? `❌ Lỗi quét (${item.failed_files || 0} file lỗi)`
          : (isIncomplete
              ? '⚠️ Chưa quét hết'
              : (item.status === 'loaded' ? 'ℹ️ Đã nạp Git' : '✓ An toàn')));
    const isFolder = (item.type === 'folder_scan' || item.type === 'git_repo');
    const subFiles = item.snapshotFiles || [];

    html += `
      <div class="history-folder-card">
        <div class="history-folder-header">
          <div class="history-folder-left">
            <span class="history-folder-icon">${isFolder ? '📁' : '📄'}</span>
            <div>
              <div class="history-info-title">
                <strong>${escapeHtml(item.title || 'Lần quét')}</strong>
              </div>
              <div class="history-time">
                ${timeStr} ${item.language ? `• Ngôn ngữ: ${item.language}` : (isFolder ? `• ${subFiles.length || item.total_files || 0} file` : '')}
              </div>
            </div>
          </div>

          <div class="history-folder-actions">
            <span class="vuln-badge-severity ${badgeClass}">${badgeText}</span>
            ${isFolder ? `
              <button class="btn-history-action btn-history-summary" onclick="restoreHistoryFolderSummary(${index})" title="Xem Dashboard báo cáo tổng thể cả thư mục">
                📊 Xem tổng thể
              </button>
              <button class="btn-history-action btn-history-toggle" onclick="toggleHistoryFolderAccordion(${index})" title="Mở rộng danh sách từng file trong thư mục này">
                ▼ Từng file (${subFiles.length})
              </button>
            ` : `
              <button class="btn-history-action btn-history-file" onclick="restoreHistorySingleFile(${index})" title="Xem code và phân tích file này">
                📄 Xem file
              </button>
            `}
          </div>
        </div>

        ${isFolder && subFiles.length ? `
          <div id="historySubFiles_${index}" class="history-subfiles-list" style="display: none;">
            <div class="subfiles-note">Danh sách các file trong lần quét này (Bấm vào file để xem chi tiết lỗ hổng):</div>
            ${subFiles.map((sf, fileIdx) => {
              const sfHasError = Boolean(sf.scanError);
              const sfScanned = Boolean(sf.result);
              const sfSafe = sfScanned && !sfHasError && sf.result.is_safe === true;
              const sfCount = sf.result && sf.result.vulnerabilities ? sf.result.vulnerabilities.length : 0;
              let chipClass = 'safe';
              let badgeLabel = 'Clean';
              if (sfHasError) {
                chipClass = 'vuln';
                badgeLabel = 'Lỗi';
              } else if (!sfScanned) {
                chipClass = '';
                badgeLabel = 'Chưa quét';
              } else if (!sfSafe) {
                chipClass = 'vuln';
                badgeLabel = `${sfCount} Lỗi`;
              }
              return `
                <div class="history-subfile-item" onclick="restoreHistorySubFile(${index}, ${fileIdx})">
                  <div class="subfile-left">
                    <span class="file-chip-status ${chipClass}"></span>
                    <span class="subfile-path">${escapeHtml(sf.path || sf.name)}</span>
                  </div>
                  <span class="tree-badge ${chipClass}">
                    ${badgeLabel}
                  </span>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}
      </div>
    `;
  });

  resultsContainer.innerHTML = html;
}

// Mở rộng / Thu gọn danh sách file con trong thư mục lịch sử
function toggleHistoryFolderAccordion(index) {
  const container = document.getElementById(`historySubFiles_${index}`);
  if (!container) return;
  if (container.style.display === 'none') {
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }
}

// Khôi phục xem Báo cáo Tổng thể cả thư mục
function restoreHistoryFolderSummary(index) {
  const history = getScanHistory();
  if (index < 0 || index >= history.length) return;
  const item = history[index];

  if (item.snapshotFiles && item.snapshotFiles.length) {
    uploadedFiles = item.snapshotFiles;
    setupFolderView(`${uploadedFiles.length} file (Lịch sử: ${item.title})`);
    switchViewTab('summary');
  } else if (uploadedFiles && uploadedFiles.length) {
    switchViewTab('summary');
  } else {
    alert('Mục lịch sử này được tạo trước khi quét. Vui lòng bấm "⚡ Quét tất cả file" ở cột trái để quét và lưu lại kết quả đầy đủ.');
  }
}

// Khôi phục xem 1 file cụ thể nằm bên trong thư mục đã quét
function restoreHistorySubFile(historyIndex, fileIndex) {
  const history = getScanHistory();
  if (historyIndex < 0 || historyIndex >= history.length) return;
  const item = history[historyIndex];

  if (item.snapshotFiles && item.snapshotFiles.length) {
    uploadedFiles = item.snapshotFiles;
    setupFolderView(`${uploadedFiles.length} file (Lịch sử: ${item.title})`);
    selectUploadedFile(fileIndex);
  }
}

// Khôi phục xem File lẻ đơn lẻ
function restoreHistorySingleFile(index) {
  const history = getScanHistory();
  if (index < 0 || index >= history.length) return;
  const item = history[index];

  currentFileTitle.textContent = item.title;
  languageSelect.value = item.language || 'auto';
  setEditorCode(item.code || '', item.language || 'auto');
  switchViewTab('detail');
  if (item.result) {
    renderReport(item.result, item.duration || '0.1');
  }
}

// Reset giao diện kết quả
function resetResults() {
  currentActiveReport = null;
  if (exportReportBtn) exportReportBtn.style.display = 'none';
  if (reScanCurrentBtn) reScanCurrentBtn.style.display = 'none';
  if (fileModifiedBadge) fileModifiedBadge.style.display = 'none';
  isEditorModified = false;

  if (isMonacoLoaded && monacoInstance) {
    monacoDecorations = monacoInstance.deltaDecorations(monacoDecorations, []);
  }
  renderProblemsPanel([]);

  if (toggleEditBtn) {
    isEditMode = true;
    toggleEditBtn.classList.remove('active-edit');
    if (toggleEditText) toggleEditText.textContent = 'Chỉnh sửa';
  }
  if (!isMonacoLoaded && codeEditor && codeViewer) {
    codeEditor.style.display = 'block';
    codeViewer.style.display = 'none';
  }
  resultMeta.innerHTML = '';
  resultsContainer.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🔍</div>
      <h3>Chưa có dữ liệu phân tích</h3>
      <p>Dán mã nguồn vào khung bên trái hoặc chọn 1 mẫu thử nghiệm rồi bấm <strong>"Phân tích File Hiện Tại"</strong> hoặc <strong>"⚡ Quét tất cả file"</strong> để AI rà soát bảo mật theo OWASP Top 10.</p>
      
      <div class="owasp-badges-preview">
        <span>SQL Injection</span>
        <span>XSS</span>
        <span>Hardcoded Secret</span>
        <span>Command Injection</span>
        <span>Path Traversal</span>
        <span>CSRF</span>
        <span>IDOR</span>
      </div>
    </div>
  `;
}

// Gửi yêu cầu quét mã nguồn cho file hiện tại
async function handleScan() {
  const code = getEditorCode().trim();
  if (!code) {
    alert('Vui lòng dán hoặc nhập mã nguồn cần kiểm tra bảo mật.');
    if (isMonacoLoaded && monacoInstance) {
      monacoInstance.focus();
    } else if (codeEditor) {
      codeEditor.focus();
    }
    return;
  }

  if (isScanning) return;
  isScanning = true;

  scanBtn.disabled = true;
  scanBtn.querySelector('.btn-scan-text').textContent = 'Đang phân tích...';

  const startTime = Date.now();
  const codeLines = code.split('\n').length;
  const chunkCount = Math.max(1, Math.ceil(codeLines / 250));

  resultsContainer.innerHTML = `
    <div class="loading-box">
      <div class="spinner"></div>
      <div style="text-align: center; width: 100%; max-width: 460px;">
        <h3 style="margin-bottom: 6px;">Đang rà soát lỗ hổng bảo mật...</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">
          Đang quét ${codeLines} dòng mã nguồn (${chunkCount} phân đoạn) theo chuẩn OWASP Top 10:2025.
        </p>

        <div class="scan-progress-container">
          <div class="scan-progress-bar-bg">
            <div id="scanProgressBarFill" class="scan-progress-bar-fill" style="width: 15%;"></div>
          </div>
          <div class="scan-progress-info">
            <span id="scanProgressStage">Giai đoạn: Khởi tạo phân tích mã...</span>
            <span id="scanProgressTimer">0.0s</span>
          </div>
        </div>

        <div style="margin-top: 14px;">
          <span id="scanStageBadge" class="scan-stage-badge">
            ⚡ Đang gửi request AI kiểm tra mã...
          </span>
        </div>
      </div>
    </div>
  `;

  const barFill = document.getElementById('scanProgressBarFill');
  const stageText = document.getElementById('scanProgressStage');
  const stageBadge = document.getElementById('scanStageBadge');
  const timerText = document.getElementById('scanProgressTimer');

  // Bộ đếm thời gian và mô phỏng tiến độ trực quan theo từng giai đoạn
  let progress = 15;
  const progressInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (timerText) timerText.textContent = `${elapsed}s`;

    if (progress < 90) {
      progress += (90 - progress) * 0.08;
      if (barFill) barFill.style.width = `${progress.toFixed(0)}%`;
    }

    if (elapsed > 1.5 && progress < 45) {
      if (stageText) stageText.textContent = `Giai đoạn: Đang rà soát cú pháp & AST...`;
      if (stageBadge) stageBadge.textContent = `🔍 Đang đối chiếu các quy tắc OWASP Injection & XSS`;
    } else if (elapsed > 3.5 && progress < 75) {
      if (stageText) stageText.textContent = `Giai đoạn: Kiểm tra Secrets & Cấu hình CSDL...`;
      if (stageBadge) stageBadge.textContent = `🔑 Rà soát Hardcoded API Keys, JWT, Session Bypass`;
    } else if (elapsed > 5.5) {
      if (stageText) stageText.textContent = `Giai đoạn: Tổng hợp kết quả & lập mã vá (Remediation)...`;
      if (stageBadge) stageBadge.textContent = `🛠️ Tạo giải pháp khắc phục triệt để và code mẫu`;
    }
  }, 300);

  const clientConfig = getStoredApiConfig();
  const scanPayload = {
    code: code,
    language: languageSelect.value
  };
  if (clientConfig && clientConfig.apiKey) {
    scanPayload.apiKey = clientConfig.apiKey;
    scanPayload.provider = clientConfig.provider;
    scanPayload.model = clientConfig.model;
  }

async function safeParseApiResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      // Fall through if json parse failed
    }
  }
  const text = await res.text();
  if (res.status === 504) {
    throw new Error('Máy chủ phản hồi HTTP 504 (Gateway Timeout): Quá trình phân tích tệp mã nguồn lớn bị quá thời gian chờ proxy (180s).');
  } else if (res.status === 502) {
    throw new Error('Máy chủ phản hồi HTTP 502 (Bad Gateway): Tiến trình AI backend đang bận hoặc khởi động lại.');
  } else if (res.status === 413) {
    throw new Error('Máy chủ phản hồi HTTP 413 (Payload Too Large): Kích thước mã nguồn vượt quá giới hạn.');
  } else if (!res.ok) {
    throw new Error(`Máy chủ phản hồi mã lỗi HTTP ${res.status}: ${res.statusText || 'Lỗi kết nối'}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Máy chủ không trả về JSON hợp lệ (HTTP ${res.status}): ${text.slice(0, 100)}`);
  }
}

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scanPayload)
    });

    clearInterval(progressInterval);
    if (barFill) barFill.style.width = '100%';
    if (stageText) stageText.textContent = 'Hoàn tất phân tích 100%!';

    const data = await safeParseApiResponse(res);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!res.ok || !data.success) {
      renderSystemError({
        error: data.error || `Máy chủ phản hồi mã lỗi HTTP ${res.status}`,
        status: res.status,
        provider: clientConfig?.provider || 'Server AI',
        model: clientConfig?.model || 'N/A'
      });
    } else {
      if (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]) {
        uploadedFiles[activeFileIndex].result = data.result;
        uploadedFiles[activeFileIndex].duration = duration;
        renderFileTree();
      }

      // Lưu kết quả lần quét này vào Lịch sử (kèm code & kết quả để click là mở lại ngay)
      saveScanHistoryItem({
        type: 'single_file',
        title: currentFileTitle.textContent || 'File mã nguồn',
        language: languageSelect.value,
        code: code,
        duration: duration,
        status: !data.result.is_safe ? 'vulnerable' : (data.result.incomplete ? 'incomplete' : 'safe'),
        total_vulns: data.result.vulnerabilities ? data.result.vulnerabilities.length : 0,
        summary: data.result.overall_summary,
        result: data.result
      });

      switchViewTab('detail');
      try {
        renderReport(data.result, duration);
      } catch (renderErr) {
        console.error('Lỗi khi hiển thị báo cáo quét:', renderErr);
        renderError('Đã nhận kết quả quét nhưng gặp lỗi khi dựng giao diện: ' + renderErr.message);
      }
    }
  } catch (err) {
    clearInterval(progressInterval);
    renderSystemError({
      error: 'Không thể kết nối đến máy chủ quét: ' + err.message,
      provider: clientConfig?.provider || 'Network',
      model: clientConfig?.model || 'N/A'
    });
  } finally {
    isScanning = false;
    scanBtn.disabled = false;
    scanBtn.querySelector('.btn-scan-text').textContent = 'Phân tích File Hiện Tại';
  }
}

// Khôi phục lại trạng thái từ 1 mục trong Lịch sử quét
function restoreHistoryItem(index) {
  const history = getScanHistory();
  if (index < 0 || index >= history.length) return;
  const item = history[index];

  if (item.type === 'folder_scan' || item.type === 'git_repo') {
    if (item.snapshotFiles && item.snapshotFiles.length) {
      uploadedFiles = item.snapshotFiles;
      setupFolderView(`${uploadedFiles.length} file (Từ lịch sử)`);
      switchViewTab('summary');
    } else {
      alert('Mục lịch sử này không có dữ liệu file lưu kèm.');
    }
  } else if (item.type === 'single_file') {
    currentFileTitle.textContent = item.title;
    languageSelect.value = item.language || 'auto';
    setEditorCode(item.code || '', item.language || 'auto');
    switchViewTab('detail');
    if (item.result) {
      renderReport(item.result, item.duration || '0.1');
    }
  }
}

// Hiển thị lỗi
function renderError(message) {
  resultsContainer.innerHTML = `
    <div class="report-header-banner vulnerable">
      <div class="banner-status-icon">⚠️</div>
      <div class="banner-status-info">
        <h3>Lỗi khi thực hiện phân tích</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

// Global helper để click finding từ report card
window.revealVulnerabilityByIndex = function(index) {
  if (!currentActiveReport || !currentActiveReport.vulnerabilities) return;
  const vuln = currentActiveReport.vulnerabilities[index];
  revealVulnerabilityInEditor(vuln);
};

// Render Báo cáo kết quả
function renderReport(result, duration) {
  currentActiveReport = result;
  if (exportReportBtn) exportReportBtn.style.display = 'inline-flex';

  const isSafe = result.is_safe;
  const vulns = result.vulnerabilities || [];
  const recs = result.recommendations || [];

  const engineLabel = result.source === 'ai_live' ? `AI Engine (${result.model_used})` : 'Heuristic Engine';
  resultMeta.innerHTML = `
    <span style="font-size:0.75rem; color:var(--text-dim); background:var(--bg-card); padding:4px 8px; border-radius:4px; border:1px solid var(--border-color);">
      ⏱️ ${duration}s | ⚙️ ${engineLabel}
    </span>
  `;

  let html = '';

  if (isSafe) {
    html += `
      <div class="report-header-banner safe">
        <div class="banner-status-icon">🛡️</div>
        <div class="banner-status-info">
          <h3>MÃ NGUỒN AN TOÀN (LGTM)</h3>
          <p>${escapeHtml(result.overall_summary || 'Không tìm thấy dấu hiệu lỗ hổng OWASP Top 10 phổ biến trong đoạn mã này.')}</p>
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="report-header-banner vulnerable">
        <div class="banner-status-icon">🚨</div>
        <div class="banner-status-info">
          <h3>PHÁT HIỆN ${vulns.length} LỖ HỔNG BẢO MẬT</h3>
          <p>${escapeHtml(result.overall_summary || 'Cần khắc phục ngay các rủi ro bảo mật trước khi đưa vào sản phẩm.')}</p>
        </div>
      </div>
    `;
  }

  if (result.notice) {
    html += `
      <div style="padding: 10px 14px; background: rgba(210,153,34,0.15); border: 1px solid rgba(210,153,34,0.4); border-radius: 6px; font-size: 0.8rem; color: #d29922; margin-bottom: 16px;">
        ℹ️ ${escapeHtml(result.notice)}
      </div>
    `;
  }

  vulns.forEach((v, index) => {
    const severitySlug = (v.severity || 'Cao').toLowerCase().replace(/\s+/g, '-');
    const startLine = Number.parseInt(v.start_line || v.line_number, 10) || 1;
    const endLine = Number.parseInt(v.end_line || startLine, 10) || startLine;
    const lineLabel = startLine === endLine ? `Dòng ${startLine}: ` : `Dòng ${startLine}-${endLine}: `;
    const locationBtnText = startLine === endLine ? `dòng ${startLine}` : `dòng ${startLine}-${endLine}`;

    html += `
      <div class="vuln-card">
        <div class="vuln-card-header">
          <div class="vuln-title-area">
            <span class="vuln-badge-severity severity-${severitySlug}">${escapeHtml(v.severity || 'Cao')}</span>
            <strong style="font-size: 0.95rem;">${index + 1}. ${escapeHtml(v.type || 'Lỗ hổng bảo mật')}</strong>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="vuln-category-badge">${escapeHtml(v.owasp_category || 'OWASP Top 10:2025')}</span>
            ${v.cwe ? `<span class="vuln-category-badge" style="background:rgba(56,139,253,0.15); color:#79c0ff; border-color:rgba(56,139,253,0.3); font-family:var(--font-mono);">${escapeHtml(v.cwe)}</span>` : ''}
            ${v.confidence ? `<span class="vuln-category-badge" style="background:rgba(63,185,80,0.12); color:#7ee787; border-color:rgba(63,185,80,0.3);">Tin cậy: ${escapeHtml(v.confidence)}</span>` : ''}
          </div>
        </div>

        <div class="vuln-card-body">
          ${v.affected_lines ? `
            <div class="vuln-field">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div class="vuln-field-label">📍 Vị trí / Đoạn code có lỗ hổng:</div>
                <button class="btn-goto-line" onclick="window.revealVulnerabilityByIndex(${index})" title="Bấm để cuộn và focus ngay tới vị trí trong editor">
                  🔍 Xem ngay ${locationBtnText} ➔
                </button>
              </div>
              <div class="vuln-code-snippet" style="color: #ff7b72; border-color: rgba(248,81,73,0.4); background: rgba(248,81,73,0.08); cursor: pointer;" onclick="window.revealVulnerabilityByIndex(${index})" title="Bấm vào để cuộn tới dòng code">
                <strong>${lineLabel}</strong>${escapeHtml(v.affected_lines)}
              </div>
            </div>
          ` : ''}

          <div class="vuln-field">
            <div class="vuln-field-label">📖 Cơ chế & Giải thích:</div>
            <p style="color: var(--text-muted);">${escapeHtml(v.explanation)}</p>
          </div>

          ${v.attack_scenario ? `
            <div class="vuln-field">
              <div class="vuln-field-label">💥 Kịch bản tấn công (PoC):</div>
              <p style="color: #ff7b72; font-size: 0.85rem; background: rgba(248,81,73,0.08); padding: 8px 12px; border-radius: 6px; border-left: 3px solid #f85149;">
                ${escapeHtml(v.attack_scenario)}
              </p>
            </div>
          ` : ''}

          ${v.remediation ? `
            <div class="vuln-field">
              <div class="vuln-field-label">🛠️ Hướng khắc phục:</div>
              <p style="color: var(--text-muted);">${escapeHtml(v.remediation)}</p>
            </div>
          ` : ''}

          ${v.fixed_code ? `
            <div class="vuln-field">
              <div class="vuln-field-label">✅ Code mẫu đã vá an toàn:</div>
              <div class="vuln-fixed-code">${escapeHtml(v.fixed_code)}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  });

  if (recs && recs.length > 0) {
    html += `
      <div class="rec-box">
        <h4>💡 Khuyến nghị tăng cường bảo mật:</h4>
        <ul>
          ${recs.map(r => {
            const text = (typeof r === 'string') 
              ? r 
              : (r?.recommendation || r?.title || r?.desc || r?.description || r?.text || JSON.stringify(r));
            return `<li>${escapeHtml(text)}</li>`;
          }).join('')}
        </ul>
      </div>
    `;
  }

  resultsContainer.innerHTML = html;

  // Cập nhật decorations trên Monaco Editor & Problems panel
  updateMonacoDecorations(vulns, false);
  renderProblemsPanel(vulns, false);
  setFileModifiedState(false);

  // AppSec IDE Studio State Updates
  activeFindingList = vulns;
  const filePath = (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]?.path) || 'Mã nguồn hiện tại';
  const fileName = filePath.split('/').pop().split('\\').pop();
  const bcName = document.getElementById('breadcrumbFileName');
  if (bcName) bcName.textContent = fileName;

  const provText = document.getElementById('provenanceText');
  if (provText) {
    provText.textContent = result.source === 'ai_live' ? (result.model_used || 'Groq 120B / Gemini') : 'Heuristic Engine';
  }

  if (typeof updateScanDiffMetrics === 'function') {
    updateScanDiffMetrics(vulns, filePath);
  }
  if (typeof updateFindingsUI === 'function') {
    updateFindingsUI();
  }

  if (vulns.length > 0 && typeof selectVulnerability === 'function') {
    switchSidebarView('findings');
    selectVulnerability(0);
  }

  // Fallback bôi đỏ codeViewer nếu không có Monaco
  if (!isMonacoLoaded) {
    renderCodeViewerWithHighlights(codeEditor ? codeEditor.value : '', vulns);
  }
}

// Render Code Viewer kèm số dòng và bôi đỏ chính xác dòng bị lỗi (fallback khi không có Monaco)
function renderCodeViewerWithHighlights(codeText, vulnerabilities = []) {
  if (!codeViewer) return;

  const lines = codeText ? codeText.split('\n') : [''];
  const vulnLineMap = new Map();

  // Xác định các dòng code bị lỗi
  vulnerabilities.forEach(v => {
    let foundLine = -1;

    if (v.start_line && v.start_line > 0 && v.start_line <= lines.length) {
      foundLine = v.start_line - 1;
    } else if (v.line_number && v.line_number > 0 && v.line_number <= lines.length) {
      foundLine = v.line_number - 1;
    } else if (v.affected_lines) {
      const raw = v.affected_lines.trim();
      const directIdx = lines.findIndex(l => l.trim().length > 3 && (l.includes(raw) || raw.includes(l.trim())));
      if (directIdx >= 0) {
        foundLine = directIdx;
      }
    }

    if (foundLine >= 0) {
      vulnLineMap.set(foundLine, v.type);
    }
  });

  codeEditor.style.display = 'none';
  codeViewer.style.display = 'block';

  let html = '';
  lines.forEach((line, idx) => {
    const isVuln = vulnLineMap.has(idx);
    const vulnType = vulnLineMap.get(idx);
    html += `
      <div id="codeLine_${idx + 1}" class="code-line ${isVuln ? 'vulnerable' : ''}">
        <span class="code-line-num">${idx + 1}</span>
        <span class="code-line-content">${escapeHtml(line || ' ')}${isVuln ? ` <span class="vuln-inline-badge">🚨 LỖI: ${escapeHtml(vulnType)}</span>` : ''}</span>
      </div>
    `;
  });
  codeViewer.innerHTML = html;
}

// Cuộn tới dòng code lỗi khi người dùng bấm nút xem
function scrollToCodeLine(lineNum) {
  if (isMonacoLoaded && monacoInstance) {
    monacoInstance.revealLineInCenter(lineNum);
    monacoInstance.setPosition({ lineNumber: lineNum, column: 1 });
    monacoInstance.focus();
    return;
  }

  if (codeViewer && codeViewer.style.display === 'none') {
    codeEditor.style.display = 'none';
    codeViewer.style.display = 'block';
  }

  const lineEl = document.getElementById(`codeLine_${lineNum}`);
  if (lineEl && codeViewer) {
    lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    lineEl.classList.add('vulnerable');
    lineEl.style.boxShadow = '0 0 15px rgba(248, 81, 73, 0.8)';
    setTimeout(() => { lineEl.style.boxShadow = 'none'; }, 3000);
  }
}

// Tìm và cuộn đến dòng code theo snippet văn bản
function searchAndHighlightSnippet(snippetText) {
  if (!snippetText) return;

  if (isMonacoLoaded && monacoInstance) {
    const model = monacoInstance.getModel();
    if (model) {
      const firstLine = snippetText.trim().split('\n')[0] || snippetText;
      const matches = model.findMatches(firstLine, false, false, false, null, false);
      if (matches && matches.length > 0) {
        const match = matches[0];
        monacoInstance.revealRangeInCenter(match.range);
        monacoInstance.setPosition({ lineNumber: match.range.startLineNumber, column: match.range.startColumn });
        monacoInstance.focus();
        return;
      }
    }
  }

  if (!codeViewer) return;
  const lines = codeViewer.querySelectorAll('.code-line');
  const tokens = snippetText.split(/[\s,;()=]+/).filter(t => t.length > 3 && !['def', 'return', 'import', 'const', 'function', 'lines'].includes(t.toLowerCase()));

  for (let lineEl of lines) {
    const text = lineEl.textContent;
    const match = tokens.some(tok => text.includes(tok));
    if (match) {
      lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      lineEl.classList.add('vulnerable');
      lineEl.style.boxShadow = '0 0 15px rgba(248, 81, 73, 0.8)';
      setTimeout(() => { lineEl.style.boxShadow = 'none'; }, 3000);
      return;
    }
  }
  scrollToCodeLine(1);
}

function escapeJsString(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, ' ');
}

// Tiện ích escape ký tự HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Tải file dạng Blob về máy người dùng
function downloadBlobFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Xuất báo cáo bảo mật chi tiết dạng Markdown (.md)
function exportSecurityReport() {
  if (!currentActiveReport) return;

  const rep = currentActiveReport;
  const fileName = (activeFileIndex >= 0 && uploadedFiles[activeFileIndex])
    ? (uploadedFiles[activeFileIndex].path || uploadedFiles[activeFileIndex].name)
    : currentFileTitle.textContent || 'source_code';

  const vulns = rep.vulnerabilities || [];
  const recs = rep.recommendations || [];

  let md = `# 🛡️ BÁO CÁO ĐÁNH GIÁ BẢO MẬT MÃ NGUỒN (SECURITY AUDIT REPORT)\n\n`;
  md += `- **Mục tiêu phân tích**: \`${fileName}\`\n`;
  md += `- **Thời gian xuất**: ${new Date().toLocaleString('vi-VN')}\n`;
  md += `- **Trạng thái**: ${rep.is_safe ? '✅ AN TOÀN (Safe)' : `🚨 PHÁT HIỆN ${vulns.length} LỖ HỔNG`}\n`;
  md += `- **Công cụ thẩm định**: ${rep.source === 'ai_live' ? `AI Engine (${rep.model_used})` : 'Heuristic Engine'}\n\n`;

  md += `## 📌 Tóm tắt tổng quan\n${rep.overall_summary || 'N/A'}\n\n`;

  if (vulns.length > 0) {
    md += `## 🚨 Danh sách chi tiết các lỗ hổng (${vulns.length})\n\n`;
    vulns.forEach((v, i) => {
      md += `### ${i + 1}. [${v.severity || 'Cao'}] ${v.type || 'Lỗ hổng bảo mật'}\n`;
      md += `- **Danh mục OWASP**: ${v.owasp_category || 'OWASP Top 10'}\n`;
      if (v.line_number) md += `- **Dòng code bị lỗi**: Dòng ${v.line_number}\n`;
      if (v.affected_lines) {
        md += `\n**Đoạn code bị ảnh hưởng:**\n\`\`\`\n${v.affected_lines}\n\`\`\`\n`;
      }
      if (v.explanation) md += `\n**Giải thích cơ chế nguy hiểm:**\n${v.explanation}\n`;
      if (v.attack_scenario) md += `\n**Kịch bản tấn công (PoC):**\n${v.attack_scenario}\n`;
      if (v.remediation) md += `\n**Hướng khắc phục:**\n${v.remediation}\n`;
      if (v.fixed_code) {
        md += `\n**Code mẫu đã vá an toàn:**\n\`\`\`\n${v.fixed_code}\n\`\`\`\n`;
      }
      md += `\n---\n\n`;
    });
  }

  if (recs.length > 0) {
    md += `## 💡 Khuyến nghị củng cố bảo mật\n\n`;
    recs.forEach((r, i) => {
      const text = (typeof r === 'string') ? r : (r?.recommendation || JSON.stringify(r));
      md += `${i + 1}. ${text}\n`;
    });
    md += `\n`;
  }

  const safeReportName = fileName.replace(/[/\\?%*:|"<>]/g, '_');
  const reportFilename = `Security_Report_${safeReportName}_${Date.now()}.md`;
  downloadBlobFile(md, reportFilename, 'text/markdown;charset=utf-8');
}

/* ==========================================================================
   APPSEC STUDIO IDE ENGINE - ACTIVITY BAR, DRAWER, FINGERPRINTS & COMMANDS
   ========================================================================== */

let activeSidebarView = 'explorer';
let isSidebarCollapsed = false;
let isDrawerCollapsed = true;
let activeDrawerTab = 'overview';
let activeFindingIndex = -1;
let activeFindingList = [];
let editorCodeSnapshotBeforeFix = null;
let previousScanFingerprints = new Set();
let findingFilterSev = 'all';
let findingSearchQuery = '';
let pendingIgnoreFinding = null;

// Fingerprinting & Persistent State
const VULN_STATES_KEY = 'ai_security_scanner_vuln_states';
let findingStates = {};

function loadVulnStates() {
  try {
    const raw = localStorage.getItem(VULN_STATES_KEY);
    findingStates = raw ? JSON.parse(raw) : {};
  } catch (e) {
    findingStates = {};
  }
}

function saveVulnStates() {
  try {
    localStorage.setItem(VULN_STATES_KEY, JSON.stringify(findingStates));
  } catch (e) {}
}

function computeFindingFingerprint(v, filePath) {
  const pathStr = filePath || (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]?.path) || 'current';
  const startLine = v.start_line || v.line_number || 1;
  const type = v.cwe || v.type || 'vuln';
  const snip = (v.affected_lines || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  return `${pathStr}::${type}::L${startLine}::${snip}`;
}

function getFindingState(v, filePath) {
  const fp = computeFindingFingerprint(v, filePath);
  const val = findingStates[fp];
  if (!val) return 'open';
  if (typeof val === 'string') return val;
  return val.state || 'open';
}

function setFindingState(v, filePath, state, reason = '', notes = '') {
  const fp = computeFindingFingerprint(v, filePath);
  findingStates[fp] = {
    state: state,
    reason: reason,
    notes: notes,
    updatedAt: new Date().toISOString()
  };
  saveVulnStates();
  updateFindingsUI();
  if (currentActiveReport && currentActiveReport.vulnerabilities) {
    updateMonacoDecorations(currentActiveReport.vulnerabilities, false);
    renderProblemsPanel(currentActiveReport.vulnerabilities, false);
  }
}

// Sidebar View Switching & Collapsing
function switchSidebarView(viewName) {
  activeSidebarView = viewName;
  document.querySelectorAll('.activity-btn[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  const icons = { explorer: '📁', findings: '🛡️', scan: '⚡', risk: '📊', settings: '⚙️' };
  const titles = { explorer: 'EXPLORER', findings: 'FINDINGS', scan: 'SCAN ENGINE', risk: 'PROJECT RISK', settings: 'SETTINGS' };

  const iconElem = document.getElementById('sidebarHeaderIcon');
  const titleElem = document.getElementById('sidebarHeaderTitle');
  if (iconElem) iconElem.textContent = icons[viewName] || '📁';
  if (titleElem) titleElem.textContent = titles[viewName] || 'EXPLORER';

  document.querySelectorAll('.sidebar-view-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  const targetPane = document.getElementById('view' + viewName.charAt(0).toUpperCase() + viewName.slice(1));
  if (targetPane) targetPane.classList.add('active');

  if (isSidebarCollapsed) {
    togglePrimarySidebar(false);
  }
}

function togglePrimarySidebar(forceCollapse) {
  const sidebar = document.getElementById('primarySidebar');
  if (!sidebar) return;
  if (typeof forceCollapse === 'boolean') {
    isSidebarCollapsed = forceCollapse;
  } else {
    isSidebarCollapsed = !isSidebarCollapsed;
  }
  sidebar.classList.toggle('collapsed', isSidebarCollapsed);
  if (isMonacoLoaded && monacoInstance) {
    setTimeout(() => monacoInstance.layout(), 220);
  }
}

// Secondary Drawer Toggling & Tabs
function toggleSecondaryDrawer(forceOpen) {
  const drawer = document.getElementById('secondaryDrawer');
  if (!drawer) return;
  if (typeof forceOpen === 'boolean') {
    isDrawerCollapsed = !forceOpen;
  } else {
    isDrawerCollapsed = !isDrawerCollapsed;
  }
  drawer.classList.toggle('collapsed', isDrawerCollapsed);
  if (isMonacoLoaded && monacoInstance) {
    setTimeout(() => monacoInstance.layout(), 220);
  }
}

function switchDrawerTab(tabName) {
  activeDrawerTab = tabName;
  document.querySelectorAll('.drawer-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.pane === tabName);
  });
  document.querySelectorAll('.drawer-pane').forEach(p => {
    p.classList.remove('active');
  });
  const target = document.getElementById('drawerPane' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
  if (target) target.classList.add('active');
}

// Select a Vulnerability Finding
function selectVulnerability(idx) {
  if (!activeFindingList || idx < 0 || idx >= activeFindingList.length) return;
  activeFindingIndex = idx;
  const v = activeFindingList[idx];
  const filePath = (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]?.path) || 'Mã nguồn hiện tại';

  // Highlight in sidebar card list
  document.querySelectorAll('.findings-item-card').forEach((card) => {
    const cardIdx = Number.parseInt(card.getAttribute('data-index'), 10);
    card.classList.toggle('active', cardIdx === idx);
  });

  // Jump in Monaco Editor
  revealVulnerabilityInEditor(v);

  const line = v.start_line || v.line_number || 1;
  const bcLine = document.getElementById('breadcrumbLineNumber');
  if (bcLine) bcLine.textContent = line;

  // Open & Populate Drawer
  toggleSecondaryDrawer(true);
  populateDrawerWithVuln(v, filePath);
}

function populateDrawerWithVuln(v, filePath) {
  const state = getFindingState(v, filePath);
  const drawerStateSelect = document.getElementById('drawerStateSelect');
  if (drawerStateSelect) drawerStateSelect.value = state;

  const titleElem = document.getElementById('drawerVulnTitle');
  if (titleElem) titleElem.textContent = `${v.type || 'Lỗ hổng bảo mật'}`;

  const sevBadge = document.getElementById('drawerSeverityBadge');
  if (sevBadge) {
    const sevSlug = (v.severity || 'Cao').toLowerCase().replace(/\s+/g, '-');
    sevBadge.className = `vuln-badge-severity severity-${sevSlug}`;
    sevBadge.textContent = v.severity || 'Cao';
  }

  // Overview Tab
  const emptyHint = document.getElementById('drawerEmptyHint');
  const overviewContent = document.getElementById('drawerOverviewContent');
  if (emptyHint) emptyHint.style.display = 'none';
  if (overviewContent) overviewContent.style.display = 'block';

  const owaspEl = document.getElementById('drawerMetaOwasp');
  const cweEl = document.getElementById('drawerMetaCwe');
  const confEl = document.getElementById('drawerMetaConfidence');
  const engEl = document.getElementById('drawerMetaEngine');

  if (owaspEl) owaspEl.textContent = v.owasp_category || 'OWASP Top 10:2025';
  if (cweEl) cweEl.textContent = v.cwe || 'CWE';
  if (confEl) confEl.textContent = v.confidence || 'Cao';
  if (engEl) engEl.textContent = currentActiveReport?.model_used || 'Groq 120B / Gemini';

  const explEl = document.getElementById('drawerExplanation');
  if (explEl) explEl.textContent = v.explanation || 'Chưa có thông tin giải thích chi tiết.';

  const scenSec = document.getElementById('drawerScenarioSection');
  const scenBox = document.getElementById('drawerScenario');
  if (scenSec && scenBox) {
    if (v.attack_scenario) {
      scenSec.style.display = 'block';
      scenBox.textContent = v.attack_scenario;
    } else {
      scenSec.style.display = 'none';
    }
  }

  // Evidence Tab
  const startLine = v.start_line || v.line_number || 1;
  const endLine = v.end_line || startLine;
  const evLineEl = document.getElementById('drawerEvidenceLine');
  const evCodeEl = document.getElementById('drawerEvidenceCode');
  if (evLineEl) evLineEl.textContent = startLine === endLine ? `Dòng ${startLine}:` : `Dòng ${startLine}-${endLine}:`;
  if (evCodeEl) evCodeEl.textContent = v.affected_lines || '// Không có đoạn code trích xuất';

  // Fix Tab
  const remEl = document.getElementById('drawerRemediation');
  if (remEl) remEl.textContent = v.remediation || 'Khắc phục bằng cách áp dụng chuẩn mã hóa và kiểm tra dữ liệu đầu vào.';

  const diffBeforeEl = document.getElementById('drawerDiffBefore');
  const diffAfterEl = document.getElementById('drawerDiffAfter');
  if (diffBeforeEl) diffBeforeEl.textContent = v.affected_lines || '// Đoạn code có nguy cơ';
  if (diffAfterEl) diffAfterEl.textContent = v.fixed_code || '// Code mẫu an toàn';

  const undoBtn = document.getElementById('btnUndoFix');
  if (undoBtn) undoBtn.style.display = (editorCodeSnapshotBeforeFix ? 'inline-flex' : 'none');

  // References Tab
  const cweNum = (v.cwe || '').replace(/\D/g, '');
  const cweLink = document.getElementById('drawerCweLink');
  const cweTitle = document.getElementById('drawerCweLinkTitle');
  if (cweLink && cweNum) {
    cweLink.href = `https://cwe.mitre.org/data/definitions/${cweNum}.html`;
    if (cweTitle) cweTitle.textContent = `MITRE CWE-${cweNum} Specification`;
  }
}

// Quick Fix Engine
function applyFixToEditor() {
  if (activeFindingIndex < 0 || !activeFindingList[activeFindingIndex]) {
    alert('Vui lòng chọn một lỗ hổng trong danh sách để áp dụng Fix.');
    return;
  }
  const v = activeFindingList[activeFindingIndex];
  if (!v.fixed_code) {
    alert('Lỗ hổng này không có đoạn code mẫu (fixed_code) để áp dụng tự động.');
    return;
  }

  const code = getEditorCode();
  editorCodeSnapshotBeforeFix = code;

  let startLine = Number.parseInt(v.start_line || v.line_number, 10) || 1;
  let endLine = Number.parseInt(v.end_line || startLine, 10) || startLine;

  if (isMonacoLoaded && monacoInstance && window.monaco) {
    const model = monacoInstance.getModel();
    const maxCol = model.getLineMaxColumn(endLine);
    const range = new window.monaco.Range(startLine, 1, endLine, maxCol);

    monacoInstance.executeEdits('appsec-quick-fix', [{
      range: range,
      text: v.fixed_code,
      forceMoveMarkers: true
    }]);
    monacoInstance.pushUndoStop();
  } else {
    const lines = code.split('\n');
    lines.splice(startLine - 1, (endLine - startLine + 1), v.fixed_code);
    setEditorCode(lines.join('\n'));
  }

  const filePath = (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]?.path) || 'Mã nguồn hiện tại';
  setFindingState(v, filePath, 'fixed');

  const undoBtn = document.getElementById('btnUndoFix');
  if (undoBtn) undoBtn.style.display = 'inline-flex';

  alert(`✅ Đã áp dụng bản vá an toàn cho "${v.type}" tại dòng ${startLine}!`);
}

function undoFixInEditor() {
  if (!editorCodeSnapshotBeforeFix) return;
  setEditorCode(editorCodeSnapshotBeforeFix);
  editorCodeSnapshotBeforeFix = null;

  if (activeFindingIndex >= 0 && activeFindingList[activeFindingIndex]) {
    const v = activeFindingList[activeFindingIndex];
    const filePath = (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]?.path) || 'Mã nguồn hiện tại';
    setFindingState(v, filePath, 'open');
  }

  const undoBtn = document.getElementById('btnUndoFix');
  if (undoBtn) undoBtn.style.display = 'none';

  alert('↩ Đã hoàn tác mã nguồn lại trạng thái trước khi Fix.');
}

function createPullRequestPatch() {
  if (activeFindingIndex < 0 || !activeFindingList[activeFindingIndex]) {
    alert('Vui lòng chọn một lỗ hổng.');
    return;
  }
  const v = activeFindingList[activeFindingIndex];
  const filePath = (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]?.path) || 'source_code.js';

  let patch = `--- a/${filePath}\n+++ b/${filePath}\n@@ -${v.start_line || 1},1 +${v.start_line || 1},1 @@\n`;
  if (v.affected_lines) {
    v.affected_lines.split('\n').forEach(line => { patch += `-${line}\n`; });
  }
  if (v.fixed_code) {
    v.fixed_code.split('\n').forEach(line => { patch += `+${line}\n`; });
  }

  const filename = `patch_${v.type ? v.type.replace(/\W+/g, '_') : 'fix'}_${Date.now()}.diff`;
  downloadBlobFile(patch, filename, 'text/plain;charset=utf-8');
  alert(`🚀 Đã tạo file Git Patch (${filename}). Bạn có thể dùng lệnh: git apply ${filename}`);
}

// Navigation (F8 / Shift+F8)
function navigateNextFinding() {
  if (!activeFindingList || !activeFindingList.length) return;
  let nextIdx = activeFindingIndex + 1;
  if (nextIdx >= activeFindingList.length) nextIdx = 0;
  selectVulnerability(nextIdx);
}

function navigatePrevFinding() {
  if (!activeFindingList || !activeFindingList.length) return;
  let prevIdx = activeFindingIndex - 1;
  if (prevIdx < 0) prevIdx = activeFindingList.length - 1;
  selectVulnerability(prevIdx);
}

// Update Findings UI List & Gate Status
function updateFindingsUI() {
  const list = document.getElementById('sidebarFindingsList');
  if (!list) return;

  const vulns = activeFindingList || [];
  const filePath = (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]?.path) || 'Mã nguồn hiện tại';

  let countCrit = 0, countHigh = 0, countMed = 0, countLow = 0;
  let countOpen = 0, countFixed = 0, countIgnored = 0;

  vulns.forEach(v => {
    const sev = (v.severity || 'Cao').toLowerCase();
    const st = getFindingState(v, filePath);

    if (st === 'open') {
      if (sev.includes('nghiêm trọng') || sev.includes('critical')) countCrit++;
      else if (sev.includes('thấp') || sev.includes('low')) countLow++;
      else if (sev.includes('trung') || sev.includes('medium')) countMed++;
      else countHigh++;
      countOpen++;
    } else if (st === 'fixed') {
      countFixed++;
    } else {
      countIgnored++;
    }
  });

  const elCrit = document.getElementById('countCrit');
  const elHigh = document.getElementById('countHigh');
  const elMed = document.getElementById('countMed');
  const elLow = document.getElementById('countLow');
  if (elCrit) elCrit.textContent = countCrit;
  if (elHigh) elHigh.textContent = countHigh;
  if (elMed) elMed.textContent = countMed;
  if (elLow) elLow.textContent = countLow;

  const elOpen = document.getElementById('countStatusOpen');
  const elFixed = document.getElementById('countStatusFixed');
  const elIgnored = document.getElementById('countStatusIgnored');
  if (elOpen) elOpen.textContent = countOpen;
  if (elFixed) elFixed.textContent = countFixed;
  if (elIgnored) elIgnored.textContent = countIgnored;

  const findingsNavBadge = document.getElementById('findingsNavBadge');
  if (findingsNavBadge) {
    if (countOpen > 0) {
      findingsNavBadge.style.display = 'inline-block';
      findingsNavBadge.textContent = countOpen;
    } else {
      findingsNavBadge.style.display = 'none';
    }
  }

  const showOpen = document.getElementById('chkFilterOpen')?.checked ?? true;
  const showFixed = document.getElementById('chkFilterFixed')?.checked ?? false;
  const showIgnored = document.getElementById('chkFilterIgnored')?.checked ?? false;

  const filtered = vulns.map((v, idx) => ({ ...v, originalIndex: idx })).filter(v => {
    const st = getFindingState(v, filePath);
    if (st === 'open' && !showOpen) return false;
    if (st === 'fixed' && !showFixed) return false;
    if ((st === 'ignored' || st === 'false_positive' || st === 'accepted_risk') && !showIgnored) return false;

    const sev = (v.severity || 'Cao').toLowerCase();
    if (findingFilterSev === 'critical' && !sev.includes('nghiêm trọng') && !sev.includes('critical')) return false;
    if (findingFilterSev === 'high' && !sev.includes('cao') && !sev.includes('high')) return false;
    if (findingFilterSev === 'medium' && !sev.includes('trung') && !sev.includes('medium')) return false;
    if (findingFilterSev === 'low' && !sev.includes('thấp') && !sev.includes('low')) return false;

    if (findingSearchQuery) {
      const q = findingSearchQuery.toLowerCase();
      const text = `${v.type} ${v.cwe} ${v.owasp_category} ${v.explanation}`.toLowerCase();
      if (!text.includes(q)) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="sidebar-empty-hint">
        ${vulns.length === 0 ? 'Chưa phát hiện lỗ hổng bảo mật nào trong file này.' : 'Không có phát hiện nào phù hợp với bộ lọc.'}
      </div>
    `;
  } else {
    let html = '';
    filtered.forEach(v => {
      const idx = v.originalIndex;
      const st = getFindingState(v, filePath);
      const sev = (v.severity || 'Cao').toLowerCase();
      let sevSlug = 'cao';
      if (sev.includes('nghiêm trọng') || sev.includes('critical')) sevSlug = 'nghiêm-trọng';
      else if (sev.includes('thấp') || sev.includes('low')) sevSlug = 'thấp';
      else if (sev.includes('trung') || sev.includes('medium')) sevSlug = 'trung-bình';

      const startLine = v.start_line || v.line_number || 1;
      const endLine = v.end_line || startLine;
      const lineText = startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`;
      const isActive = (idx === activeFindingIndex);

      html += `
        <div class="findings-item-card ${isActive ? 'active' : ''} state-${st}" data-index="${idx}" onclick="selectVulnerability(${idx})">
          <div class="card-top-row">
            <span class="vuln-badge-severity severity-${sevSlug}">${escapeHtml(v.severity || 'Cao')}</span>
            <span class="card-loc">${lineText}</span>
          </div>
          <div class="card-title">${escapeHtml(v.type || 'Lỗ hổng bảo mật')}</div>
          <div class="card-bottom-row">
            <span>${escapeHtml(v.cwe || 'CWE')}</span>
            <span>${st === 'fixed' ? '✅ Fixed' : (st === 'open' ? '🔴 Open' : '⏸️ ' + st)}</span>
          </div>
        </div>
      `;
    });
    list.innerHTML = html;
  }

  // Security Gate Status Evaluation
  const gateFailed = (countCrit > 0 || countHigh > 0);
  const gateCard = document.getElementById('securityGateCard');
  const gateTitle = document.getElementById('gateStatusTitle');
  const gateDesc = document.getElementById('gateStatusDesc');
  const gateIcon = document.getElementById('gateIconLarge');
  const gateBadge = document.getElementById('editorGateBadge');

  if (gateFailed) {
    if (gateCard) gateCard.className = 'gate-status-card failed';
    if (gateTitle) gateTitle.textContent = 'SECURITY GATE: FAILED';
    if (gateDesc) gateDesc.textContent = `Tồn đọng ${countCrit} Nghiêm trọng & ${countHigh} Cao chưa xử lý!`;
    if (gateIcon) gateIcon.textContent = '🚨';
    if (gateBadge) {
      gateBadge.className = 'gate-chip gate-chip-fail';
      gateBadge.textContent = '🔴 Gate Failed';
    }
  } else {
    if (gateCard) gateCard.className = 'gate-status-card passed';
    if (gateTitle) gateTitle.textContent = 'SECURITY GATE: PASSED';
    if (gateDesc) gateDesc.textContent = 'Không có lỗ hổng Nghiêm trọng hoặc Cao nào đang mở.';
    if (gateIcon) gateIcon.textContent = '🛡️';
    if (gateBadge) {
      gateBadge.className = 'gate-chip gate-chip-pass';
      gateBadge.textContent = '🟢 Gate Passed';
    }
  }
}

function updateScanDiffMetrics(newVulns = [], filePath) {
  const currentFps = new Set(newVulns.map(v => computeFindingFingerprint(v, filePath)));
  let diffNew = 0;
  let diffResolved = 0;

  currentFps.forEach(fp => {
    if (!previousScanFingerprints.has(fp)) {
      diffNew++;
    }
  });

  previousScanFingerprints.forEach(fp => {
    if (!currentFps.has(fp)) {
      diffResolved++;
    }
  });

  const diffNewEl = document.getElementById('diffNewCount');
  const diffResolvedEl = document.getElementById('diffResolvedCount');
  const diffRemainedEl = document.getElementById('diffRemainedCount');
  if (diffNewEl) diffNewEl.textContent = `+${diffNew}`;
  if (diffResolvedEl) diffResolvedEl.textContent = `-${diffResolved}`;
  if (diffRemainedEl) diffRemainedEl.textContent = `${currentFps.size}`;

  previousScanFingerprints = currentFps;
}

// Command Palette Engine
const COMMANDS = [
  { id: 'scan_file', title: 'Run Security Scan (Current File)', icon: '⚡', shortcut: 'Ctrl+Enter', action: () => handleScan() },
  { id: 'scan_project', title: 'Run Project Scan (All Files)', icon: '⚡', shortcut: '', action: () => handleScanAllFolder() },
  { id: 'next_vuln', title: 'Next Vulnerability Finding', icon: '▶', shortcut: 'F8', action: () => navigateNextFinding() },
  { id: 'prev_vuln', title: 'Previous Vulnerability Finding', icon: '◀', shortcut: 'Shift+F8', action: () => navigatePrevFinding() },
  { id: 'apply_fix', title: 'Apply Quick Fix for Active Issue', icon: '🛠️', shortcut: '', action: () => applyFixToEditor() },
  { id: 'undo_fix', title: 'Undo Last Applied Fix', icon: '↩', shortcut: '', action: () => undoFixInEditor() },
  { id: 'toggle_sidebar', title: 'Toggle Primary Sidebar', icon: '📁', shortcut: 'Ctrl+B', action: () => togglePrimarySidebar() },
  { id: 'view_explorer', title: 'View: Show Explorer', icon: '📁', shortcut: 'Ctrl+Shift+E', action: () => switchSidebarView('explorer') },
  { id: 'view_findings', title: 'View: Show Findings', icon: '🛡️', shortcut: 'Ctrl+Shift+F', action: () => switchSidebarView('findings') },
  { id: 'view_scan', title: 'View: Show Scan Engine & Pipeline', icon: '⚡', shortcut: '', action: () => switchSidebarView('scan') },
  { id: 'view_risk', title: 'View: Show Project Risk & Security Gate', icon: '📊', shortcut: '', action: () => switchSidebarView('risk') },
  { id: 'toggle_drawer', title: 'Toggle Vulnerability Inspector Drawer', icon: '📋', shortcut: '', action: () => toggleSecondaryDrawer() },
  { id: 'toggle_problems', title: 'Toggle Problems Panel', icon: '⚠️', shortcut: '', action: () => toggleProblemsPanel() },
  { id: 'config_api', title: 'Settings: Configure AI API Keys', icon: '🔑', shortcut: '', action: () => openApiKeyModalBtn.click() },
  { id: 'export_code', title: 'Export Current Source Code File', icon: '💾', shortcut: '', action: () => exportCodeBtn.click() },
  { id: 'export_report', title: 'Export Security Audit Report (Markdown)', icon: '📄', shortcut: '', action: () => exportSecurityReport() }
];

let filteredCommands = [];
let paletteSelectedIndex = 0;

function openCommandPalette() {
  const modal = document.getElementById('commandPaletteModal');
  const input = document.getElementById('paletteSearchInput');
  if (!modal || !input) return;
  modal.style.display = 'flex';
  input.value = '';
  input.focus();
  renderPaletteCommands('');
}

function closeCommandPalette() {
  const modal = document.getElementById('commandPaletteModal');
  if (modal) modal.style.display = 'none';
}

function renderPaletteCommands(query = '') {
  const list = document.getElementById('paletteResultsList');
  if (!list) return;
  const q = query.trim().toLowerCase();
  filteredCommands = COMMANDS.filter(c => !q || c.title.toLowerCase().includes(q) || c.id.includes(q));
  paletteSelectedIndex = 0;

  if (filteredCommands.length === 0) {
    list.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-dim);font-size:0.8rem;">Không tìm thấy lệnh phù hợp</div>';
    return;
  }

  list.innerHTML = filteredCommands.map((c, idx) => `
    <div class="palette-item ${idx === 0 ? 'active' : ''}" data-idx="${idx}">
      <div class="palette-item-left">
        <span>${c.icon}</span>
        <span>${escapeHtml(c.title)}</span>
      </div>
      ${c.shortcut ? `<span class="palette-item-shortcut">${escapeHtml(c.shortcut)}</span>` : ''}
    </div>
  `).join('');

  list.querySelectorAll('.palette-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = Number.parseInt(item.getAttribute('data-idx'), 10);
      executePaletteCommand(idx);
    });
  });
}

function executePaletteCommand(idx) {
  if (idx >= 0 && idx < filteredCommands.length) {
    const cmd = filteredCommands[idx];
    closeCommandPalette();
    try {
      cmd.action();
    } catch (err) {
      console.error('Lỗi khi thực thi lệnh:', err);
    }
  }
}

function toggleProblemsPanel() {
  if (problemsPanel) {
    problemsPanel.classList.toggle('collapsed');
    if (isMonacoLoaded && monacoInstance) {
      setTimeout(() => monacoInstance.layout(), 220);
    }
  }
}

// Attach All AppSec Studio IDE Listeners
function setupAppSecStudioListeners() {
  loadVulnStates();

  // Activity Bar Switcher
  document.querySelectorAll('.activity-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchSidebarView(btn.dataset.view);
    });
  });

  // Sidebar toggles
  document.getElementById('togglePrimarySidebarBtn')?.addEventListener('click', () => togglePrimarySidebar());
  document.getElementById('sidebarCollapseBtn')?.addEventListener('click', () => togglePrimarySidebar(true));
  document.getElementById('breadcrumbToggleSidebarBtn')?.addEventListener('click', () => togglePrimarySidebar());

  // Drawer toggles
  document.getElementById('toggleDrawerBtn')?.addEventListener('click', () => toggleSecondaryDrawer());
  document.getElementById('closeDrawerBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSecondaryDrawer(false);
  });
  document.getElementById('closePaletteBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCommandPalette();
  });

  // Drawer tabs
  document.querySelectorAll('.drawer-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchDrawerTab(tab.dataset.pane);
    });
  });

  // Drawer Jump To Code button
  document.getElementById('drawerJumpToCodeBtn')?.addEventListener('click', () => {
    if (activeFindingIndex >= 0 && activeFindingList[activeFindingIndex]) {
      revealVulnerabilityInEditor(activeFindingList[activeFindingIndex]);
    }
  });

  // Drawer State Change Selector
  const drawerStateSelect = document.getElementById('drawerStateSelect');
  if (drawerStateSelect) {
    drawerStateSelect.addEventListener('change', (e) => {
      if (activeFindingIndex < 0 || !activeFindingList[activeFindingIndex]) return;
      const v = activeFindingList[activeFindingIndex];
      const filePath = (activeFileIndex >= 0 && uploadedFiles[activeFileIndex]?.path) || 'Mã nguồn hiện tại';
      const newState = e.target.value;

      if (newState === 'ignored' || newState === 'false_positive' || newState === 'accepted_risk') {
        pendingIgnoreFinding = { v, filePath, state: newState };
        const modal = document.getElementById('ignoreReasonModal');
        if (modal) modal.style.display = 'flex';
      } else {
        setFindingState(v, filePath, newState);
      }
    });
  }

  // Ignore Modal Actions
  const ignoreModal = document.getElementById('ignoreReasonModal');
  const closeIgnoreModal = () => {
    if (ignoreModal) ignoreModal.style.display = 'none';
    pendingIgnoreFinding = null;
  };

  document.getElementById('closeIgnoreModalBtn')?.addEventListener('click', closeIgnoreModal);
  document.getElementById('cancelIgnoreBtn')?.addEventListener('click', () => {
    if (pendingIgnoreFinding && drawerStateSelect) {
      drawerStateSelect.value = getFindingState(pendingIgnoreFinding.v, pendingIgnoreFinding.filePath);
    }
    closeIgnoreModal();
  });

  document.getElementById('confirmIgnoreBtn')?.addEventListener('click', () => {
    if (pendingIgnoreFinding) {
      const reason = document.getElementById('ignoreReasonSelect')?.value || 'accepted_risk';
      const notes = document.getElementById('ignoreNotesInput')?.value || '';
      setFindingState(pendingIgnoreFinding.v, pendingIgnoreFinding.filePath, pendingIgnoreFinding.state, reason, notes);
    }
    closeIgnoreModal();
  });

  // Quick Fix Buttons
  document.getElementById('btnApplyFix')?.addEventListener('click', applyFixToEditor);
  document.getElementById('btnUndoFix')?.addEventListener('click', undoFixInEditor);
  document.getElementById('btnCreatePr')?.addEventListener('click', createPullRequestPatch);

  // F8 Navigation buttons
  document.getElementById('btnNextFinding')?.addEventListener('click', navigateNextFinding);
  document.getElementById('btnPrevFinding')?.addEventListener('click', navigatePrevFinding);

  // Findings Filters
  document.getElementById('chkFilterOpen')?.addEventListener('change', updateFindingsUI);
  document.getElementById('chkFilterFixed')?.addEventListener('change', updateFindingsUI);
  document.getElementById('chkFilterIgnored')?.addEventListener('change', updateFindingsUI);

  document.querySelectorAll('.sev-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.sev-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      findingFilterSev = chip.dataset.sev || 'all';
      updateFindingsUI();
    });
  });

  const findingSearch = document.getElementById('findingSearchInput');
  if (findingSearch) {
    findingSearch.addEventListener('input', (e) => {
      findingSearchQuery = e.target.value;
      updateFindingsUI();
    });
  }

  // Scope & Scan triggers
  const sidebarRunScanBtn = document.getElementById('sidebarRunScanBtn');
  if (sidebarRunScanBtn) {
    sidebarRunScanBtn.addEventListener('click', () => {
      const scope = document.querySelector('input[name="scanScopeRadio"]:checked')?.value || 'file';
      if (scope === 'project') {
        handleScanAllFolder();
      } else if (scope === 'git') {
        openGitModalBtn?.click();
      } else {
        handleScan();
      }
    });
  }

  document.querySelectorAll('input[name="scanScopeRadio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const badge = document.getElementById('editorScopeBadge');
      if (badge) {
        badge.textContent = (e.target.value === 'project') ? '📁 Project Scope' : ((e.target.value === 'git') ? '🔗 Git Scope' : '📄 File Scope');
      }
    });
  });

  // Problems panel toggle
  document.getElementById('toggleProblemsBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleProblemsPanel();
  });
  document.getElementById('problemsPanelHeader')?.addEventListener('click', () => {
    toggleProblemsPanel();
  });

  // Settings view shortcut to API Modal
  document.getElementById('sidebarApiKeyBtn')?.addEventListener('click', () => {
    openApiKeyModalBtn?.click();
  });

  // Command Palette open button
  document.getElementById('openCommandPaletteBtn')?.addEventListener('click', openCommandPalette);

  // Command Palette Input Events
  const paletteInput = document.getElementById('paletteSearchInput');
  if (paletteInput) {
    paletteInput.addEventListener('input', (e) => {
      renderPaletteCommands(e.target.value);
    });

    paletteInput.addEventListener('keydown', (e) => {
      const items = document.querySelectorAll('.palette-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        paletteSelectedIndex = (paletteSelectedIndex + 1) % items.length;
        items.forEach((it, i) => it.classList.toggle('active', i === paletteSelectedIndex));
        items[paletteSelectedIndex]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        paletteSelectedIndex = (paletteSelectedIndex - 1 + items.length) % items.length;
        items.forEach((it, i) => it.classList.toggle('active', i === paletteSelectedIndex));
        items[paletteSelectedIndex]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executePaletteCommand(paletteSelectedIndex);
      } else if (e.key === 'Escape') {
        closeCommandPalette();
      }
    });
  }

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // F8: Next Finding
    if (e.key === 'F8') {
      e.preventDefault();
      if (e.shiftKey) {
        navigatePrevFinding();
      } else {
        navigateNextFinding();
      }
      return;
    }

    // Ctrl + B: Toggle Sidebar
    if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      togglePrimarySidebar();
      return;
    }

    // Ctrl + Shift + P or F1: Command Palette
    if ((e.ctrlKey && e.shiftKey && (e.key === 'p' || e.key === 'P')) || e.key === 'F1') {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    // Ctrl + Shift + E: Explorer View
    if (e.ctrlKey && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      switchSidebarView('explorer');
      return;
    }

    // Ctrl + Shift + F: Findings View
    if (e.ctrlKey && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      switchSidebarView('findings');
      return;
    }

    // Escape: Close all modals and secondary drawer
    if (e.key === 'Escape') {
      closeCommandPalette();
      closeIgnoreModal();
      if (gitModal) { gitModal.classList.remove('active'); gitModal.style.display = 'none'; }
      if (guideModal) { guideModal.classList.remove('active'); guideModal.style.display = 'none'; }
      if (apiKeyModal) { apiKeyModal.classList.remove('active'); apiKeyModal.style.display = 'none'; }
    }
  });

  // Modal backdrop clicks
  document.getElementById('commandPaletteModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'commandPaletteModal') closeCommandPalette();
  });
  document.getElementById('ignoreReasonModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'ignoreReasonModal') closeIgnoreModal();
  });

  // Universal Click Delegation for all Close (X) buttons across the entire app
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.btn-close, .drawer-close-btn, .palette-close-btn, [data-dismiss="modal"]');
    if (!closeBtn) return;

    // 1. Secondary drawer close button or inside secondary drawer
    if (closeBtn.id === 'closeDrawerBtn' || closeBtn.classList.contains('drawer-close-btn') || closeBtn.closest('#secondaryDrawer')) {
      e.preventDefault();
      e.stopPropagation();
      toggleSecondaryDrawer(false);
      return;
    }

    // 2. Command palette close button
    if (closeBtn.id === 'closePaletteBtn' || closeBtn.classList.contains('palette-close-btn') || closeBtn.closest('#commandPaletteModal')) {
      e.preventDefault();
      e.stopPropagation();
      closeCommandPalette();
      return;
    }

    // 3. Any modal overlay
    const modal = closeBtn.closest('.modal-overlay');
    if (modal) {
      e.preventDefault();
      e.stopPropagation();
      modal.classList.remove('active');
      modal.style.display = 'none';
      if (modal.id === 'ignoreReasonModal') {
        pendingIgnoreFinding = null;
      }
    }
  });
}

// Auto-invoke setupAppSecStudioListeners on window load or DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupAppSecStudioListeners);
} else {
  setupAppSecStudioListeners();
}

