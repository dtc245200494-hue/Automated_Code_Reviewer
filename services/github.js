/**
 * AI Security Code Reviewer & Web Scanner
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2025-2026 dtc245200494-hue & Contributors
 *
 * Licensed under the MIT License (OSI-approved).
 * See LICENSE file in the project root for full license information.
 */
import https from 'https';

const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'py', 'php', 'java', 'go', 'cs', 'sql', 'c', 'cpp',
  'rb', 'sh', 'html', 'htm', 'json', 'yaml', 'yml', 'db', 'sqlite', 'sqlite3'
]);

const EXT_TO_LANG = {
  py: 'python',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  php: 'php',
  java: 'java',
  go: 'go',
  cs: 'csharp',
  sql: 'sql',
  c: 'c',
  cpp: 'cpp',
  rb: 'ruby',
  sh: 'bash',
  html: 'html',
  htm: 'html',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  db: 'sql',
  sqlite: 'sql',
  sqlite3: 'sql'
};

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'AI-Security-Bot-Web-Scanner',
        Accept: 'application/vnd.github+json',
        ...headers
      }
    };

    https.get(url, options, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, data });
          return;
        }

        const err = new Error(
          res.statusCode === 403
            ? 'GitHub API bị giới hạn tần suất hoặc token không đủ quyền.'
            : res.statusCode === 404
              ? 'Không tìm thấy tài nguyên GitHub hoặc token không có quyền truy cập.'
              : `GitHub API trả về HTTP ${res.statusCode}: ${data.slice(0, 500)}`
        );
        err.statusCode = res.statusCode;
        err.responseBody = data;
        reject(err);
      });
    }).on('error', reject);
  });
}

async function httpsGetJson(url, headers = {}) {
  const { data } = await httpsGet(url, headers);
  try {
    return JSON.parse(data);
  } catch {
    throw new Error('Lỗi phân tích JSON từ GitHub API.');
  }
}

async function httpsGetRaw(url, headers = {}) {
  const { data } = await httpsGet(url, {
    Accept: 'application/vnd.github.raw',
    ...headers
  });
  return data;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => runWorker()
  );
  await Promise.all(workers);
  return results;
}

export class GitHubService {
  /**
   * Parse GitHub URLs without prematurely assuming that a branch cannot
   * contain "/". The ambiguous /tree/<branch>/<folder> tail is resolved
   * against the GitHub branches API inside fetchRepoFiles().
   */
  parseGitUrl(rawUrl, specifiedPath = '') {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new Error('Đường link GitHub không hợp lệ.');
    }

