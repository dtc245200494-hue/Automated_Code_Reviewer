// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dtc245200494-hue — AI Security Bot Contributors

require('./fetch-polyfill.cjs');
const { run } = require('@probot/adapter-github-actions');
const { robot } = require('./bot');
require('./log');

run(robot);
