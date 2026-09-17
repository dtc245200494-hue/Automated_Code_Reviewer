import { describe, it } from 'node:test';
import assert from 'node:assert';
import { scanSensitiveData } from '../services/sensitive-data-scanner.js';

const SAMPLE_JSON = `[
  {
    "id": "45074ff2-8f4d-41b5-a463-3930264f26c3",
    "name": "Profile 4",
    "deviceId": "opera_143_samsung_s24",
    "proxy": {
      "type": "http",
      "host": "113.177.210.172",
      "port": 27563,
      "user": "jzCNmb",
      "pass": "JGkvVE"
    },
    "cityKey": "quangninh",
    "cityName": "Quảng Ninh (Hạ Long)",
    "geo": {
      "lat": 21.0069,
      "lng": 107.2925
    },
    "timezone": "Asia/Ho_Chi_Minh",
    "language": "vi-VN",
    "selectedExtensions": [
      "ext_1789553926880"
    ],
    "customWindow": null,
    "startUrl": "",
    "notes": "",
    "webData": {
      "cookies": [
        {
          "name": "_ym_uid",
          "value": "1789554180606811615",
          "path": "/",
          "domain": ".sannysoft.com",
          "secure": true,
          "httpOnly": false,
          "sameSite": "None",
          "expires": 1821090179,
          "priority": "Medium"
        },
        {
          "name": "tUaIt4C8",
          "value": "A3LMvamgAQAArDg6h3rMPklZEKUga-A7rh4P8WPA2cpdXVWppq5uqSy_QlZAAXGx0qz0_2bRwH81ezJd7Lsx8w|1|0|df9b3fdfcd603edd6f4386384ace2df615bb8862",
          "path": "/",
          "domain": "m.9922999.com",
          "secure": false,
          "httpOnly": false,
          "expires": 1824114203,
          "priority": "Medium"
        },
        {
          "name": "mobile_web_language",
          "value": "vi-VN",
          "path": "/",
          "domain": "m.9922999.com",
          "secure": false,
          "httpOnly": false,
          "expires": 1789640583,
          "priority": "Medium"
        },
        {
          "name": "_pat",
          "value": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3ODk1NjAyMDMsIm5iZiI6MTc4OTU1NDIwMywiSWQiOjIzOTM5NzUsIkFjY291bnQiOiJqOGp5NHBiYSIsIklzVHJpYWwiOmZhbHNlLCJTeXN0ZW1Db2RlIjoiVkI0MzEiLCJMb2dpblRva2VuIjoiZDRjMjNkMDFiZjM2NDIzMzg4OTM3OGFmYzdhNWI0MzciLCJBZEluZm8iOm51bGwsIkRvbWFpbiI6Im0uOTkyMjk5OS5jb20ifQ.pxNvI5byU3SGkIeyEWvO03eE0y1VneaSuiZ73HvubGk",
          "path": "/",
          "domain": ".9922999.com",
          "secure": false,
          "httpOnly": false,
          "expires": 1789640602,
          "priority": "Medium"
        },
        {
          "name": "_prt",
          "value": "1DC59541BFB1770DD5A93B226F725A3A46418C6E18DDB08BCFC1F63CF2859166E4F090FBE7195F0F30B8F889E31487F7DA916F3C72149DFA8851525D799BA0C589836AAEA39CAE36",
          "path": "/",
          "domain": ".9922999.com",
          "secure": false,
          "httpOnly": false,
          "expires": 1789640602,
          "priority": "Medium"
        },
        {
          "name": "nohostname_ip",
          "value": "458382ABG126D5CB63D34",
          "path": "/",
          "domain": "m.9922999.com",
          "secure": false,
          "httpOnly": false,
          "expires": 1789669404,
          "priority": "Medium"
        },
        {
          "name": "PHPSESSID",
          "value": "ngrqebk54cacgg5surt3uftjkf",
          "path": "/",
          "domain": "i9sanh.cc",
          "secure": false,
          "httpOnly": false,
          "priority": "Medium"
        },
        {
          "name": "aws-waf-token",
          "value": "204275f1-9a12-4005-87e5-df8aed971fec:AQoAnElI3JOWAAAA:U+RFtSsdR8UZjQSJSJ0IbLGODI3liyFnSnekwET1GsuWp4YieYJ7HUW4Hgbzp7haSHx26N/j6IasN3uLHeA9BWBUFc+qUVKxIR6k0QWCokwDQifbRjMpDZ5ri8gtHkREbtHh0UX0J1e+cdifB3YtEkkW/Ee51bKXJN6i4Voyy1mxQdhB6YH8mbY8lz6fOGAXGiLhujoDwt1ZPHPN6aAllQkUUqTOvxHAoB+Fwi+CpMLPW94wZAiyaySsSD2vw2BpRU7/CULZIMHxor3sMUhcJD7WYUegBrv/v8P3faNHQKiAiLh3NV/ZH5gsd7gTrtOUXLMaqL6J",
          "path": "/",
          "domain": ".m.9922999.com",
          "secure": true,
          "httpOnly": false,
          "sameSite": "Lax",
          "expires": 1789899997,
          "priority": "Medium"
        },
        {
          "name": "AWSALB",
          "value": "J13bbf5SzAP81Nrj++eNBuGkeX0RnXkqcP9ZFPVMVspOSPM11aDEq8jLdtbGpVwmH0zuQitTWSFJYEqLLUNlmV9Sxrrcy9dpAUhwuHbZ8P3kKMBq4LQpFbDHf4cDXM8qm9QgX0+02hKTFnuwZk2BpTJdn9uTIkk3MQ0aRLems4kgAe8NN5BWgCtxslP/IQ==",
          "path": "/",
          "domain": "m.9922999.com",
          "secure": false,
          "httpOnly": false,
          "expires": 1790159305,
          "priority": "Medium"
        }
      ],
      "count": 12,
      "historyGz": "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"
    },
    "createdAt": 1789554173447,
    "deletedAt": 1789554528608
  },
  {
    "id": "e386deb8-b4dc-4e54-8847-856a40eceaa3",
    "name": "Profile 3",
    "deviceId": "xiaomi_mi11",
    "proxy": {
      "type": "http",
      "host": "113.164.96.165",
      "port": 23469,
      "user": "ABqPxJ",
      "pass": "GvOcyu"
    },
    "cityKey": "quangninh",
    "cityName": "Quảng Ninh (Hạ Long)",
    "geo": {
      "lat": 21.0069,
      "lng": 107.2925
    },
    "timezone": "Asia/Ho_Chi_Minh",
    "language": "vi-VN"
  }
]`;

