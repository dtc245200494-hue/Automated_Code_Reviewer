import https from 'https';

const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'py', 'php', 'java', 'go', 'cs', 'sql', 'c', 'cpp', 'rb', 'sh', 'html', 'json', 'yaml', 'yml'
]);

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

function httpsGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'AI-Security-Bot-Web-Scanner',
        'Accept': 'application/vnd.github.v3+json',
        ...headers
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Lỗi phân tích JSON từ GitHub API'));
          }
        } else if (res.statusCode === 403) {
          reject(new Error('GitHub API bị giới hạn tần suất (Rate limit) hoặc kho lưu trữ riêng tư (cần GitHub Token).'));
        } else if (res.statusCode === 404) {
          reject(new Error('Không tìm thấy GitHub Repository hoặc thư mục chỉ định. Vui lòng kiểm tra lại URL hoặc quyền truy cập.'));
        } else {
          reject(new Error(`GitHub API trả về mã lỗi HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

function httpsGetRaw(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AI-Security-Bot-Web-Scanner' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Tải file thất bại (HTTP ${res.statusCode})`));
        }
      });
    }).on('error', reject);
  });
}

export class GitHubService {
  /**
   * Phân tích URL GitHub:
   * Hỗ trợ:
   * https://github.com/owner/repo
   * https://github.com/owner/repo/tree/branch/subfolder/path
   */
  parseGitUrl(rawUrl, specifiedPath = '') {
    let cleaned = rawUrl.trim().replace(/\.git$/, '');
    // Bỏ trailing slash
    cleaned = cleaned.replace(/\/$/, '');

    const match = cleaned.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)(?:\/(.*))?)?/);
    if (!match) {
      throw new Error('Đường link GitHub không hợp lệ. Ví dụ đúng: https://github.com/dtc245200494-hue/Automated_Code_Reviewer');
    }

    const owner = match[1];
    const repo = match[2];
    let branch = match[3] || '';
    let folderPath = match[4] || '';

    if (specifiedPath && specifiedPath.trim()) {
      folderPath = specifiedPath.trim().replace(/^\/+|\/+$/g, '');
    }

    return { owner, repo, branch, folderPath };
  }

  async fetchRepoFiles(rawUrl, targetFolder = '', token = '') {
    const { owner, repo, branch: parsedBranch, folderPath: parsedFolder } = this.parseGitUrl(rawUrl, targetFolder);

    const headers = {};
    const authToken = token || process.env.GITHUB_TOKEN;
    if (authToken) {
      headers['Authorization'] = `token ${authToken}`;
    }

    // 1. Lấy thông tin default branch nếu chưa có branch
    let branch = parsedBranch;
    if (!branch) {
      const repoInfo = await httpsGetJson(`https://api.github.com/repos/${owner}/${repo}`, headers);
      branch = repoInfo.default_branch || 'main';
    }

    // 2. Lấy toàn bộ Git Tree (recursive = 1)
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const treeData = await httpsGetJson(treeUrl, headers);

    if (!treeData.tree || !Array.isArray(treeData.tree)) {
      throw new Error('Không thể đọc cấu trúc cây thư mục từ Git Tree.');
    }

    const folderPrefix = parsedFolder ? `${parsedFolder.replace(/^\/+|\/+$/g, '')}/` : '';

    // 3. Lọc các file phù hợp nằm trong thư mục chỉ định và thuộc định dạng code
    const matchingFiles = treeData.tree.filter(item => {
      if (item.type !== 'blob') return false;
      if (folderPrefix && !item.path.startsWith(folderPrefix) && item.path !== parsedFolder) return false;
      
      // Bỏ qua node_modules, git, dist...
      if (item.path.includes('node_modules/') || item.path.includes('.git/') || item.path.includes('dist/')) return false;

      const ext = item.path.split('.').pop().toLowerCase();
      return CODE_EXTENSIONS.has(ext);
    });

    if (matchingFiles.length === 0) {
      throw new Error(`Không tìm thấy file mã nguồn nào phù hợp ${folderPrefix ? `trong thư mục "${folderPrefix}"` : 'trong kho lưu trữ'}.`);
    }

    // Giới hạn an toàn tối đa 40 file để tránh quá tải
    const filesToFetch = matchingFiles.slice(0, 40);

    // 4. Tải nội dung từng file
    const loadedFiles = [];
    for (const item of filesToFetch) {
      try {
        const rawContentUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;
        const content = await httpsGetRaw(rawContentUrl);
        const ext = item.path.split('.').pop().toLowerCase();

        loadedFiles.push({
          name: item.path.split('/').pop(),
          path: item.path,
          content: content,
          language: EXT_TO_LANG[ext] || 'auto',
          size: item.size,
          result: null
        });
      } catch (err) {
        console.warn(`Không thể tải file ${item.path}:`, err.message);
      }
    }

    return {
      repo: `${owner}/${repo}`,
      branch,
      folder: parsedFolder || '/',
      total_found: matchingFiles.length,
      files: loadedFiles
    };
  }
}
