import fetch from 'node-fetch';
import { load } from 'cheerio';
import { URLSearchParams } from 'url';
import { AbortController } from 'abort-controller';
import NodeCache from 'node-cache';
import HttpsProxyAgent from 'https-proxy-agent';

const CONFIG = { 
    USER_AGENTS: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
    ],
    REQUEST_TIMEOUT_MS: 15000,
    RETRY_LIMIT: 3,
    RETRY_DELAY_MS: 2000,
    CACHE_TTL: 60 * 5, // 5 minutes
    PROXIES: process.env.PROXIES ? process.env.PROXIES.split(',') : []
};

// ===== HELPERS =====
function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

function getRandomUserAgent() {
    return CONFIG.USER_AGENTS[Math.floor(Math.random() * CONFIG.USER_AGENTS.length)];
}

function getRandomProxy() {
    if (!CONFIG.PROXIES.length) return null;
    return CONFIG.PROXIES[Math.floor(Math.random() * CONFIG.PROXIES.length)];
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

// ===== CACHE =====
const cache = new NodeCache({ stdTTL: CONFIG.CACHE_TTL });

// ===== SCRAPER FUNCTION =====
export async function scrapeDuckDuckGo(query) {
    const cached = cache.get(query);
    if (cached) return cached;

    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    let html = null;

    for (let attempt = 1; attempt <= CONFIG.RETRY_LIMIT; attempt++) {
        try {
            const proxy = getRandomProxy();
            const headers = {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://duckduckgo.com/'
            };

            const fetchOptions = { headers };
            if (proxy) fetchOptions.agent = new HttpsProxyAgent(proxy);

            const res = await fetchWithTimeout(searchUrl, fetchOptions);
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

            html = await res.text();
            if (html.includes('form#captcha-form') || html.toLowerCase().includes('verify you are human')) {
                throw new Error('Blocked by DuckDuckGo (captcha)');
            }

            break; // success
        } catch (err) {
            console.error(`Attempt ${attempt} failed: ${err.message}`);
            if (attempt < CONFIG.RETRY_LIMIT) await sleep(CONFIG.RETRY_DELAY_MS);
            else throw err;
        }
    }

    const $ = load(html);
    const results = [];

    // Primary selector
    $('h2 a.result__a').each((i, el) => {
         if (i >= 5) return false;

        const title = $(el).text().trim();
        let url = $(el).attr('href') || '';

        if (url.includes('uddg=')) {
            const params = new URLSearchParams(url.split('?')[1]);
            const uddg = params.get('uddg');
            if (uddg) url = decodeURIComponent(uddg);
        }

        const snippet = $(el).closest('.result').find('.result__snippet').text().trim() || '';
        if (title && url) results.push({ title, url, snippet });
    });

    // Cache results
    cache.set(query, results);    
    return results;
}   

// const data = await scrapeDuckDuckGo("how is Bhuvan Bam");

// console.log(data , data.length , "data lenght");



