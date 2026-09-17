import { ScannerService } from './services/groq-scanner.js';
import { GeminiAssistant } from './services/gemini-assistant.js';

const originalScanCode = ScannerService.prototype.scanCode;

function isGroqInvocation(instance, customConfig) {
  if (customConfig) {
    const provider = String(customConfig.provider || '').trim().toLowerCase();
    const firstKey = String(customConfig.apiKey || '').trim().split(/[\n,;]+/)[0] || '';
    return provider === 'groq' || firstKey.startsWith('gsk_');
  }
  return Boolean(instance?.isGroq || /groq/i.test(String(instance?.provider || '')));
}

ScannerService.prototype.scanCode = async function assistedScanCode(code, language = 'auto', customConfig = null) {
  const primaryResult = await originalScanCode.call(this, code, language, customConfig);
  if (!isGroqInvocation(this, customConfig)) return primaryResult;

  const assistant = new GeminiAssistant(
    (assistantCode, assistantLanguage, assistantConfig) =>
      originalScanCode.call(this, assistantCode, assistantLanguage, assistantConfig)
  );

  return assistant.enhance(primaryResult, code, language);
};

await import('./server.js');
