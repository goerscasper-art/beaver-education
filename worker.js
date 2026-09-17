export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Intercept Proxy API Route
    if (url.pathname === '/api/proxy') {
      const b64url = url.searchParams.get('b64url');
      if (!b64url) return new Response('Missing b64url parameter', { status: 400 });

      try {
        const targetUrl = atob(b64url);
        
        const fetchRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': request.headers.get('Accept') || 'text/html,*/*',
            'Accept-Language': request.headers.get('Accept-Language') || 'en-US,en;q=0.9',
          },
          redirect: 'follow'
        });

        const responseHeaders = new Headers(fetchRes.headers);
        
        // Strip strict iframe blocking headers
        responseHeaders.delete('X-Frame-Options');
        responseHeaders.delete('Content-Security-Policy');
        responseHeaders.delete('Cross-Origin-Embedder-Policy');
        responseHeaders.delete('Cross-Origin-Opener-Policy');
        
        responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        responseHeaders.set('Access-Control-Allow-Origin', '*');

        const contentType = fetchRes.headers.get('content-type') || '';
        
        if (contentType.includes('text/html')) {
          // Cloudflare's HTMLRewriter streams and modifies the HTML on the fly
          class AttributeRewriter {
            constructor(attributeName) {
              this.attributeName = attributeName;
            }
            element(element) {
              const attribute = element.getAttribute(this.attributeName);
              if (attribute && !attribute.startsWith('data:') && !attribute.startsWith('#')) {
                try {
                  const absoluteUrl = new URL(attribute, targetUrl).toString();
                  const encoded = btoa(absoluteUrl);
                  element.setAttribute(this.attributeName, `/api/proxy?b64url=${encoded}`);
                } catch (e) {}
              }
            }
          }

          const rewriter = new HTMLRewriter()
            .on('img', new AttributeRewriter('src'))
            .on('script', new AttributeRewriter('src'))
            .on('link', new AttributeRewriter('href'))
            .on('a', new AttributeRewriter('href'))
            .on('iframe', new AttributeRewriter('src'));

          return rewriter.transform(new Response(fetchRes.body, {
            status: fetchRes.status,
            headers: responseHeaders
          }));
        }

        return new Response(fetchRes.body, {
          status: fetchRes.status,
          headers: responseHeaders
        });

      } catch (error) {
        return new Response(`Proxy failed: ${error.message}`, { status: 500 });
      }
    }

    // 2. Serve SPA Static Assets (Cloudflare Workers logic)
    try {
      let response = await env.ASSETS.fetch(request);
      
      // SPA Fallback: If asset not found, serve index.html
      if (response.status === 404 && !url.pathname.includes('.')) {
        const fallbackRequest = new Request(new URL('/', request.url), request);
        response = await env.ASSETS.fetch(fallbackRequest);
      }
      return response;
    } catch (e) {
      return new Response("Not Found", { status: 404 });
    }
  }
};
