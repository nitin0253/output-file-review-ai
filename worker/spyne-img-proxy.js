// spyne-img-proxy — Cloudflare Worker
// Fetches dealer-inventory images through this origin so the browser CLIP
// classifier (which must fetch() the bytes to embed them, not just render them
// in an <img>) can read them cross-origin.
//
// Why the dedicated Worker: dealer CDNs don't set Access-Control-Allow-Origin,
// and some (notably EVOX / service.secureoffersites.com) also hotlink-protect
// based on Referer + User-Agent. This Worker:
//   1. Rewrites the request to look like a browser hitting the upstream directly
//      (same-origin Referer, realistic User-Agent, standard Accept header).
//   2. Returns the response body with the CORS header the browser needs.
//
// Endpoint: GET /?url=<encoded-upstream-url>
// Deploy:   paste into Cloudflare dashboard → Workers & Pages → spyne-img-proxy → Edit code → Deploy.

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

// Hosts known to need stripped-down headers (DealerOn / Varnish rule 54113
// 405s requests whose header pattern it recognizes as proxied). Pattern-match
// is intentional: www.<something>.com paths going through a Varnish cache
// typically fare better when we DON'T send Sec-Fetch-* or Accept-Language.
function needsStrippedHeaders(host) {
  return /\.(com|net|org)$/i.test(host) &&
         !/pictures\.dealer\.com|images\.dealer\.com|cdn\.|cloudfront\.net/i.test(host);
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }

    const u = new URL(request.url);
    const target = u.searchParams.get('url');
    if (!target) {
      return new Response('Missing ?url=', { status: 400, headers: CORS_HEADERS });
    }

    let upstream;
    try {
      upstream = new URL(target);
    } catch {
      return new Response('Invalid ?url=', { status: 400, headers: CORS_HEADERS });
    }
    if (upstream.protocol !== 'http:' && upstream.protocol !== 'https:') {
      return new Response('Unsupported protocol', { status: 400, headers: CORS_HEADERS });
    }

    // Same-origin Referer defeats the most common hotlink check (EVOX/Varnish
    // rejects requests whose Referer is empty or on an unknown domain).
    const sameOriginReferer = `${upstream.protocol}//${upstream.host}/`;

    // Build headers conservatively — some Varnish rules (DealerOn error 54113
    // seen 2026-10-27) 405 any request carrying Sec-Fetch-* headers because
    // those identify the request as a non-document subresource, which doesn't
    // match the pattern their rule allows. For sensitive hosts we strip them.
    const stripped = needsStrippedHeaders(upstream.host);
    const headers = {
      'User-Agent': BROWSER_UA,
      'Accept': stripped ? '*/*' : 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Referer': sameOriginReferer,
    };
    if (!stripped) {
      headers['Accept-Language'] = 'en-US,en;q=0.9';
      headers['Sec-Fetch-Dest'] = 'image';
      headers['Sec-Fetch-Mode'] = 'no-cors';
      headers['Sec-Fetch-Site'] = 'same-origin';
    }

    const upstreamReq = new Request(upstream.toString(), {
      method: request.method,
      headers,
      redirect: 'follow',
      cf: {
        // Per-status cache: hold successes 5 min, DON'T hold errors (a 405
        // or 502 would otherwise pin for the whole TTL and mask recovery).
        cacheTtlByStatus: { '200-299': 300, '300-399': 60, '400-599': 0 },
        cacheEverything: true,
      },
    });

    let resp;
    try {
      resp = await fetch(upstreamReq);
    } catch (err) {
      return new Response('Upstream fetch failed: ' + (err && err.message || err), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
      });
    }

    // If the stripped-header path returned 405/403 and we DIDN'T strip, try
    // again with the stripped set — covers the inverse case where our normal
    // headers pass but a sensitive host rejects.
    if (!stripped && (resp.status === 405 || resp.status === 403)) {
      const retryHeaders = {
        'User-Agent': BROWSER_UA,
        'Accept': '*/*',
        'Referer': sameOriginReferer,
      };
      try {
        const retryResp = await fetch(new Request(upstream.toString(), {
          method: request.method, headers: retryHeaders, redirect: 'follow',
          cf: { cacheTtlByStatus: { '200-299': 300, '400-599': 0 }, cacheEverything: true },
        }));
        if (retryResp.status < 400) resp = retryResp;
      } catch (_) {}
    }

    const outHeaders = new Headers(resp.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) outHeaders.set(k, v);
    outHeaders.delete('set-cookie');
    if (resp.status >= 400) outHeaders.set('Cache-Control', 'no-store');

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: outHeaders,
    });
  },
};
