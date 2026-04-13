import puppeteer from "@cloudflare/puppeteer";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/run") {
      return new Response("Visit /run?batch=0 to trigger sitemap prerender", { status: 200 });
    }
    const batchIndex = parseInt(url.searchParams.get("batch") || "0");
    const BATCH_SIZE = 5;
    const SITEMAP_URL = "https://www.bwstays.com/sitemap.xml";
    const KV = env.PRERENDER_KV_HTML;
    try {
      const sitemapRes = await fetch(SITEMAP_URL);
      const sitemapText = await sitemapRes.text();
      const locMatches = [...sitemapText.matchAll(/<loc>(.*?)<\/loc>/g)];
      const allUrls = locMatches.map(m => m[1].trim());
      if (allUrls.length === 0) {
        return new Response("No URLs found in sitemap", { status: 200 });
      }
      const start = batchIndex * BATCH_SIZE;
      const end = start + BATCH_SIZE;
      const batchUrls = allUrls.slice(start, end);
      if (batchUrls.length === 0) {
        return new Response(JSON.stringify({
          message: "✅ All batches completed!",
          totalUrls: allUrls.length,
          totalBatches: Math.ceil(allUrls.length / BATCH_SIZE)
        }, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      }
      let browser;
      try {
        browser = await puppeteer.launch(env.MYBROWSER);
      } catch (browserErr) {
        return new Response(JSON.stringify({
          error: "Failed to launch browser",
          detail: browserErr.message
        }, null, 2), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      const results = [];
      for (const pageUrl of batchUrls) {
        let page;
        try {
          page = await browser.newPage();
          await page.setUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)");
          await page.setViewport({ width: 1280, height: 800 });
          await page.goto(pageUrl, { waitUntil: "networkidle0", timeout: 25000 });
          const html = await page.content();
          const parsedUrl = new URL(pageUrl);
          let key = parsedUrl.pathname;
          if (key === "/") key = "/index";
          await KV.put(key, html);
          results.push({ url: pageUrl, key, status: "ok" });
        } catch (pageErr) {
          results.push({ url: pageUrl, status: "error", error: pageErr.message });
        } finally {
          if (page) try { await page.close(); } catch (_) {}
        }
      }
      try { await browser.close(); } catch (_) {}

      const nextBatch = batchIndex + 1;
      const nextUrl = `https://prerender-sitemap-crawler.bwstays.workers.dev/run?batch=${nextBatch}`;
      const isLastBatch = end >= allUrls.length;
      return new Response(JSON.stringify({
        totalUrls: allUrls.length,
        totalBatches: Math.ceil(allUrls.length / BATCH_SIZE),
        currentBatch: batchIndex,
        processedRange: `URLs ${start + 1} to ${Math.min(end, allUrls.length)}`,
        results,
        nextStep: isLastBatch ? "✅ All pages completed!" : `Visit next: ${nextUrl}`
      }, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (fatalErr) {
      return new Response(JSON.stringify({
        error: "Fatal worker error",
        detail: fatalErr.message,
        batch: batchIndex
      }, null, 2), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
