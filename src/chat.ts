// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dtc245200494-hue — AI Security Bot Contributors
// This file is part of AI Security Bot — an automated security code reviewer.
// See LICENSE file in the root directory for full license text.

import { OpenAI, AzureOpenAI } from 'openai';

const reasoningEfforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

type ReasoningEffort = typeof reasoningEfforts[number];

const isReasoningEffort = (effort: string): effort is ReasoningEffort =>
  (reasoningEfforts as readonly string[]).includes(effort);

export class Chat {
  private openai: OpenAI | AzureOpenAI;
  private isAzure: boolean;
  private isGithubModels: boolean;

  private reasoningModels = ['o1', 'o1-2024-12-17', 'o1-mini', 'o1-mini-2024-09-12'];
  private reasoningPrefixes = ['o3', 'o4', 'gpt-5'];

  constructor(apikey: string) {
    this.isAzure = Boolean(
        process.env.AZURE_API_VERSION && process.env.AZURE_DEPLOYMENT,
    );

    this.isGithubModels = process.env.USE_GITHUB_MODELS === 'true';

    if (this.isAzure) {
      // Azure OpenAI configuration
      this.openai = new AzureOpenAI({
        apiKey: apikey,
        endpoint: process.env.OPENAI_API_ENDPOINT || '',
        apiVersion: process.env.AZURE_API_VERSION || '',
        deployment: process.env.AZURE_DEPLOYMENT || '',
      });
    } else {
      // Standard OpenAI configuration
      this.openai = new OpenAI({
        apiKey: apikey,
        baseURL: this.isGithubModels ? 'https://models.github.ai/inference' : process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1',
      });
    }
  }

  private get model(): string {
    return process.env.MODEL || (this.isGithubModels ? 'openai/gpt-4o-mini' : 'gpt-4o-mini');
  }

  private get normalizedModel(): string {
    return this.model.split('/').pop() || this.model;
  }

  private get isReasoningModel(): boolean {
    const model = this.normalizedModel.toLowerCase();
    return this.reasoningModels.includes(model) || this.reasoningPrefixes.some(prefix => model.startsWith(prefix));
  }

  private get reasoningEffortOption(): { reasoning_effort?: ReasoningEffort } {
    const effort = process.env.REASONING_EFFORT;
    if (!effort || !this.isReasoningModel) return {};
    if (!isReasoningEffort(effort)) {
      console.warn(`REASONING_EFFORT="${effort}" is invalid, ignoring. Valid values: ${reasoningEfforts.join(', ')}`);
      return {};
    }
    return { reasoning_effort: effort };
  }

