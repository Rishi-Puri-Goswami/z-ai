import fetch from "node-fetch";
import { load } from "cheerio";
import { chromium } from "playwright";
import { YoutubeTranscript } from "youtube-transcript";
import client from "../../redis/index.js";



async function getCached(key) {
    try {
        const cached = await client.get(key);
        return cached ? JSON.parse(cached) : null;
    } catch (err) {
        console.error(`Redis error on get ${key}: ${err.message}`);
        return null;
    }
}


async function setCached(key, value, ttlSeconds = 3600) {
    try {
        await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
        console.error(`Redis error on set ${key}: ${err.message}`);
    }
}

function cleanText(text) {
    return text
        .replace(/\s+/g, " ")
        .replace(/\n+/g, " ")
        .replace(/\t+/g, " ")
        .replace(/ {2,}/g, " ")
        .trim();
}

async function fetchStaticHTML(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
                },
            });
            if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
            return await res.text();
        } catch (err) {
            if (i === retries - 1) throw new Error(`Failed to fetch ${url}: ${err.message}`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

async function fetchDynamicHTML(url, maxScrolls = 3) {
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    try {
        await page.setExtraHTTPHeaders({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
        });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        for (let i = 0; i < maxScrolls; i++) {
            const previousHeight = await page.evaluate("document.body.scrollHeight");
            await page.mouse.wheel(0, 1400); // Reduced to 1000px for lightweight scrolling
            await page.waitForTimeout(1000);
            const newHeight = await page.evaluate("document.body.scrollHeight");
            if (newHeight === previousHeight) break; // Stop if no new content
        }
        const title = await page.title();
        const bodyText = await page.textContent("body");
        const images = (await page.$$eval("img", imgs => imgs.map(img => img.src).filter(Boolean))).slice(0, 5);
        const videos = await page.$$eval("iframe, video", els =>
            els.map(el => el.src).filter(src => src && (src.includes("youtube") || src.includes("vimeo") || src.endsWith(".mp4")))
        );
        const $ = load(await page.content());
        const importantDetails = await extractImportantDetails($);
        const graphData = await parseJSONLD(await page.content());
        await browser.close();
        return {
            title,
            url,
            snippet: cleanText(bodyText || "").slice(0, config.maxSnippetLength),
            images,
            videos,
            important_details: importantDetails,
            graph_horizontal_data: graphData.horizontal,
            graph_vertical_data: graphData.vertical,
        };
    } catch (err) {
        await browser.close();
        throw new Error(`Dynamic fetch failed for ${url}: ${err.message}`);
    }
}

async function parseJSONLD(html) {
    const $ = load(html);
    const jsonLdScripts = $("script[type='application/ld+json']").map((_, el) => $(el).text()).get();
    let graphData = { horizontal: [], vertical: [] };
    for (const script of jsonLdScripts) {
        try {
            const data = JSON.parse(script);
            if (data["@graph"]) {
                for (const item of data["@graph"]) {
                    if (item["@type"] === "Table" || item["@type"] === "Graph") {
                        graphData.horizontal = item.xAxis?.values || [];
                        graphData.vertical = item.yAxis?.values || [];
                    }
                }
            } else if (data["@type"] === "Graph" || data["@type"] === "Dataset") {
                graphData.horizontal = data.xAxis || [];
                graphData.vertical = data.yAxis || [];
            }
        } catch {
            continue;
        }
    }
    return graphData;
}

async function extractImportantDetails($) {
    const metaDescription = $("meta[name='description']").attr("content") || "";
    const metaAuthor = $("meta[name='author']").attr("content") || $("meta[property='article:author']").attr("content") || "";
    const metaKeywords = $("meta[name='keywords']").attr("content") || "";
    const metaPublished = $("meta[property='article:published_time']").attr("content") || $("meta[name='pubdate']").attr("content") || "";
    const headings = $("h1, h2").map((_, el) => cleanText($(el).text())).get().slice(0, 10);

    let keySections = {};
    const faq = $("script[type='application/ld+json']").filter((_, el) => $(el).text().includes('"FAQPage"')).text();
    if (faq) {
        try {
            const faqData = JSON.parse(faq);
            keySections.faq = faqData.mainEntity?.map(q => ({ question: q.name, answer: q.acceptedAnswer.text })) || [];
        } catch {}
    }

    return {
        description: cleanText(metaDescription),
        author: cleanText(metaAuthor),
        keywords: metaKeywords.split(",").map(k => k.trim()).filter(Boolean),
        publishedDate: metaPublished,
        headings,
        keySections,
    };
}

async function parseGenericStatic(html, url, maxSnippetLength = 10000) {
    const $ = load(html);
    const title = $("title").first().text().trim();
    const contentSelectors = ["article", "main", "section", "div.content", "p", "body"];
    let textContent = "";
    for (const selector of contentSelectors) {
        textContent = cleanText($(selector).text());
        if (textContent.length > 100) break;
    }
    const images = $("img").map((_, el) => $(el).attr("src")).get().filter(Boolean).slice(0, 5);
    const videos = $("video, iframe")
        .map((_, el) => $(el).attr("src"))
        .get()
        .filter(src => src && (src.includes("youtube") || src.includes("vimeo") || src.endsWith(".mp4")));

    const importantDetails = await extractImportantDetails($);
    let graphData = await parseJSONLD(html);
    if (!graphData.horizontal.length) {
        const tables = $("table");
        if (tables.length) {
            const table = tables.first();
            const headers = table.find("tr").first().find("th, td").map((_, th) => cleanText($(th).text())).get();
            const rows = table.find("tr").slice(1).map((_, row) => 
                $(row).find("td").map((_, td) => cleanText($(td).text())).get()
            ).get();
            graphData.horizontal = headers;
            graphData.vertical = rows;
        }
    }

    return {
        title,
        url,
        snippet: textContent.slice(0, maxSnippetLength),
        images,
        videos,
        important_details: importantDetails,
        graph_horizontal_data: graphData.horizontal,
        graph_vertical_data: graphData.vertical,
    };
}

async function parseYouTubeStatic(html, url) {
    const $ = load(html);
    const title = $("meta[name='title']").attr("content") || $("title").text();
    const description = $("meta[name='description']").attr("content");
    const channel = $("link[itemprop='name']").attr("content") || null;
    const importantDetails = {
        description: cleanText(description),
        author: channel,
        keywords: $("meta[name='keywords']").attr("content")?.split(",").map(k => k.trim()) || [],
        publishedDate: $("meta[itemprop='uploadDate']").attr("content") || "",
        headings: [],
        keySections: {},
    };

    return { 
        title, 
        url, 
        snippet: cleanText(description), 
        images: [$("meta[property='og:image']").attr("content") || ""].filter(Boolean),
        videos: [url],
        important_details: importantDetails,
        graph_horizontal_data: [], 
        graph_vertical_data: [] 
    };
}

async function getYouTubeTranscript(videoId) {
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        return cleanText(transcript.map(t => t.text).join(" "));
    } catch {
        return null;
    }
}

async function normalizeUrl(url) {
    if (url.includes("youtu.be")) {
        const videoId = new URL(url).pathname.slice(1);
        return `https://www.youtube.com/watch?v=${videoId}`;
    }
    return url;
}

export async function fetchUrlContent(url, config = { maxSnippetLength: 10000, minSnippetLength: 100, retries: 3, maxScrolls: 3 }) {
    url = await normalizeUrl(url);
    const cacheKey = `url:${url}`;
    const cached = await getCached(cacheKey);
    if (cached) {
        console.log(`Cache hit for ${url}`);
        return cached;
    }

    let result;

    try {
        const html = await fetchStaticHTML(url, config.retries);

        if (url.includes("youtube.com/watch")) {
            console.log("🎥 Detected YouTube video");
            const videoId = new URL(url).searchParams.get("v");
            result = await parseYouTubeStatic(html, url);
            console.log("📝 Fetching transcript...");
            const transcript = await getYouTubeTranscript(videoId);
            if (transcript) result.transcript = transcript;
        } else if (url.includes("youtube.com/live") || url.endsWith("/live")) {
            console.log("🔴 Detected YouTube LIVE page...");
            result = await parseYouTubeStatic(html, url);
            result.viewers = "Live viewers not available in static mode";
            // Try dynamic fetch for live data if needed
            if (!result.snippet || result.snippet.length < config.minSnippetLength) {
                console.log("⚡ Falling back to dynamic fetching for live page...");
                result = await fetchDynamicHTML(url, config.maxScrolls);
            }
        } else {
            console.log("🌐 Fetching generic page...");
            result = await parseGenericStatic(html, url, config.maxSnippetLength);
            if (!result.snippet || result.snippet.length < config.minSnippetLength) {
                console.log("⚡ Falling back to dynamic fetching...");
                result = await fetchDynamicHTML(url, config.maxScrolls);
            }
        }
    } catch (err) {
        console.error(`❌ Error fetching ${url}: ${err.message}`);
        throw err;
    }

    await setCached(cacheKey, result);
    return result;
}


// const urls = [
//    "https://webrtc.org/getting-started/overview"
// ];

// (async () => {
//     for (const url of urls) {
//         try {
//             const data = await fetchUrlContent(url, {
//                 maxSnippetLength: 15000,
//                 minSnippetLength: 50,
//                 retries: 3,
//                 maxScrolls: 3,
//             });
//             console.log(`\n=== ${data.title} ===\n`);
//             console.log(`URL: ${data.url}\n`);
//             console.log(`Snippet: ${data.snippet}\n`);
//             console.log(`Important Details: ${JSON.stringify(data.important_details, null, 2)}\n`);
//             console.log(`Images: ${data.images.join(", ") || "None"}\n`);
//             console.log(`Videos: ${data.videos?.join(", ") || "None"}\n`);
//             console.log(`Graph Horizontal Data: ${JSON.stringify(data.graph_horizontal_data) || "None"}\n`);
//             console.log(`Graph Vertical Data: ${JSON.stringify(data.graph_vertical_data) || "None"}\n`);
//         } catch (err) {
//             console.error(`Error fetching ${url}: ${err.message}`);
//         }
//     }
// })();