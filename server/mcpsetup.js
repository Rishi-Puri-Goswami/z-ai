import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import clint from "../redis/index.js";
import { scrapeDuckDuckGo } from "./controler/searchddb.js";
import { fetchUrlContent } from "./controler/urltocontant.js";

const mcpServer = new McpServer({
  name: "z-ai-mcp-server",
  version: "1.0.0"
});

const transport = {};

// ➕ Addition Tool
mcpServer.tool(
  "addtwonumbers",
  "Adds two numbers together",
  {
    a: z.number(),
    b: z.number()
  },
  async ({ a, b }) => {
    const key = `add:${a}:${b}`;
    const cached = await clint.get(key);
    if (cached) {
      return {
        content: [{ type: "text", text: `Cached result: ${a} + ${b} = ${cached}` }]
      };
    }

    const result = a + b;
    await clint.set(key, result.toString(), "EX", 3600);
    return {
      content: [{ type: "text", text: `${a} + ${b} = ${result}` }]
    };
  }
);

// ➖ Subtraction Tool
mcpServer.tool(
  "subtracttwonumber", // 🔹 CHANGE 1: Fixed spelling from substract → subtract
  "Subtracts two numbers",
  {
    a: z.number(),
    b: z.number()
  },
  async ({ a, b }) => {
    const key = `sub:${a}:${b}`; // 🔹 CHANGE 2: Fixed wrong cache key (was add:)
    const cached = await clint.get(key);
    if (cached) {
      return {
        content: [{ type: "text", text: `Cached result: ${a} - ${b} = ${cached}` }]
      };
    }

    const result = a - b;
    await clint.set(key, result.toString(), "EX", 3600);
    return {
      content: [{ type: "text", text: `${a} - ${b} = ${result}` }]
    };
  }
);


// mcpServer.tool(
//   "fetch-the-latest-data",
//   "Fetches the latest data from the internet for a given user prompt",
//   {
//     user_prompt: z.string()
//   },
//   async ({ user_prompt }) => {
//     const source = await scrapeDuckDuckGo(user_prompt);
//     const urls = source.map(item => item.url);

//     console.log("urlsssssssssssssssss", urls);

//     const fetched_constant = {
//       source,
//       contant: []
//     };
//     console.log("runninggggggg");

//     for (const url of urls) {
//       try {
//          const data = await fetchUrlContent(url, {
//                 maxSnippetLength: 15000,
//                 minSnippetLength: 50,
//                 retries: 3,
//                 maxScrolls: 3,
//             });
//         console.log(data);
//         fetched_constant.contant.push({
//           contant_title: data.title,
//           contant_url: data.url,
//           contant_snippet: data.snippet,
//           contant_image: data.images,
//           contant_video: data.videos,
//           contant_important_details: data.important_details,
//           contant_graph_horizontal: data.graph_horizontal_data,
//           contant_graph_vertical: data.graph_vertical_data
//         });
//       } catch (err) {
//         console.error(`Error fetching ${url}:`, err.message);
//       }
//     }

//     return {
//       content: [
//         {
//           type: "text",
//           text: `
//             fetch_data_from_internet
//             Instructions for AI:
//             1. Enhance the database by creating a 'summary' array. For each entry in 'contant', generate a concise summary (2-3 sentences, max 100 words) of the 'contant_snippet' field, focusing on the main topic or key information.
//             2. Create a 'source' array where each entry includes:
//                - title: The 'contant_title' of the source.
//                - url: The 'contant_url' of the source.
//                - summary: A short summary (1-2 sentences, max 50 words) of the 'contant_snippet' or 'contant_important_details.description' if available.
//             3. For each source in the 'source' array, list the title first, then the URL, then the short summary.
//             4. If 'contant_graph_horizontal' or 'contant_graph_vertical' exists, include a note in the summary about the presence of graph data (e.g., "Contains graph data with headers: [...]").
//             5. Ignore entries with empty 'contant_snippet' or 'contant_title'.
//             6. Return the enhanced database with the 'summary' array and the 'source' array in the specified format.
//             Data:
//             ${JSON.stringify(fetched_constant, null, 2)}
//           `
//         }
//       ]
//     };
//   }
// );

mcpServer.tool(
  "fetch-the-latest-data",
  "Fetches the latest data from the internet for a given user prompt",
  {
    user_prompt: z.string()
  },
  async ({ user_prompt }) => {
    const source = await scrapeDuckDuckGo(user_prompt);
    const urls = source.map(item => item.url).slice(0, 3); // Limit to 3 URLs for efficiency

    console.log("Fetching URLs:", urls);

    const fetched_constant = {
      source: urls,
      contant: [],
      videos: [],
      images: [],
      graphs: []
    };

    for (const url of urls) {
      try {
        const data = await fetchUrlContent(url); // Uses artifact ID 834e4644-9731-46a3-9194-94d250d6ee6d
        console.log(`Fetched data for ${url}:`, data);
        fetched_constant.contant.push({
          contant_title: data.title?.slice(0, 200) || "Untitled",
          contant_url: data.url,
          contant_snippet: data.snippet?.slice(0, 1000) || "", // Increased to 1000 chars for richer context
          contant_important_details: {
            description: data.important_details.description?.slice(0, 500) || "", // Increased for summaries
            keywords: data.important_details.keywords?.slice(0, 10) || []
          },
          contant_graph_horizontal: data.graph_horizontal_data || null,
          contant_graph_vertical: data.graph_vertical_data || null
        });
        // Add videos to container
        if (data.videos?.length) {
          fetched_constant.videos.push({
            url: data.url,
            video_urls: data.videos.slice(0, 2) // Limit to 2 videos
          });
        }
        // Add images to container
        if (data.images?.length) {
          fetched_constant.images.push({
            url: data.url,
            image_urls: data.images.slice(0, 3) // Limit to 3 images
          });
        }
        // Add graphs to container
        if (data.graph_horizontal_data || data.graph_vertical_data) {
          fetched_constant.graphs.push({
            url: data.url,
            horizontal: data.graph_horizontal_data || null,
            vertical: data.graph_vertical_data || null
          });
        }
      } catch (err) {
        console.error(`Error fetching ${url}:`, err.message);
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `
            fetch_data_from_internet
            Instructions for AI:
            1. Create an 'aiAnalyse' array with one paragraph (4-5 sentences, max 150 words) per 'contant' entry, summarizing key insights from 'contant_snippet' or 'contant_important_details.description', focusing on the main topic and its significance. Include graph data insights if available (e.g., "Graph data shows trends: [headers/values]").
            2. Create a 'summary' array with a 5-6 line summary (max 100 words) per 'contant' entry, using 'contant_important_details.description' or 'contant_snippet', detailing the main topic and its impact.
            3. Create a 'source' array with entries: title ('contant_title'), url ('contant_url'), summary (2-3 sentences, max 50 words) from 'contant_important_details.description' or 'contant_snippet'.
            4. Create a 'videos' array with entries: source_url, video_urls (array of video links).
            5. Create an 'images' array with entries: source_url, image_urls (array of image links).
            6. Create a 'graphs' array with entries: source_url, horizontal (graph data), vertical (graph data).
            7. Ignore entries with empty 'contant_snippet' or 'contant_title'.
            8. Return JSON with 'aiAnalyse', 'summary', 'source', 'videos', 'images', 'graphs' arrays.
            Data:
            ${JSON.stringify(fetched_constant, null, 2)}
          `
        }
      ]
    };
  }
);
export { SSEServerTransport, mcpServer, transport };