  private generatePrompt = (patch: string) => {
    const answerLanguage = process.env.LANGUAGE
      ? `Trả lời bằng ${process.env.LANGUAGE}.`
      : 'Trả lời bằng Tiếng Việt.';

    const securityPrompt = process.env.PROMPT ||
`Bạn là một chuyên gia bảo mật ứng dụng web (AppSec Expert) với kiến thức sâu về OWASP Top 10.
Nhiệm vụ của bạn là phân tích đoạn code diff dưới đây và tìm kiếm các lỗ hổng bảo mật nghiêm trọng.

Hãy kiểm tra KỸ LƯỠNG các lỗ hổng sau:
1. **SQL Injection** – Truy vấn SQL được ghép nối trực tiếp với dữ liệu người dùng nhập vào.
2. **Cross-Site Scripting (XSS)** – Dữ liệu người dùng được render ra HTML/DOM mà không được sanitize.
3. **Hardcoded Secrets** – API Key, Password, Token, Secret Key, Connection String bị viết cứng trong code.
4. **Insecure Direct Object Reference (IDOR)** – Truy cập tài nguyên qua ID mà không kiểm tra quyền hạn.
5. **Cross-Site Request Forgery (CSRF)** – Các request thay đổi trạng thái (POST/PUT/DELETE) không có CSRF token.
6. **Insecure Deserialization** – Deserialize dữ liệu không tin cậy từ người dùng.
7. **Path Traversal** – Đường dẫn file được xây dựng từ input người dùng mà không validate.
8. **Command Injection** – Lệnh hệ điều hành được xây dựng từ input người dùng.
9. **Sensitive Data Exposure** – Log ra console/file các thông tin nhạy cảm (password, token, PII).
10. **Broken Authentication** – Mật khẩu lưu dưới dạng plain text, thuật toán hash yếu (MD5, SHA1).

Nếu code KHÔNG có lỗ hổng bảo mật nào, hãy đặt lgtm = true và để review_comment rỗng.
Nếu code CÓ lỗ hổng, hãy giải thích theo cấu trúc sau:
- 🚨 **Loại lỗ hổng:** (ví dụ: SQL Injection)
- ⚠️ **Mức độ nghiêm trọng:** (Cao / Trung bình / Thấp)
- 📖 **Giải thích:** Lỗ hổng này hoạt động như thế nào và tại sao nguy hiểm
- 💥 **Kịch bản tấn công:** Ví dụ cụ thể về cách kẻ tấn công có thể khai thác
- ✅ **Cách sửa (Code mẫu):** Cung cấp đoạn code đã được sửa chính xác`;

    const jsonFormatRequirement = '\nTrả về phản hồi theo định dạng JSON nghiêm ngặt sau:\n' +
      '{\n' +
      '  "reviews": [\n' +
      '    {\n' +
      '      "hunk_header": string, // Header @@ của đoạn code (ví dụ: "@@ -10,5 +10,7 @@"), không bắt buộc\n' +
      '      "lgtm": boolean, // true nếu đoạn code này an toàn, false nếu có lỗ hổng bảo mật\n' +
      '      "review_comment": string // Phân tích bảo mật chi tiết cho đoạn code này (dùng markdown). Để trống nếu lgtm là true.\n' +
      '    }\n' +
      '  ]\n' +
      '}\n' +
      'Phân tích từng đoạn code (đánh dấu bởi @@) riêng biệt và chỉ báo cáo khi có vấn đề bảo mật thực sự.\n' +
      'Đảm bảo phản hồi của bạn là JSON hợp lệ với mảng reviews.\n';

    return `${securityPrompt}\n${jsonFormatRequirement} ${answerLanguage}\n\nCode diff cần phân tích:\n${patch}\n`;
  };

  public codeReview = async (patch: string): Promise<Array<{ lgtm: boolean, review_comment: string, hunk_header?: string }> | { lgtm: boolean, review_comment: string, hunk_header?: string }> => {
    if (!patch) {
      return {
        lgtm: true,
        review_comment: ""
      };
    }

    console.time('code-review cost');
    const prompt = this.generatePrompt(patch);

    const isReasoning = this.isReasoningModel;

    const res = await this.openai.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: this.model,
      ...(isReasoning ? {} : {
        temperature: +(process.env.temperature || 0) || 1,
        top_p: +(process.env.top_p || 0) || 1,
      }),
      max_tokens: process.env.max_tokens ? +process.env.max_tokens : undefined,
      ...this.reasoningEffortOption,
      response_format: { type: "json_object" },
    });

    console.timeEnd('code-review cost');

    if (res.choices.length) {
      try {
        const json = JSON.parse(res.choices[0].message.content || "");
        // If response has a 'reviews' array, return it directly
        if (json.reviews && Array.isArray(json.reviews)) {
          return json.reviews;
        }
        // Otherwise, treat as a single review response
        return json;
      } catch (e) {
        return {
          lgtm: false,
          hunk_header: patch.split('\n')[0].startsWith('@@') ? patch.split('\n')[0] : undefined,
          review_comment: res.choices[0].message.content || ""
        }
      }
    }

    return {
      lgtm: true,
      review_comment: ""
    }
  };
}
