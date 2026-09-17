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
import { ScannerService, DEFAULT_OPENCODE_API_KEY } from './services/scanner.js';
import { GitHubService } from './services/github.js';
import {
  UniversalAIClient,
  normalizeUniversalEndpoint,
  parseExtraHeaders
} from './services/universal-ai.js';
import { fetchOpenCodeModels } from './services/opencode-models.js';

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
let openCodeModelsCache = { expiresAt: 0, models: [] };

// Khi người dùng chưa thêm API key riêng, server sẽ dùng key OpenCode trong .env
// và tự phân phối/fallback giữa đúng 6 model free này.
const DEFAULT_OPENCODE_FREE_MODELS = Object.freeze([
  'ling-3.0-flash-fin-free',
  'muse-spark-1.2-contributor-free',
  'muse-spark-1.3-contributor-free',
  'nemotron-3.5-lightning-free',
  'nemotron-3-ultra-free',
  'mimo-v2.5-free'
]);
let defaultModelCursor = 0;

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

function getRotatedDefaultModels() {
  const start = defaultModelCursor % DEFAULT_OPENCODE_FREE_MODELS.length;
  defaultModelCursor = (defaultModelCursor + 1) % DEFAULT_OPENCODE_FREE_MODELS.length;
  return DEFAULT_OPENCODE_FREE_MODELS.map((_, index) =>
    DEFAULT_OPENCODE_FREE_MODELS[(start + index) % DEFAULT_OPENCODE_FREE_MODELS.length]
  );
}

function getScanFailureReason(result) {
  if (result?.ai_error) return result.ai_error;
  const firstFailedChunk = Array.isArray(result?.failed_chunks) ? result.failed_chunks[0] : null;
  if (firstFailedChunk?.error) return firstFailedChunk.error;
  return result?.overall_summary || 'Model không hoàn tất lượt quét.';
}

function isLegacyBrowserDefaultKey(apiKey) {
  const keys = scannerService.parseApiKeys(apiKey || '');
  return keys.length === 1 && keys[0] === DEFAULT_OPENCODE_API_KEY;
}

async function scanWithDefaultOpenCodePool(code, language) {
  // Nếu server chưa có key OpenCode thực sự thì giữ nguyên Heuristic Mode.
  if (!scannerService.hasApiKey() || scannerService.provider !== 'OpenCode.ai') {
    return scannerService.scanCode(code, language, null);
  }

  const configuredEndpoint = (process.env.OPENAI_API_ENDPOINT || '').trim();
  const baseURL = configuredEndpoint.includes('opencode.ai')
    ? configuredEndpoint
    : 'https://opencode.ai/zen/v1';
  const models = getRotatedDefaultModels();
  const attempts = [];
  let lastResult = null;

  for (const modelName of models) {
    const result = await scannerService.scanCode(code, language, {
      apiKey: scannerService.apiKey,
      provider: 'opencode',
      model: modelName,
      baseURL
    });

    lastResult = result;
    if (!result?.incomplete) {
      return {
        ...result,
        model_used: modelName,
        default_model_pool: true,
        model_attempts: [...attempts, { model: modelName, success: true }]
      };
    }

    const reason = getScanFailureReason(result);
    attempts.push({ model: modelName, success: false, error: reason });
    console.warn(`Model mặc định ${modelName} quét chưa hoàn tất, chuyển model tiếp theo:`, reason);
  }

  if (!lastResult) {
    return scannerService.scanCode(code, language, null);
  }

  return {
    ...lastResult,
    is_safe: false,
    incomplete: true,
    scan_status: 'incomplete',
    default_model_pool: true,
    model_attempts: attempts,
    overall_summary: `Cả ${DEFAULT_OPENCODE_FREE_MODELS.length} model OpenCode miễn phí đều không hoàn tất lượt quét. Không thể kết luận mã nguồn an toàn. ${lastResult.overall_summary || ''}`.trim()
  };
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

// Chèn các phần mở rộng Universal API + OpenCode model discovery vào giao diện.
app.get(['/', '/index.html'], (req, res, next) => {
  try {
    const indexPath = path.join(publicDir, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    const marker = '<script src="app.js"></script>';
    const enhanced = html.includes(marker)
      ? html.replace(
          marker,
          `${marker}\n  <script src="custom-provider.js"></script>\n  <script src="opencode-models.js"></script>`
        )
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
  const usingDefaultPool = hasKey && scannerService.provider === 'OpenCode.ai';
  res.json({
    status: 'online',
    version: '2.0.0',
    ai_configured: hasKey,
    model: usingDefaultPool ? 'auto-free-pool' : scannerService.model,
    models: usingDefaultPool ? DEFAULT_OPENCODE_FREE_MODELS : [scannerService.model],
    provider: scannerService.provider
  });
});

// API: Lấy danh sách model OpenCode và gắn sẵn protocol/endpoint tương ứng.
app.get('/api/providers/opencode/models', async (req, res) => {
  const now = Date.now();
  if (openCodeModelsCache.models.length && openCodeModelsCache.expiresAt > now) {
    return res.json({ success: true, cached: true, models: openCodeModelsCache.models });
  }

  try {
    const models = await fetchOpenCodeModels();
    openCodeModelsCache = {
      models,
      expiresAt: now + (5 * 60 * 1000)
    };
    return res.json({ success: true, cached: false, models });
  } catch (err) {
    console.error('Lỗi tải danh sách model OpenCode:', err.message);
    if (openCodeModelsCache.models.length) {
      return res.json({
        success: true,
        cached: true,
        stale: true,
        warning: err.message,
        models: openCodeModelsCache.models
      });
    }
    return res.status(502).json({
      success: false,
      error: err.message || 'Không thể tải danh sách model OpenCode.'
    });
  }
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
    } else if (
      apiKey &&
      typeof apiKey === 'string' &&
      apiKey.trim() &&
      !isLegacyBrowserDefaultKey(apiKey)
    ) {
      // Chỉ khi người dùng thực sự nhập key riêng mới cho phép override provider/model.
      customConfig = { apiKey, provider, model, baseURL };
    }

    const result = customConfig
      ? await scannerService.scanCode(code, language || 'auto', customConfig)
      : await scanWithDefaultOpenCodePool(code, language || 'auto');

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
  console.log(`🔑  Trạng thái AI Key: ${scannerService.hasApiKey() ? `ĐÃ KẾT NỐI (${scannerService.provider} - ${scannerService.provider === 'OpenCode.ai' ? `${DEFAULT_OPENCODE_FREE_MODELS.length} model free tự động` : scannerService.model})` : 'CHƯA CẤU HÌNH (dùng Heuristic Mode)'}`);
  console.log('====================================================');
});