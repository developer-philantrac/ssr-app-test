// server/index.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer');
const cron = require('node-cron');
const metaApiRouter = require('./meta-api');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Simple in-memory cache
const htmlCache = {};

// Store last used sitemap and meta API
let lastSitemapUrl = null;
let lastMetaApiBase = null;

// Health check endpoint
app.get('/', (req, res) => {
  res.send('SSR Prerender Service is running!');
});

// Endpoint to accept and store sitemap URL and meta API base
app.post('/api/config', (req, res) => {
  const { sitemapUrl, metaApiBase } = req.body;
  if (!sitemapUrl || !metaApiBase) {
    return res.status(400).json({ error: 'sitemapUrl and metaApiBase are required' });
  }
  lastSitemapUrl = sitemapUrl;
  lastMetaApiBase = metaApiBase;
  res.json({ success: true });
});

// Endpoint to accept sitemap URL and parse it
app.post('/api/sitemap', async (req, res) => {
  const { sitemapUrl } = req.body;
  if (!sitemapUrl) {
    return res.status(400).json({ error: 'sitemapUrl is required' });
  }

  try {
    const response = await axios.get(sitemapUrl, { responseType: 'text' });
    let urls = [];

    // Try to parse as JSON first
    try {
      const json = JSON.parse(response.data);
      if (Array.isArray(json.urls)) {
        urls = json.urls;
      }
    } catch (e) {
      // If not JSON, treat as plain text
      urls = response.data
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    }

    res.json({ urls });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch or parse sitemap.' });
  }
});

// Helper: Prerender a single URL and inject meta-data
async function prerenderAndCache(url, metaApiBase) {
  const browser = await puppeteer.launch({ 
    headless: false, // Run in non-headless mode for debugging
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Capture browser console logs
  page.on('console', msg => console.log('[Puppeteer Console]', msg.text()));
  
  let html = '';
  try {
    // Set viewport to mobile size for better performance
    await page.setViewport({ width: 412, height: 732 });
    
    // Navigate to the page
    await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: 120000 // Increased timeout to 2 minutes
    });

    // Wait for the main Flutter element or canvas to appear
    await page.waitForSelector('flutter-view, canvas', { timeout: 120000 });
    // Wait an additional 5 seconds for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Take a screenshot for debugging
    await page.screenshot({ path: 'debug-screenshot.png' });

    // Get meta data
    let meta = {};
    try {
      const metaRes = await axios.get(`${metaApiBase}?url=${encodeURIComponent(url)}`);
      meta = metaRes.data;
    } catch (e) {
      console.warn('Meta-data fetch failed for', url);
    }

    // Inject meta tags
    await page.evaluate((meta) => {
      if (meta.title) {
        document.title = meta.title;
      }
      if (meta.description) {
        let desc = document.querySelector('meta[name="description"]');
        if (!desc) {
          desc = document.createElement('meta');
          desc.setAttribute('name', 'description');
          document.head.appendChild(desc);
        }
        desc.setAttribute('content', meta.description);
      }
      if (meta.og) {
        Object.entries(meta.og).forEach(([k, v]) => {
          let og = document.querySelector(`meta[property='og:${k}']`);
          if (!og) {
            og = document.createElement('meta');
            og.setAttribute('property', `og:${k}`);
            document.head.appendChild(og);
          }
          og.setAttribute('content', v);
        });
      }
      if (meta.twitter) {
        Object.entries(meta.twitter).forEach(([k, v]) => {
          let tw = document.querySelector(`meta[name='twitter:${k}']`);
          if (!tw) {
            tw = document.createElement('meta');
            tw.setAttribute('name', `twitter:${k}`);
            document.head.appendChild(tw);
          }
          tw.setAttribute('content', v);
        });
      }
    }, meta);

    // Get the final HTML
    html = await page.content();
    htmlCache[url] = html;
    console.log(`[SSR] Cached HTML for: ${url} (length: ${html.length})`);
  } catch (err) {
    // Always save screenshot and HTML for debugging
    try { await page.screenshot({ path: 'debug-screenshot-error.png' }); } catch {}
    try { html = await page.content(); } catch {}
    console.error(`[SSR] Error during prerenderAndCache for ${url}:`, err);
  } finally {
    await browser.close();
  }
}

