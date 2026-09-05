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
const codeEditor = document.getElementById('codeEditor');
const codeViewer = document.getElementById('codeViewer');
const languageSelect = document.getElementById('languageSelect');
const sampleChips = document.getElementById('sampleChips');
const scanBtn = document.getElementById('scanBtn');
const clearBtn = document.getElementById('clearBtn');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');

const lineCount = document.getElementById('lineCount');
const charCount = document.getElementById('charCount');
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
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml'
};

const CODE_EXTENSIONS = new Set([
  'py', 'js', 'jsx', 'ts', 'tsx', 'php', 'java', 'go', 'cs', 'sql', 'c', 'cpp', 'rb', 'sh', 'html', 'json', 'yaml', 'yml'
]);

// Init
document.addEventListener('DOMContentLoaded', () => {
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
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
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

// Kiểm tra trạng thái kết nối backend
async function fetchServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    if (data.ai_configured) {
      aiStatusBadge.className = 'status-badge online';
      aiStatusBadge.querySelector('.status-text').textContent = `AI Online (${data.model})`;
    } else {
      aiStatusBadge.className = 'status-badge warning';
      aiStatusBadge.querySelector('.status-text').textContent = 'Heuristic Mode (Mô phỏng sẵn)';
    }
  } catch (err) {
    aiStatusBadge.className = 'status-badge';
    aiStatusBadge.querySelector('.status-text').textContent = 'Offline';
  }
}

// Lấy danh sách mẫu code
async function fetchSamples() {
  try {
    const res = await fetch('/api/samples');
    const data = await res.json();
    samplesData = data.samples || [];
    renderSampleChips();
  } catch (err) {
    sampleChips.innerHTML = '<span style="color:#f85149;font-size:0.8rem;">Lỗi tải mẫu</span>';
  }
}

// Render chip các mẫu thử
function renderSampleChips() {
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
  codeEditor.value = sample.code;
  languageSelect.value = sample.language || 'auto';
  updateEditorStats();
  switchViewTab('detail');
  resetResults();
  codeEditor.focus();
}

// Cập nhật số dòng & ký tự
function updateEditorStats() {
  const text = codeEditor.value;
  const lines = text ? text.split('\n').length : 0;
  lineCount.textContent = lines;
  charCount.textContent = text.length;
}

// Xử lý nạp danh sách file từ fileInput hoặc folderInput
async function handleFilesSelected(fileList) {
  const filesArray = Array.from(fileList);
  if (!filesArray.length) return;

  const filtered = filesArray.filter(f => {
    const p = f.webkitRelativePath || f.name;
    if (p.includes('node_modules/') || p.includes('.git/') || p.includes('dist/') || p.includes('.idea/')) {
      return false;
    }
    const ext = f.name.split('.').pop().toLowerCase();
    return CODE_EXTENSIONS.has(ext);
  });

  if (!filtered.length) {
    alert('Không tìm thấy file mã nguồn phù hợp (.js, .ts, .py, .php, .java, .go, .sql,...) trong thư mục đã chọn.');
    return;
  }

  uploadedFiles = [];
  for (const file of filtered) {
    const content = await file.text();
    const ext = file.name.split('.').pop().toLowerCase();
    const lang = EXT_TO_LANG[ext] || 'auto';
    uploadedFiles.push({
      name: file.name,
      path: file.webkitRelativePath || file.name,
      content,
      language: lang,
      result: null
    });
  }

  setupFolderView(`${uploadedFiles.length} file`);
}