    const cleaned = rawUrl.trim().replace(/\.git$/, '').replace(/\/$/, '');
    const match = cleaned.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/(.+))?$/);

    if (!match) {
      throw new Error(
        'Đường link GitHub không hợp lệ. Ví dụ: https://github.com/owner/repo hoặc https://github.com/owner/repo/tree/branch/path'
      );
    }

    const owner = match[1];
    const repo = match[2];
    const treeTail = (match[3] || '').replace(/^\/+|\/+$/g, '');
    const requestedFolder = (specifiedPath || '').trim().replace(/^\/+|\/+$/g, '');

    return {
      owner,
      repo,
      treeTail,
      requestedFolder
    };
  }

  async resolveBranchAndFolder(owner, repo, treeTail, requestedFolder, headers) {
    if (!treeTail) {
      const repoInfo = await httpsGetJson(`https://api.github.com/repos/${owner}/${repo}`, headers);
      return {
        branch: repoInfo.default_branch || 'main',
        folderPath: requestedFolder
      };
    }

    const parts = treeTail.split('/').filter(Boolean);

    // Try the longest possible branch first. This correctly resolves branch
    // names such as feature/login/fix before treating the remainder as folder.
    for (let count = parts.length; count >= 1; count--) {
      const candidate = parts.slice(0, count).join('/');
      try {
        await httpsGetJson(
          `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(candidate)}`,
          headers
        );

        const urlFolder = parts.slice(count).join('/');
        return {
          branch: candidate,
          folderPath: requestedFolder || urlFolder
        };
      } catch (err) {
        if (err.statusCode !== 404) throw err;
      }
    }

    throw new Error(`Không tìm thấy branch phù hợp với URL: ${treeTail}`);
  }

  async fetchRepoFiles(rawUrl, targetFolder = '', token = '') {
    const {
      owner,
      repo,
      treeTail,
      requestedFolder
    } = this.parseGitUrl(rawUrl, targetFolder);

    const authToken = token || process.env.GITHUB_TOKEN || '';
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

    const { branch, folderPath } = await this.resolveBranchAndFolder(
      owner,
      repo,
      treeTail,
      requestedFolder,
      headers
    );

    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const treeData = await httpsGetJson(treeUrl, headers);

    if (!Array.isArray(treeData.tree)) {
      throw new Error('Không thể đọc cấu trúc cây thư mục từ GitHub.');
    }

    if (treeData.truncated) {
      throw new Error('GitHub trả về tree bị truncated; không thể đảm bảo đã quét đầy đủ repository.');
    }

    const normalizedFolder = folderPath ? folderPath.replace(/^\/+|\/+$/g, '') : '';
    const folderPrefix = normalizedFolder ? `${normalizedFolder}/` : '';

    const matchingFiles = treeData.tree.filter(item => {
      if (item.type !== 'blob') return false;
      if (folderPrefix && !item.path.startsWith(folderPrefix) && item.path !== normalizedFolder) {
        return false;
      }

      if (
        item.path.includes('node_modules/')
        || item.path.includes('.git/')
        || item.path.includes('dist/')
        || item.path.includes('build/')
      ) {
        return false;
      }

      const ext = item.path.split('.').pop()?.toLowerCase() || '';
      return CODE_EXTENSIONS.has(ext);
    });

    if (matchingFiles.length === 0) {
      throw new Error(
        `Không tìm thấy file mã nguồn phù hợp ${folderPrefix ? `trong thư mục "${folderPrefix}"` : 'trong repository'}.`
      );
    }

    const envConcurrency = Number.parseInt(process.env.GITHUB_FETCH_CONCURRENCY || '', 10);
    const concurrency = Number.isFinite(envConcurrency) && envConcurrency > 0
      ? envConcurrency
      : 5;

    const fetchResults = await mapWithConcurrency(
      matchingFiles,
      concurrency,
      async item => {
        try {
          // Contents API keeps Authorization attached for private repositories.
          // Raw GitHub URLs often fail for private repos when auth headers are lost.
          const contentUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${item.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`;
          const content = await httpsGetRaw(contentUrl, headers);
          const ext = item.path.split('.').pop()?.toLowerCase() || '';

          return {
            ok: true,
            file: {
              name: item.path.split('/').pop(),
              path: item.path,
              content,
              language: EXT_TO_LANG[ext] || 'auto',
              size: item.size,
              result: null
            }
          };
        } catch (err) {
          console.warn(`Không thể tải file ${item.path}:`, err.message);
          return {
            ok: false,
            path: item.path,
            error: err.message
          };
        }
      }
    );

    const loadedFiles = fetchResults
      .filter(result => result.ok)
      .map(result => result.file);

    const failedFiles = fetchResults
      .filter(result => !result.ok)
      .map(result => ({
        path: result.path,
        error: result.error
      }));

    if (loadedFiles.length === 0) {
      throw new Error('Không tải được nội dung của bất kỳ file mã nguồn nào.');
    }

    return {
      repo: `${owner}/${repo}`,
      branch,
      folder: normalizedFolder || '/',
      total_found: matchingFiles.length,
      loaded_count: loadedFiles.length,
      failed_count: failedFiles.length,
      complete: failedFiles.length === 0,
      failed_files: failedFiles,
      files: loadedFiles
    };
  }
}
