'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadConfig, getSafeConfigView } = require('./config');
const { answerQuestion } = require('./chatbot');
const {
  getInstitutionIndex,
  getRepositoryMetrics,
  listRegionMetrics,
  listTraditionMetrics,
  searchInstitutions
} = require('./repository-data');
const { createDashboardSnapshot } = require('./dashboard');
const { createSyndicationSnapshot } = require('./syndication');
const {
  ALLOWED_GITHUB_WEBHOOK_EVENTS,
  MAX_GITHUB_WEBHOOK_BODY_BYTES,
  verifyGithubWebhookSignature
} = require('./github-webhook');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  response.end(body);
}

function getContentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

async function collectRawBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_GITHUB_WEBHOOK_BODY_BYTES) {
      const error = new Error('Request body too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function handleGithubWebhook(request, response, config) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!config.githubWebhookSecret) {
    sendJson(response, 503, { error: 'GitHub webhook is not configured.' });
    return;
  }

  let body;
  try {
    body = await collectRawBody(request);
  } catch (error) {
    sendJson(response, error.statusCode || 400, {
      error: error.statusCode === 413 ? 'Request body too large.' : 'Unable to read request body.'
    });
    return;
  }

  if (!verifyGithubWebhookSignature(body, request.headers['x-hub-signature-256'], config.githubWebhookSecret)) {
    sendJson(response, 401, { error: 'Invalid webhook signature.' });
    return;
  }

  const event = request.headers['x-github-event'];
  if (typeof event !== 'string' || !event) {
    sendJson(response, 400, { error: 'Missing GitHub event header.' });
    return;
  }

  try {
    const payload = JSON.parse(body.toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      sendJson(response, 400, { error: 'Webhook payload must be a JSON object.' });
      return;
    }
  } catch {
    sendJson(response, 400, { error: 'Webhook payload must be valid JSON.' });
    return;
  }

  if (event === 'ping') {
    sendJson(response, 200, { status: 'ok', event, processed: false });
    return;
  }

  if (!ALLOWED_GITHUB_WEBHOOK_EVENTS.has(event)) {
    sendJson(response, 202, { status: 'ignored', event });
    return;
  }

  sendJson(response, 202, {
    status: 'accepted',
    event,
    processed: false,
    message: 'No Wix synchronization behavior is configured.'
  });
}

function routeFilter(repoRoot, slug) {
  const normalizedSlug = slug.toLowerCase();
  const institutions = getInstitutionIndex(repoRoot);
  const region = listRegionMetrics(repoRoot).find((entry) => entry.regionSlug === normalizedSlug);
  if (region) {
    return {
      filterType: 'region',
      filter: region.region,
      items: institutions.filter((entry) => entry.regionSlug === normalizedSlug)
    };
  }

  const traditions = listTraditionMetrics(repoRoot);
  const tradition = traditions.find((entry) => (
    entry.tradition.toLowerCase().replace(/[^a-z0-9]+/g, '-') === normalizedSlug
  ));
  if (tradition) {
    return {
      filterType: 'tradition',
      filter: tradition.tradition,
      items: institutions.filter((entry) => entry.tradition.toLowerCase() === tradition.tradition.toLowerCase())
    };
  }

  return null;
}

async function handleRequest(request, response, config) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    response.end();
    return;
  }

  const url = new URL(request.url, 'http://127.0.0.1');
  const segments = url.pathname.split('/').filter(Boolean);
  const repoRoot = config.repoRoot;

  if (url.pathname === '/webhooks/github') {
    await handleGithubWebhook(request, response, config);
    return;
  }

  if (url.pathname === '/') {
    sendJson(response, 200, {
      name: 'PANORAFUS.AI Platform API',
      endpoints: [
        '/api/health',
        '/api/dashboard',
        '/api/institutions',
        '/api/institutions/search?q=keyword',
        '/api/institutions/{region}',
        '/api/institutions/{tradition}',
        '/api/chat?q=question',
        '/webhooks/github'
      ]
    });
    return;
  }

  if (segments[0] !== 'api') {
    const requestedPath = path.resolve(config.publicDir, url.pathname.replace(/^\/+/, ''));
    if (!requestedPath.startsWith(path.resolve(config.publicDir))) {
      sendText(response, 403, 'Forbidden');
      return;
    }
    if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
      response.writeHead(200, { 'Content-Type': getContentType(requestedPath) });
      fs.createReadStream(requestedPath).pipe(response);
      return;
    }
    sendText(response, 404, 'Not found');
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(response, 200, {
      service: 'PANORAFUS.AI Platform API',
      status: 'ok',
      config: getSafeConfigView(config),
      metrics: getRepositoryMetrics(repoRoot)
    });
    return;
  }

  if (url.pathname === '/api/dashboard') {
    sendJson(response, 200, createDashboardSnapshot(repoRoot));
    return;
  }

  if (url.pathname === '/api/syndication') {
    sendJson(response, 200, createSyndicationSnapshot(repoRoot));
    return;
  }

  if (url.pathname === '/api/institutions' && request.method === 'GET') {
    const items = getInstitutionIndex(repoRoot);
    sendJson(response, 200, {
      total: items.length,
      items
    });
    return;
  }

  if (url.pathname === '/api/institutions/search' && request.method === 'GET') {
    const query = url.searchParams.get('q') || '';
    const items = searchInstitutions(repoRoot, query);
    sendJson(response, 200, {
      query,
      total: items.length,
      items
    });
    return;
  }

  if (segments[1] === 'institutions' && segments[2] && request.method === 'GET') {
    const routed = routeFilter(repoRoot, segments[2].toLowerCase());
    if (!routed) {
      sendJson(response, 404, { error: `Unknown institution filter: ${segments[2]}` });
      return;
    }
    sendJson(response, 200, {
      filterType: routed.filterType,
      filter: routed.filter,
      total: routed.items.length,
      items: routed.items
    });
    return;
  }

  if (url.pathname === '/api/chat') {
    if (request.method !== 'GET' && request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed. Use GET or POST.' });
      return;
    }

    let prompt = request.method === 'GET'
      ? (url.searchParams.get('q') || '')
      : '';
    if (request.method === 'POST') {
      const body = await collectBody(request);
      let parsed = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch (error) {
        sendJson(response, 400, { error: 'Request body must be valid JSON.' });
        return;
      }
      prompt = parsed.question || parsed.q || '';
    }

    if (!prompt.trim()) {
      sendJson(response, 400, { error: 'A question is required via q=... or {"question":"..."}.' });
      return;
    }

    const answer = await answerQuestion(prompt, repoRoot, config.chat);
    sendJson(response, 200, answer);
    return;
  }

  sendText(response, 404, 'Not found');
}

function createServer(overrides = {}) {
  const config = overrides.config || loadConfig(process.env, overrides);
  const server = http.createServer((request, response) => {
    Promise.resolve(handleRequest(request, response, config)).catch((error) => {
      sendJson(response, 500, { error: 'Internal server error.' });
    });
  });
  server.panorafusConfig = config;
  return server;
}

function startServer(overrides = {}) {
  const config = loadConfig(process.env, overrides);
  const server = createServer({ config });
  return new Promise((resolve) => {
    server.listen(config.port, config.host, () => resolve({ server, config }));
  });
}

if (require.main === module) {
  startServer().then(({ config }) => {
    process.stdout.write(`PANORAFUS.AI server listening on http://${config.host}:${config.port}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  createServer,
  startServer
};