function setupFolderView(badgeText) {
  fileCountBadge.textContent = badgeText;
  folderSidebar.style.display = 'flex';
  mainLayout.classList.add('has-sidebar');
  tabSummaryView.style.display = 'flex';

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
    if (file.result) {
      if (file.result.is_safe) {
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
  codeEditor.value = file.content;
  languageSelect.value = file.language || 'auto';
  updateEditorStats();
  renderFileTree();

  switchViewTab('detail');

  if (file.result) {
    renderReport(file.result, file.duration || '0.1');
  } else {
    resetResults();
    renderCodeViewerWithHighlights(file.content, []);
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
  });

  if (fileSearchInput) {
    fileSearchInput.addEventListener('input', renderFileTree);
  }

  tabDetailView.addEventListener('click', () => switchViewTab('detail'));
  tabSummaryView.addEventListener('click', () => switchViewTab('summary'));
  tabHistoryView.addEventListener('click', () => switchViewTab('history'));

  clearBtn.addEventListener('click', () => {
    codeEditor.value = '';
    uploadedFiles = [];
    activeFileIndex = -1;
    folderSidebar.style.display = 'none';
    mainLayout.classList.remove('has-sidebar');
    tabSummaryView.style.display = 'none';
    currentFileTitle.textContent = 'Mã nguồn cần quét';
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    updateEditorStats();
    switchViewTab('detail');
    resetResults();
  });

  fileInput.addEventListener('change', (e) => {
    handleFilesSelected(e.target.files);
    fileInput.value = '';
  });

  folderInput.addEventListener('change', (e) => {
    handleFilesSelected(e.target.files);
    folderInput.value = '';
  });

  scanBtn.addEventListener('click', handleScan);
  scanAllFolderBtn.addEventListener('click', handleScanAllFolder);

  // GitHub Modal Events
  openGitModalBtn.addEventListener('click', () => {
    gitModal.classList.add('active');
    gitRepoUrl.focus();
  });

  closeGitModalBtn.addEventListener('click', () => {
    gitModal.classList.remove('active');
  });

  cancelGitBtn.addEventListener('click', () => {
    gitModal.classList.remove('active');
  });

  submitGitBtn.addEventListener('click', handleFetchAndScanGit);

  gitModal.addEventListener('click', (e) => {
    if (e.target === gitModal) gitModal.classList.remove('active');
  });

  // Guide Modal Events
  viewGuideBtn.addEventListener('click', () => {
    guideModal.classList.add('active');
  });

  closeModalBtn.addEventListener('click', () => {
    guideModal.classList.remove('active');
  });

  guideModal.addEventListener('click', (e) => {
    if (e.target === guideModal) {
      guideModal.classList.remove('active');
    }
  });
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
  let scannedCount = 0;
  let vulnFilesCount = 0;

  for (let i = 0; i < uploadedFiles.length; i++) {
    const file = uploadedFiles[i];
    activeFileIndex = i;
    currentFileTitle.textContent = file.path;
    codeEditor.value = file.content;
    languageSelect.value = file.language || 'auto';
    updateEditorStats();
    renderFileTree();

    resultsContainer.innerHTML = `
      <div class="loading-box">
        <div class="spinner"></div>
        <div style="text-align: center;">
          <h3 style="margin-bottom: 6px;">Đang quét (${i + 1}/${uploadedFiles.length}): ${escapeHtml(file.path)}</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem;">Kiểm tra các mẫu bảo mật OWASP Top 10...</p>
        </div>
      </div>
    `;

    try {
      const startTime = Date.now();
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: file.content, language: file.language })
      });
      const data = await res.json();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (data.success) {
        file.result = data.result;
        file.duration = duration;
        if (!data.result.is_safe && data.result.vulnerabilities) {
          totalVulns += data.result.vulnerabilities.length;
          vulnFilesCount++;
        }
      }
      scannedCount++;
      renderFileTree();
    } catch (err) {
      console.error(err);
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

  // Tự động lưu kết quả quét toàn bộ thư mục vào Lịch sử (kèm snapshot để khôi phục)
  saveScanHistoryItem({
    type: 'folder_scan',
    title: `Quét thư mục (${scannedCount} file)`,
    total_files: uploadedFiles.length,
    scanned_files: scannedCount,
    vuln_files: vulnFilesCount,
    total_vulns: totalVulns,
    status: totalVulns > 0 ? 'vulnerable' : 'safe',
    snapshotFiles: uploadedFiles.map(f => ({
      name: f.name,
      path: f.path,
      content: f.content,
      language: f.language,
      duration: f.duration,
      result: f.result
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

  uploadedFiles.forEach(f => {
    if (f.result) {
      scannedFiles++;
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
      📊 Tổng quan | ${scannedFiles}/${totalFiles} file đã quét
    </span>
  `;

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
        <span class="stat-label">Tổng số lỗ hổng</span>
        <span class="stat-val ${totalVulns > 0 ? 'critical' : 'safe'}">${totalVulns}</span>
      </div>
    </div>

    <div class="report-header-banner ${totalVulns > 0 ? 'vulnerable' : 'safe'}" style="margin-bottom: 16px;">
      <div class="banner-status-icon">${totalVulns > 0 ? '🚨' : '🛡️'}</div>
      <div class="banner-status-info">
        <h3>${totalVulns > 0 ? `PHÁT HIỆN ${totalVulns} NGUY CƠ BẢO MẬT TRONG DỰ ÁN` : 'TẤT CẢ FILE ĐÃ QUÉT ĐỀU AN TOÀN (LGTM)'}</h3>
        <p>${totalVulns > 0 ? `Có ${vulnFiles} tệp mã nguồn chứa lỗ hổng nguy hiểm theo tiêu chuẩn OWASP Top 10 cần được xử lý ngay.` : 'Không phát hiện thấy dấu hiệu lỗ hổng nghiêm trọng nào trong thư mục.'}</p>
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

    if (file.result) {
      if (file.result.is_safe) {
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
    const badgeClass = isVuln ? 'severity-cao' : 'severity-thấp';
    const badgeText = isVuln ? `⚠️ ${item.total_vulns} Lỗ hổng` : (item.status === 'loaded' ? 'ℹ️ Đã nạp Git' : '✓ An toàn');
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
              const sfSafe = sf.result ? sf.result.is_safe : true;
              const sfCount = sf.result && sf.result.vulnerabilities ? sf.result.vulnerabilities.length : 0;
              return `
                <div class="history-subfile-item" onclick="restoreHistorySubFile(${index}, ${fileIdx})">
                  <div class="subfile-left">
                    <span class="file-chip-status ${sfSafe ? 'safe' : 'vuln'}"></span>
                    <span class="subfile-path">${escapeHtml(sf.path || sf.name)}</span>
                  </div>
                  <span class="tree-badge ${sfSafe ? 'safe' : 'vuln'}">
                    ${sfSafe ? 'Clean' : `${sfCount} Lỗi`}
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
  codeEditor.value = item.code || '';
  languageSelect.value = item.language || 'auto';
  updateEditorStats();
  switchViewTab('detail');
  if (item.result) {
    renderReport(item.result, item.duration || '0.1');
  }
}

// Reset giao diện kết quả
function resetResults() {
  if (codeEditor && codeViewer) {
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
  const code = codeEditor.value.trim();
  if (!code) {
    alert('Vui lòng dán hoặc nhập mã nguồn cần kiểm tra bảo mật.');
    codeEditor.focus();
    return;
  }

  if (isScanning) return;
  isScanning = true;

  scanBtn.disabled = true;
  scanBtn.querySelector('.btn-scan-text').textContent = 'Đang phân tích...';

  resultsContainer.innerHTML = `
    <div class="loading-box">
      <div class="spinner"></div>
      <div style="text-align: center;">
        <h3 style="margin-bottom: 6px;">Đang rà soát lỗ hổng bảo mật...</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Kiểm tra các quy tắc OWASP Top 10, cấu trúc luồng dữ liệu và phát hiện nguy cơ tiềm ẩn.</p>
      </div>
    </div>
  `;

  const startTime = Date.now();

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        language: languageSelect.value
      })
    });

    const data = await res.json();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!data.success) {
      renderError(data.error || 'Đã xảy ra lỗi không xác định.');
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
        status: data.result.is_safe ? 'safe' : 'vulnerable',
        total_vulns: data.result.vulnerabilities ? data.result.vulnerabilities.length : 0,
        summary: data.result.overall_summary,
        result: data.result
      });

      switchViewTab('detail');
      renderReport(data.result, duration);
    }
  } catch (err) {
    renderError('Không thể kết nối đến máy chủ quét: ' + err.message);
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
    codeEditor.value = item.code || '';
    languageSelect.value = item.language || 'auto';
    updateEditorStats();
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

// Render Báo cáo kết quả
function renderReport(result, duration) {
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
    // Tự động phân tích số dòng từ chuỗi (ví dụ: 'lines 45-53' hoặc 'line 45' hoặc 'Dòng 45')
    let lineToScroll = v.line_number;
    if (!lineToScroll && v.affected_lines) {
      const match = v.affected_lines.match(/(?:lines?|dòng)\s*(\d+)/i);
      if (match) {
        lineToScroll = parseInt(match[1], 10);
        v.line_number = lineToScroll;
      }
    }
    const lineLabel = lineToScroll ? `Dòng ${lineToScroll}: ` : '';

    html += `
      <div class="vuln-card">
        <div class="vuln-card-header">
          <div class="vuln-title-area">
            <span class="vuln-badge-severity severity-${severitySlug}">${escapeHtml(v.severity || 'Cao')}</span>
            <strong style="font-size: 0.95rem;">${index + 1}. ${escapeHtml(v.type || 'Lỗ hổng bảo mật')}</strong>
          </div>
          <span class="vuln-category-badge">${escapeHtml(v.owasp_category || 'OWASP Top 10')}</span>
        </div>

        <div class="vuln-card-body">
          ${v.affected_lines ? `
            <div class="vuln-field">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div class="vuln-field-label">📍 Vị trí / Đoạn code có lỗ hổng:</div>
                ${lineToScroll ? `
                  <button class="btn-goto-line" onclick="scrollToCodeLine(${lineToScroll})" title="Bấm để cuộn và bôi đỏ ngay dòng ${lineToScroll} trong khung code">
                    🔍 Xem ngay dòng ${lineToScroll} ➔
                  </button>
                ` : `
                  <button class="btn-goto-line" onclick="searchAndHighlightSnippet('${escapeJsString(v.affected_lines)}')" title="Bấm để tìm và bôi đỏ đoạn code này">
                    🔍 Tìm đến dòng lỗi ➔
                  </button>
                `}
              </div>
              <div class="vuln-code-snippet" style="color: #ff7b72; border-color: rgba(248,81,73,0.4); background: rgba(248,81,73,0.08); cursor: pointer;" onclick="scrollToCodeLine(${lineToScroll || 1})" title="Bấm vào để cuộn tới dòng code">
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
          ${recs.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  resultsContainer.innerHTML = html;

  // Bôi đỏ chính xác dòng code trên khung codeViewer
  renderCodeViewerWithHighlights(codeEditor.value, vulns);
}

// Render Code Viewer kèm số dòng và bôi đỏ chính xác dòng bị lỗi
function renderCodeViewerWithHighlights(codeText, vulnerabilities = []) {
  if (!codeViewer) return;

  const lines = codeText ? codeText.split('\n') : [''];
  const vulnLineMap = new Map();

  // Xác định các dòng code bị lỗi
  vulnerabilities.forEach(v => {
    let foundLine = -1;

    // 1. Nếu AI trả về line_number cụ thể
    if (v.line_number && v.line_number > 0 && v.line_number <= lines.length) {
      foundLine = v.line_number - 1;
    } 
    // 2. Tìm theo affected_lines
    else if (v.affected_lines) {
      const raw = v.affected_lines.trim();
      // Khớp trực tiếp
      const directIdx = lines.findIndex(l => l.trim().length > 3 && (l.includes(raw) || raw.includes(l.trim())));
      if (directIdx >= 0) {
        foundLine = directIdx;
      } else {
        // Tách các từ khóa chính (ví dụ: evp_bytestokey, hashlib.md5, requests.get...)
        const tokens = raw.split(/[\s,;()=]+/).filter(t => t.length > 4 && !['def', 'return', 'import', 'const', 'function'].includes(t));
        for (const token of tokens) {
          const tIdx = lines.findIndex(l => l.includes(token));
          if (tIdx >= 0) {
            foundLine = tIdx;
            break;
          }
        }
      }
    }

    if (foundLine >= 0) {
      vulnLineMap.set(foundLine, v.type);
      if (!v.line_number) {
        v.line_number = foundLine + 1;
      }
    }
  });

  // Hiển thị codeViewer kèm số dòng và bôi đỏ dòng lỗi
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
  if (!snippetText || !codeViewer) return;
  const lines = codeViewer.querySelectorAll('.code-line');
  
  // Trích xuất các token quan trọng (tên hàm, tên biến)
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
  // Nếu không tìm thấy thì cuộn dòng 1
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
