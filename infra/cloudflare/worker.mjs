const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

function applySecurityHeaders(response, cacheControl) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  if (cacheControl) {
    headers.set('Cache-Control', cacheControl);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApiRequest = url.pathname.startsWith('/api/');
    const isWebhookRequest = url.pathname === '/webhooks/github';
    const origin = isApiRequest || isWebhookRequest
      ? env.PANORAFUS_API_ORIGIN
      : env.PANORAFUS_STATIC_ORIGIN;

    if (!origin) {
      return new Response('Missing PANORAFUS origin configuration.', { status: 500 });
    }

    const upstreamUrl = new URL(url.pathname + url.search, origin);
    const upstreamRequest = new Request(upstreamUrl, request);
    const upstreamResponse = await fetch(upstreamRequest);

    return applySecurityHeaders(
      upstreamResponse,
      isApiRequest || isWebhookRequest ? 'no-store' : 'public, max-age=3600, s-maxage=86400'
    );
  }
};
