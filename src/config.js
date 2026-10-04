'use strict';

const path = require('path');

function loadConfig(env = process.env, overrides = {}) {
  const repoRoot = path.resolve(overrides.repoRoot || env.PANORAFUS_REPO_ROOT || path.resolve(__dirname, '..'));
  const chatProvider = overrides.chatProvider || env.PANORAFUS_CHAT_PROVIDER || 'local';
  const chat = {
    provider: chatProvider,
    model: overrides.chatModel || env.PANORAFUS_CHAT_MODEL || 'panorafus-docs-rag',
    apiUrl: overrides.chatApiUrl || env.PANORAFUS_CHAT_API_URL || '',
    apiKey: overrides.chatApiKey || env.PANORAFUS_CHAT_API_KEY || '',
    systemPrompt: overrides.chatSystemPrompt || env.PANORAFUS_CHAT_SYSTEM_PROMPT || ''
  };

  if (chat.provider !== 'local' && (!chat.apiUrl || !chat.apiKey)) {
    throw new Error('External chat providers require PANORAFUS_CHAT_API_URL and PANORAFUS_CHAT_API_KEY.');
  }

  return {
    host: overrides.host || env.PANORAFUS_HOST || '0.0.0.0',
    port: Number(overrides.port || env.PANORAFUS_PORT || 3000),
    repoRoot,
    publicDir: path.join(repoRoot, 'public'),
    githubWebhookSecret: overrides.githubWebhookSecret || env.PANORAFUS_GITHUB_WEBHOOK_SECRET || '',
    chat
  };
}

function getSafeConfigView(config) {
  return {
    host: config.host,
    port: config.port,
    chat: {
      provider: config.chat.provider,
      model: config.chat.model,
      externalConfigured: Boolean(config.chat.apiUrl && config.chat.apiKey)
    }
  };
}

module.exports = {
  getSafeConfigView,
  loadConfig
};
