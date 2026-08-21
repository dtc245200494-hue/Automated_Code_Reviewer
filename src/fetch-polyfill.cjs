// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dtc245200494-hue — AI Security Bot Contributors

const { Headers, Request, Response } = require('node-fetch');
const fetch = require('node-fetch').default;

if (!globalThis.fetch) {
  globalThis.fetch = fetch;
  globalThis.Headers = Headers;
  globalThis.Request = Request;
  globalThis.Response = Response;
}
