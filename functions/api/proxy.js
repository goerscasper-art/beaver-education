export async function onRequest({ request }) {
  const url = new URL(request.url);
  const b64url = url.searchParams.get('b64url');
  
  if (!b64url) {
    return new Response('Missing b64url parameter', { status: 400 });
  }

  try {
    const targetUrl = atob(b64url);
    
    const fetchRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': request.headers.get('Accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': request.headers.get('Accept-Language') || 'en-US,en;q=0.9',
      },
      redirect: 'follow'
    });

    const responseHeaders = new Headers(fetchRes.headers);
    // Strip out frame-blocking headers
    responseHeaders.delete('X-Frame-Options');
    responseHeaders.delete('Content-Security-Policy');
    responseHeaders.delete('Cross-Origin-Embedder-Policy');
    responseHeaders.delete('Cross-Origin-Opener-Policy');
    
    // Set permissive caching and CORS headers
    responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    responseHeaders.set('Pragma', 'no-cache');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    const contentType = fetchRes.headers.get('content-type') || '';
    
    if (contentType.includes('text/html')) {
      // Use Cloudflare's ultra-fast native HTMLRewriter
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
            } catch (e) {
              // Keep original if parsing fails
            }
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
