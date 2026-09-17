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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ưu tiên đọc .env từ thư mục gốc repo hoặc thư mục web
const rootEnvPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
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

function normalizeCustomEndpoint(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    throw new Error('Custom API cần Endpoint/Base URL, ví dụ https://api.example.com/v1.');
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Endpoint Custom API không phải URL hợp lệ.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Không đặt username/password trực tiếp trong URL Custom API.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  const isSecureRemote = parsed.protocol === 'https:';
  const isLocalHttp = parsed.protocol === 'http:' && isLocalhost;

  if (!isSecureRemote && !isLocalHttp) {
    throw new Error('Custom API từ xa phải dùng HTTPS. HTTP chỉ được phép với localhost/127.0.0.1.');
  }

  return parsed.toString().replace(/\/+$/, '');
}

// Chèn phần mở rộng Custom API vào giao diện mà không sửa app.js cũ.
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
    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('Lỗi tải từ GitHub:', err.message);
    return res.status(400).json({
      success: false,
      error: err.message || 'Không thể tải file từ GitHub.'
    });
  }
});

// API: Kiểm tra API Key từ client
app.post('/api/config/test-key', async (req, res) => {
  const { apiKey, provider, model, baseURL } = req.body;

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Vui lòng cung cấp API Key hợp lệ.'
    });
  }

  try {
    if (provider === 'custom') {
      const customModel = typeof model === 'string' ? model.trim() : '';
      if (!customModel) {
        throw new Error('Custom API cần tên Model.');
      }

      const endpoint = normalizeCustomEndpoint(baseURL);
      const keys = scannerService.parseApiKeys(apiKey);
      if (keys.length === 0) {
        throw new Error('API Key không được để trống.');
      }

      const client = scannerService.createClient(keys[0], 'custom', endpoint);
      await client.chat.completions.create({
        model: customModel,
        messages: [{ role: 'user', content: 'Reply OK' }],
        max_tokens: 5
      });

      return res.json({
        success: true,
        message: `Kết nối Custom API thành công! Đã nhận diện ${keys.length} API Key để chạy đa luồng.`,
        provider: 'Custom API (OpenAI-compatible)',
        model: customModel
      });
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
      error: err.message || 'API Key không hợp lệ hoặc không thể kết nối tới nhà cung cấp AI.'
    });
  }
});

// API: Quét lỗ hổng bảo mật trực tiếp
app.post('/api/scan', async (req, res) => {
  const { code, language, apiKey, provider, model, baseURL } = req.body;

  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({
      error: 'Vui lòng cung cấp mã nguồn cần quét (trường "code").'
    });
  }

  try {
    let normalizedBaseURL = baseURL;
    if (provider === 'custom') {
      if (!model || typeof model !== 'string' || !model.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Custom API cần tên Model.'
        });
      }
      normalizedBaseURL = normalizeCustomEndpoint(baseURL);
    }

    const customConfig = (apiKey && typeof apiKey === 'string' && apiKey.trim())
      ? { apiKey, provider, model, baseURL: normalizedBaseURL }
      : null;
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
  console.log(`====================================================`);
  console.log(`🛡️  AI SECURITY BOT - WEB APPLICATION ĐÃ KHỞI CHẠY`);
  console.log(`🌐  Truy cập giao diện: http://localhost:${PORT}`);
  console.log(`🔑  Trạng thái AI Key: ${scannerService.hasApiKey() ? 'ĐÃ KẾT NỐI' : 'CHƯA CẤU HÌNH (dùng Heuristic Mode)'}`);
  console.log(`====================================================`);
});
