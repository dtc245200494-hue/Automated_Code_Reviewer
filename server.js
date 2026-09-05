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

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

// API: Quét lỗ hổng bảo mật trực tiếp
app.post('/api/scan', async (req, res) => {
  const { code, language } = req.body;

  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({
      error: 'Vui lòng cung cấp mã nguồn cần quét (trường "code").'
    });
  }

  try {
    const result = await scannerService.scanCode(code, language || 'auto');
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
