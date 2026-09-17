(() => {
  'use strict';

  const GENERATED_PATH_RE = /(^|\/)(node_modules|dist|build|vendor|coverage|\.git|\.idea)(\/|$)|\.min\.(?:js|css)$/i;

  function isGeneratedPath(value) {
    return GENERATED_PATH_RE.test(String(value || '').replace(/\\/g, '/'));
  }

  function fullSafe(result) {
    return Boolean(result && result.is_safe && !result.incomplete && !result.limited_coverage);
  }

  function projectProviderName(provider) {
    return ({
      openai: 'OpenAI',
      groq: 'Groq AI',
      gemini: 'Google Gemini',
      deepseek: 'DeepSeek',
      openrouter: 'OpenRouter',
      opencode: 'OpenCode.ai',
      custom: 'Universal AI'
    })[provider] || provider || 'Custom AI';
  }

  let lastProjectScanMeta = null;

  // Groq is the default UI choice when the browser has no saved provider yet.
  const originalLoadApiKeyModalState = loadApiKeyModalState;
  loadApiKeyModalState = function loadGroqDefaultApiState() {
    originalLoadApiKeyModalState();
    const config = getStoredApiConfig();
    if (!config) {
      keyProviderSelect.value = 'groq';
      updateProviderHints('groq');
    }
  };

  const originalFetchServerStatus = fetchServerStatus;
  fetchServerStatus = async function fetchServerStatusWithProviderName() {
    await originalFetchServerStatus();
    const config = getStoredApiConfig();
    if (config?.apiKey && aiStatusBadge) {
      aiStatusBadge.className = 'status-badge online';
      aiStatusBadge.querySelector('.status-text').textContent = `AI Online (${projectProviderName(config.provider)} Custom)`;
      aiStatusBadge.title = `Đang sử dụng API Key người dùng: ${config.model || 'Default model'}`;
    }
  };

  // Keep generated/minified files out of browser folder uploads too; backend also filters them.
  const originalHandleFilesSelected = handleFilesSelected;
  handleFilesSelected = async function handleFilesSelectedProjectAware(fileList) {
    await originalHandleFilesSelected(fileList);
    const before = uploadedFiles.length;
    uploadedFiles = uploadedFiles.filter(file => !isGeneratedPath(file.path || file.name));
    if (uploadedFiles.length && uploadedFiles.length !== before) {
      setupFolderView(`${uploadedFiles.length} file`);
    }
  };

  // File tree: partial AI coverage is not equivalent to Clean.
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
      if (file.scanSkipped) {
        badgeHost.innerHTML = '<span class="tree-badge" style="color:var(--text-dim);">Bỏ qua</span>';
      } else if (file.result?.incomplete) {
        badgeHost.innerHTML = '<span class="tree-badge" style="background:rgba(210,153,34,.2);color:#d29922;">Chưa xong</span>';
      } else if (file.result?.limited_coverage) {
        const coverage = Number(file.result.ai_coverage_percent || 0).toFixed(1).replace('.0', '');
        badgeHost.innerHTML = `<span class="tree-badge" style="background:rgba(210,153,34,.2);color:#d29922;">AI ${coverage}%</span>`;
      }
    });
  };

  // Folder/repository scan now goes through the project queue endpoint once, not one /api/scan call per file.
  handleScanAllFolder = async function handleProjectScan() {
    if (!uploadedFiles.length || isScanning) return;
    isScanning = true;
    scanAllFolderBtn.disabled = true;
    scanBtn.disabled = true;
    scanAllFolderBtn.textContent = '⏳ Đang quét project...';

    const startTime = Date.now();
    resultsContainer.innerHTML = `
      <div class="loading-box">
        <div class="spinner"></div>
        <div style="text-align:center;width:100%;max-width:560px;">
          <h3 style="margin-bottom:6px;">Đang quét toàn bộ project (${uploadedFiles.length} file)</h3>
          <p style="color:var(--text-muted);font-size:.85rem;line-height:1.6;">
            Gom file nhỏ vào batch, xếp queue tuần tự theo quota và kiểm tra dependency HTML ↔ JS / import ↔ module.
          </p>
          <div class="scan-stage-badge" style="margin-top:12px;">⚡ Project Scan Queue · Groq-friendly</div>
        </div>
      </div>`;

    try {
      const clientConfig = getStoredApiConfig();
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
      const data = await response.json();
      if (!response.ok || !data.success || !data.result) {
        throw new Error(data.error || `Lỗi HTTP ${response.status}`);
      }

      lastProjectScanMeta = data.result;
      const resultByPath = new Map((data.result.file_results || []).map(item => [item.path, item.result]));
      const skipped = new Set((data.result.skipped_files || []).map(item => item.path));
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      let totalVulns = 0;
      let successCount = 0;
      let failedCount = 0;
      let incompleteCount = 0;
      let limitedCoverageCount = 0;
      let vulnFilesCount = 0;

      uploadedFiles.forEach(file => {
        file.duration = duration;
        file.scanError = null;
        file.scanSkipped = skipped.has(file.path);
        const result = resultByPath.get(file.path);
        if (file.scanSkipped) {
          file.result = null;
          return;
        }
        if (!result) {
          file.result = null;
          file.scanError = 'Server không trả kết quả cho file này.';
          failedCount++;
          return;
        }
        file.result = result;
        if (result.scan_error) {
          file.scanError = result.scan_error;
          failedCount++;
          return;
        }
        successCount++;
        if (result.incomplete) incompleteCount++;
        else if (result.limited_coverage) limitedCoverageCount++;
        const count = result.vulnerabilities?.length || 0;
        if (count > 0) {
          totalVulns += count;
          vulnFilesCount++;
        }
      });

      if (totalVulns > 0) {
        summaryAlertBadge.style.display = 'inline-block';
        summaryAlertBadge.textContent = totalVulns;
      } else {
        summaryAlertBadge.style.display = 'none';
      }

      const scanStatus = data.result.status || (
        failedCount ? 'partial_error' : incompleteCount ? 'incomplete' : totalVulns ? 'vulnerable' : limitedCoverageCount ? 'limited_coverage' : 'safe'
      );

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
          name: file.name,
          path: file.path,
          content: file.content,
          language: file.language,
          duration: file.duration,
          result: file.result,
          scanError: file.scanError || null,
          scanSkipped: Boolean(file.scanSkipped)
        }))
      });

      renderFileTree();
      switchViewTab('summary');
    } catch (error) {
      console.error(error);
      renderSystemError({
        error: `Không thể hoàn tất project scan: ${error.message}`,
        provider: getStoredApiConfig()?.provider || 'Server AI',
        model: getStoredApiConfig()?.model || 'N/A'
      });
    } finally {
      isScanning = false;
      scanAllFolderBtn.disabled = false;
      scanBtn.disabled = false;
      scanAllFolderBtn.textContent = '⚡ Quét tất cả file';
    }
  };

  // Correct the existing folder dashboard after it renders.
  const originalRenderFolderSummaryDashboard = renderFolderSummaryDashboard;
  renderFolderSummaryDashboard = function renderProjectSummaryDashboard() {
    originalRenderFolderSummaryDashboard();
    const limitedFiles = uploadedFiles.filter(file => file.result?.limited_coverage && !file.result?.incomplete);
    const fullSafeFiles = uploadedFiles.filter(file => fullSafe(file.result));
    const skippedFiles = uploadedFiles.filter(file => file.scanSkipped);

    const statCards = resultsContainer.querySelectorAll('.stat-card');
    if (statCards[1]) {
      const value = statCards[1].querySelector('.stat-val');
      if (value) value.textContent = fullSafeFiles.length;
    }

    if (limitedFiles.length > 0) {
      const banner = resultsContainer.querySelector('.report-header-banner');
      if (banner && !uploadedFiles.some(file => file.scanError || file.result?.incomplete || (file.result?.vulnerabilities?.length || 0) > 0)) {
        banner.className = 'report-header-banner vulnerable';
        const icon = banner.querySelector('.banner-status-icon');
        const title = banner.querySelector('h3');
        const desc = banner.querySelector('p');
        if (icon) icon.textContent = '🔎';
        if (title) title.textContent = `${limitedFiles.length} FILE LỚN ĐƯỢC QUÉT TARGETED + SAMPLING`;
        if (desc) desc.textContent = 'Heuristic đã rà toàn file, nhưng AI chỉ đọc các vùng rủi ro và sampling. Không coi trạng thái này là full-scan Clean.';
      }
    }

    resultsContainer.querySelectorAll('.summary-file-row').forEach(row => {
      const filePath = row.querySelector('.row-path')?.textContent;
      const file = uploadedFiles.find(candidate => candidate.path === filePath);
      if (!file) return;
      const status = row.lastElementChild;
      if (file.scanSkipped && status) {
        status.innerHTML = '<span class="tree-badge" style="color:var(--text-dim);">Bỏ qua</span>';
      } else if (file.result?.limited_coverage && status) {
        const coverage = Number(file.result.ai_coverage_percent || 0).toFixed(1);
        status.innerHTML = `<span class="tree-badge" style="background:rgba(210,153,34,.2);color:#d29922;">🔎 AI ${coverage}%</span>`;
      }
    });

    if (lastProjectScanMeta?.stats) {
      const stats = lastProjectScanMeta.stats;
      resultMeta.innerHTML += ` <span style="font-size:.75rem;color:var(--text-dim);">· ${stats.scan_groups} queue group · ${stats.batched_groups} batch · ${stats.cross_file_checks} cross-file · ${skippedFiles.length} bỏ qua</span>`;
    }
  };

  // Report view: distinguish INCOMPLETE / LIMITED COVERAGE from true Clean and expose coverage numbers.
  const originalRenderReport = renderReport;
  renderReport = function renderCoverageAwareReport(result, duration) {
    originalRenderReport(result, duration);
    const banner = resultsContainer.querySelector('.report-header-banner');
    if (banner && result?.incomplete) {
      banner.className = 'report-header-banner vulnerable';
      const icon = banner.querySelector('.banner-status-icon');
      const title = banner.querySelector('h3');
      if (icon) icon.textContent = '⚠️';
      if (title) title.textContent = 'QUÉT CHƯA HOÀN TẤT - KHÔNG THỂ KẾT LUẬN AN TOÀN';
    } else if (banner && result?.is_safe && result?.limited_coverage) {
      banner.className = 'report-header-banner vulnerable';
      const icon = banner.querySelector('.banner-status-icon');
      const title = banner.querySelector('h3');
      if (icon) icon.textContent = '🔎';
      if (title) title.textContent = 'KHÔNG CÓ FINDING TRONG PHẦN AI ĐÃ KIỂM TRA';
    }

    if (result && Number.isFinite(Number(result.total_lines))) {
      const card = document.createElement('div');
      card.style.cssText = 'padding:12px 14px;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.25);border-radius:7px;margin-bottom:16px;font-size:.8rem;line-height:1.7;';
      card.innerHTML = `<strong>📊 Scan coverage:</strong> File ${Number(result.total_lines).toLocaleString('vi-VN')} dòng · AI ${Number(result.ai_coverage_percent || 0).toFixed(1)}% (${Number(result.ai_covered_lines || 0).toLocaleString('vi-VN')} dòng) · Heuristic ${Number(result.heuristic_coverage_percent || 0).toFixed(0)}% · ${Number(result.targeted_chunk_count || 0)} targeted · ${Number(result.sample_chunk_count || 0)} sampling · <code>${escapeHtml(result.scan_strategy || 'n/a')}</code>`;
      const firstBanner = resultsContainer.querySelector('.report-header-banner');
      if (firstBanner) firstBanner.insertAdjacentElement('afterend', card);
      else resultsContainer.prepend(card);
    }
  };
})();
