// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dtc245200494-hue — AI Security Bot Contributors

const {
  createLambdaFunction,
  createProbot,
} = require("@probot/adapter-aws-lambda-serverless");
const appFn = require('./bot').robot;

module.exports.webhooks = createLambdaFunction(appFn, {
  probot: createProbot(),
});
