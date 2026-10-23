# spyne-img-proxy

Cloudflare Worker that proxies dealer-inventory images so the browser CLIP
classifier in `index.html` can `fetch()` them cross-origin for embedding.

- **Live URL:** https://spyne-img-proxy.nitin-kumar.workers.dev
- **Used from:** `index.html` → `const AI_IMAGE_PROXY = '…workers.dev/?url='`

## The 403-on-stock-images bug (fix in this update)

EVOX Images (`service.secureoffersites.com`, Varnish-cached) hotlink-protects
based on `Referer` + `User-Agent`. The old Worker forwarded the browser's
request headers as-is, so EVOX saw the dashboard's referer (a `github.io` page)
with no browser-looking UA and returned **403 Forbidden**.

`aiPipelineEmbed` treats a fetch error as "no displayable image" and auto-tags
the VIN as **Photo NA** (`index.html` ~L5391), so every EVOX-stock VIN ended
up in Photo NA instead of Stock in the AI report.

`spyne-img-proxy.js` now rewrites the upstream request with:
- A realistic Chrome **User-Agent**
- A **same-origin Referer** (`https://<upstream-host>/`), which clears the
  hotlink check without needing a specific dealer referer
- Standard `Accept` / `Accept-Language` / `Sec-Fetch-*` headers

## Deploy (dashboard paste)

1. Open Cloudflare → Workers & Pages → `spyne-img-proxy` → Edit code.
2. Replace the entire `worker.js` with the contents of `spyne-img-proxy.js`.
3. Click **Deploy**.
4. Reload the dashboard, re-run the AI classifier. Stock images should now
   land in **Stock**, not **Photo NA**.

## Deploy (wrangler, optional)

```bash
cd worker/
npx wrangler deploy spyne-img-proxy.js --name spyne-img-proxy
```
