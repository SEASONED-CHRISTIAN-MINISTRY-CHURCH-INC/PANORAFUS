'use strict';

const crypto = require('node:crypto');

const MAX_GITHUB_WEBHOOK_BODY_BYTES = 1024 * 1024;
const ALLOWED_GITHUB_WEBHOOK_EVENTS = new Set(['ping', 'push']);

function verifyGithubWebhookSignature(body, signature, secret) {
  if (!Buffer.isBuffer(body) || typeof secret !== 'string' || !secret) {
    return false;
  }

  const match = /^sha256=([a-f0-9]{64})$/i.exec(signature || '');
  if (!match) {
    return false;
  }

  const received = Buffer.from(match[1], 'hex');
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  return crypto.timingSafeEqual(received, expected);
}

module.exports = {
  ALLOWED_GITHUB_WEBHOOK_EVENTS,
  MAX_GITHUB_WEBHOOK_BODY_BYTES,
  verifyGithubWebhookSignature
};
