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

    const upstreamReq = new Request(upstream.toString(), {
      method: request.method,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': sameOriginReferer,
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'same-origin',
      },
      redirect: 'follow',
      cf: {
        // Short edge cache so repeated embeds within a session don't re-hit upstream.
        cacheTtl: 300,
        cacheEverything: true,
      },
    });

    let resp;
    try {
      resp = await fetch(upstreamReq);
    } catch (err) {
      return new Response('Upstream fetch failed: ' + (err && err.message || err), {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    const headers = new Headers(resp.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    // Strip upstream caching directives that could pin a stale 403 at the browser.
    headers.delete('set-cookie');

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    });
  },
};
