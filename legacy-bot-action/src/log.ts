// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dtc245200494-hue — AI Security Bot Contributors

import log, { LogLevelNames } from "loglevel";

log.setLevel((process.env.LOG_LEVEL as LogLevelNames) || "info");

export default log;