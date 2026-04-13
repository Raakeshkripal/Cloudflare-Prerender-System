export default { 
  async fetch(request, env) { 
    const url = new URL(request.url); 
    // Get path from URL 
    let path = url.pathname; 
    // Fix root path issue 
    if (path === "/") { 
      path = "/about"; 
    } 
    // Fetch HTML from KV 
    const html = await env.PRERENDER_HTML_KV.get(path); 
    // If found, return HTML 
    if (html) { 
      return new Response(html, { 
        headers: { 
          "Content-Type": "text/html; charset=UTF-8", 
        } 
      }); 
    } 
    return new Response("Page not found", { status: 404 }); 
  }
};