describe('Sensitive Data & Secret Scanner Tests', () => {
  it('detects plaintext proxy credentials, exposed tokens, cookie flags, and profile artifacts in JSON', () => {
    const findings = scanSensitiveData(SAMPLE_JSON, 'json');
    assert.ok(findings.length >= 4, `Expected at least 4 findings, got ${findings.length}`);

    const types = findings.map(f => f.type);
    
    // 1. Plaintext credentials (pass)
    assert.ok(
      types.includes('Sensitive Credential Stored in Plaintext'),
      'Must detect Sensitive Credential Stored in Plaintext'
    );

    // 2. Authentication / Session Token Exposed
    assert.ok(
      types.includes('Authentication / Session Token Exposed in Data File'),
      'Must detect Authentication / Session Token Exposed in Data File'
    );

    // 3. Cookie missing secure / httpOnly
    assert.ok(
      types.includes('Session Cookie Missing Secure / HttpOnly Protection'),
      'Must detect Session Cookie Missing Secure / HttpOnly Protection'
    );

    // 4. Sensitive Browser/Profile Data Persisted
    assert.ok(
      types.includes('Sensitive Browser/Profile Data Persisted'),
      'Must detect Sensitive Browser/Profile Data Persisted'
    );
  });

  it('ScannerService enforces is_safe: false when sensitive data is detected', async () => {
    const { ScannerService } = await import('../services/groq-scanner.js');
    const scanner = new ScannerService();
    // Chạy scanCode không có API key -> Heuristic fallback
    const result = await scanner.scanCode(SAMPLE_JSON, 'json', null);
    assert.strictEqual(result.is_safe, false, 'Security gate must fail (is_safe: false)');
    assert.ok(result.vulnerabilities.length > 0, 'Vulnerabilities must not be empty');
    assert.ok(
      result.vulnerabilities.some(v => v.type === 'Sensitive Credential Stored in Plaintext'),
      'Must have plaintext proxy credential finding'
    );
  });
});
