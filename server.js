/**
 * AI Security Code Reviewer & Web Scanner
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2025-2026 dtc245200494-hue & Contributors
 *
 * Licensed under the MIT License (OSI-approved).
 * See LICENSE file in the project root for full license information.
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import { SAMPLES } from './data/samples.js';
import { ScannerService } from './services/scanner.js';
import { GitHubService } from './services/github.js';
import {
  UniversalAIClient,
  normalizeUniversalEndpoint,
  parseExtraHeaders
} from './services/universal-ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ưu tiên .env ngay trong project; nếu không có thì dotenv dùng cwd hiện tại.
const projectEnvPath = path.resolve(__dirname, '.env');
if (fs.existsSync(projectEnvPath)) {
  dotenv.config({ path: projectEnvPath });
} else {
  dotenv.config();
}

const app = express();
const PORT = process.env.WEB_PORT || 3000;
const scannerService = new ScannerService();
const githubService = new GitHubService();
const publicDir = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

function normalizeUniversalConfig(body = {}) {
  const protocol = typeof body.apiProtocol === 'string' && body.apiProtocol.trim()
    ? body.apiProtocol.trim()
    : 'openai-chat';
  const endpoint = normalizeUniversalEndpoint(body.baseURL || body.endpoint || '');
  const authType = typeof body.authType === 'string' && body.authType.trim()
    ? body.authType.trim()
    : 'auto';
  const extraHeaders = parseExtraHeaders(body.extraHeaders || {});

  return {
    protocol,
    endpoint,
    authType,
    authHeaderName: typeof body.authHeaderName === 'string' ? body.authHeaderName.trim() : 'x-api-key',
    queryParamName: typeof body.queryParamName === 'string' ? body.queryParamName.trim() : 'key',
    extraHeaders,
    requestTemplate: typeof body.requestTemplate === 'string' ? body.requestTemplate : '',
    responsePath: typeof body.responsePath === 'string' ? body.responsePath.trim() : '',
    timeoutMs: Number(body.timeoutMs) || 60000
  };
}

function packUniversalConfig(config) {
  return `universal:${Buffer.from(JSON.stringify(config), 'utf8').toString('base64url')}`;
}

function unpackUniversalConfig(value) {
  if (typeof value !== 'string' || !value.startsWith('universal:')) {
    throw new Error('Thiếu cấu hình Universal AI API nội bộ.');
  }
  try {
    return JSON.parse(Buffer.from(value.slice('universal:'.length), 'base64url').toString('utf8'));
  } catch {
    throw new Error('Cấu hình Universal AI API không hợp lệ.');
  }
}

function getCustomKeys(apiKey, authType) {
  const keys = scannerService.parseApiKeys(apiKey || '');
  if (keys.length > 0) return keys;
  if (authType === 'none') return ['__no_auth__'];
  throw new Error('API Key không được để trống với kiểu xác thực hiện tại.');
}

// ScannerService giữ nguyên interface OpenAI-compatible. Với provider custom,
// UniversalAIClient dịch giao thức khác về cùng shape choices[0].message.content.
const createBuiltInClient = scannerService.createClient.bind(scannerService);
scannerService.createClient = (apiKey, provider, baseURL) => {
  if (provider === 'custom') {
    return new UniversalAIClient(apiKey, unpackUniversalConfig(baseURL));
  }
  return createBuiltInClient(apiKey, provider, baseURL);
};

// Chèn phần mở rộng Universal AI API vào giao diện mà không sửa app.js cũ.
app.get(['/', '/index.html'], (req, res, next) => {
  try {
    const indexPath = path.join(publicDir, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    const marker = '<script src="app.js"></script>';
    const enhanced = html.includes(marker)
      ? html.replace(marker, `${marker}\n  <script src="custom-provider.js"></script>`)
      : html;
    res.type('html').send(enhanced);
  } catch (err) {
    next(err);
  }
});

app.use(express.static(publicDir));

// API: Trạng thái & cấu hình hệ thống
app.get('/api/status', (req, res) => {
  const hasKey = scannerService.hasApiKey();
  res.json({
    status: 'online',
    version: '1.0.0',
    ai_configured: hasKey,
    model: scannerService.model,
    provider: scannerService.provider
  });
});

// API: Lấy danh sách mẫu code lỗ hổng
app.get('/api/samples', (req, res) => {
  res.json({ samples: SAMPLES });
});

// API: Tải toàn bộ file từ GitHub Repository / Thư mục chỉ định
app.post('/api/github/fetch-repo', async (req, res) => {
  const { url, folder, token } = req.body;

  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Vui lòng cung cấp đường dẫn GitHub Repository hợp lệ.'
    });
  }

  try {
    const data = await githubService.fetchRepoFiles(url, folder || '', token || '');
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Lỗi tải từ GitHub:', err.message);
    return res.status(400).json({
      success: false,
      error: err.message || 'Không thể tải file từ GitHub.'
    });
  }
});

// API: Kiểm tra API Key / Universal AI endpoint từ client
app.post('/api/config/test-key', async (req, res) => {
  const { apiKey, provider, model } = req.body;

  try {
    if (provider === 'custom') {
      const targetModel = typeof model === 'string' ? model.trim() : '';
      if (!targetModel) throw new Error('Universal AI API cần tên Model.');

      const config = normalizeUniversalConfig(req.body);
      const keys = getCustomKeys(apiKey, config.authType);
      const client = new UniversalAIClient(keys[0], config);

      await client.chat.completions.create({
        model: targetModel,
        messages: [{ role: 'user', content: 'Reply only with OK' }],
        max_tokens: 8
      });

      return res.json({
        success: true,
        message: `Kết nối Universal AI API thành công! Đã nhận diện ${config.authType === 'none' ? 0 : keys.length} API Key.`,
        provider: `Universal AI (${config.protocol})`,
        model: targetModel
      });
    }

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ success: false, error: 'Vui lòng cung cấp API Key hợp lệ.' });
    }

    const testResult = await scannerService.testApiKey(apiKey, provider, model);
    return res.json({
      success: true,
      message: testResult.message,
      provider: testResult.provider,
      model: testResult.model
    });
  } catch (err) {
    console.error('Lỗi kiểm tra API Key:', err.message);
    return res.status(400).json({
      success: false,
      error: err.message || 'API Key hoặc cấu hình API không hợp lệ.'
    });
  }
});

// API: Quét lỗ hổng bảo mật trực tiếp
app.post('/api/scan', async (req, res) => {
  const { code, language, apiKey, provider, model, baseURL } = req.body;

  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Vui lòng cung cấp mã nguồn cần quét (trường "code").'
    });
  }

  try {
    let customConfig = null;

    if (provider === 'custom') {
      const targetModel = typeof model === 'string' ? model.trim() : '';
      if (!targetModel) {
        return res.status(400).json({ success: false, error: 'Universal AI API cần tên Model.' });
      }

      const universalConfig = normalizeUniversalConfig(req.body);
      const keys = getCustomKeys(apiKey, universalConfig.authType);
      customConfig = {
        apiKey: keys.join('\n'),
        provider: 'custom',
        model: targetModel,
        baseURL: packUniversalConfig(universalConfig)
      };
    } else if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
      customConfig = { apiKey, provider, model, baseURL };
    }

    const result = await scannerService.scanCode(code, language || 'auto', customConfig);
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      result
    });
  } catch (err) {
    console.error('Lỗi khi quét mã nguồn:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Đã xảy ra lỗi trong quá trình quét bảo mật.'
    });
  }
});

app.listen(PORT, () => {
  console.log('====================================================');
  console.log('🛡️  AI SECURITY BOT - WEB APPLICATION ĐÃ KHỞI CHẠY');
  console.log(`🌐  Truy cập giao diện: http://localhost:${PORT}`);
  console.log(`🔑  Trạng thái AI Key: ${scannerService.hasApiKey() ? 'ĐÃ KẾT NỐI' : 'CHƯA CẤU HÌNH (dùng Heuristic Mode)'}`);
  console.log('====================================================');
});