// Endpoint to trigger prerendering for a list of URLs
app.post('/api/prerender', async (req, res) => {
  const { urls, metaApiBase } = req.body;
  if (!Array.isArray(urls) || !metaApiBase) {
    return res.status(400).json({ error: 'urls (array) and metaApiBase are required' });
  }
  try {
    for (const url of urls) {
      try {
        await prerenderAndCache(url, metaApiBase);
      } catch (err) {
        console.error(`[SSR] Error prerendering ${url}:`, err);
      }
    }
    res.json({ success: true, cached: urls.length });
  } catch (error) {
    console.error('[SSR] Prerendering failed:', error);
    res.status(500).json({ error: 'Prerendering failed.' });
  }
});

// Helper: Detect if User-Agent is a bot
function isBot(userAgent) {
  if (!userAgent) return false;
  const bots = [
    /googlebot/i,
    /bingbot/i,
    /slurp/i,
    /duckduckbot/i,
    /baiduspider/i,
    /yandex/i,
    /sogou/i,
    /exabot/i,
    /facebot/i,
    /ia_archiver/i,
    /twitterbot/i,
    /facebookexternalhit/i,
    /linkedinbot/i,
    /embedly/i,
    /pinterest/i,
    /slackbot/i,
    /vkShare/i,
    /W3C_Validator/i
  ];
  return bots.some(bot => bot.test(userAgent));
}

// Endpoint to serve cached HTML (for bots) and allow admin status check
app.get('/prerender', (req, res) => {
  const { url, admin } = req.query;
  const userAgent = req.headers['user-agent'] || '';
  const cachedHtml = htmlCache[url];

  if (!url || !cachedHtml) {
    console.log(`[SSR] Not cached: ${url}`);
    return res.status(404).send('Not cached');
  }

  // Check if the cached HTML is valid (not just a comment or empty)
  if (!cachedHtml.trim() || /^\s*<\!\-\-/.test(cachedHtml)) {
    console.log(`[SSR] Invalid or empty cached HTML for: ${url}`);
    return res.status(500).send('Cached HTML is invalid or empty.');
  }

  if (admin === '1') {
    console.log(`[SSR] Admin requested HTML for: ${url}`);
    res.set('Content-Type', 'text/html');
    return res.status(200).send(cachedHtml);
  }
  if (!isBot(userAgent)) {
    return res.status(403).send('This endpoint is for search engine bots only.');
  }
  res.set('Content-Type', 'text/html');
  res.send(cachedHtml);
});

// Daily recache at 2:00 AM
cron.schedule('0 2 * * *', async () => {
  if (!lastSitemapUrl || !lastMetaApiBase) return;
  try {
    console.log('[CRON] Fetching sitemap for daily recache...');
    const response = await axios.get(lastSitemapUrl, { responseType: 'text' });
    let urls = [];
    try {
      const json = JSON.parse(response.data);
      if (Array.isArray(json.urls)) {
        urls = json.urls;
      }
    } catch (e) {
      urls = response.data
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    }
    for (const url of urls) {
      await prerenderAndCache(url, lastMetaApiBase);
      console.log(`[CRON] Cached: ${url}`);
    }
    console.log('[CRON] Daily recache complete.');
  } catch (err) {
    console.error('[CRON] Daily recache failed:', err.message);
  }
});

// Endpoint to get last used config
app.get('/api/last-config', (req, res) => {
  res.json({ sitemapUrl: lastSitemapUrl, metaApiBase: lastMetaApiBase });
});

app.use('/api/meta', metaApiRouter);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});