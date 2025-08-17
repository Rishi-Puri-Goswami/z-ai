import { GoogleGenAI } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import clint from "../redis/index.js";
import dotenv from "dotenv";

dotenv.config({
  path: "../../.env"
});

console.log("✅ Loaded Google API key:", process.env.AI_API_KEY);

const ai = new GoogleGenAI({ apiKey: process.env.AI_API_KEY });

let mcpClient = null;
let availabletool = [];


const startmcpserver = async () => {
  mcpClient = new Client({ name: "z-ai-mcp-server", version: "1.0.0" });
  await mcpClient.connect(new SSEClientTransport(new URL("http://localhost:3001/sse")));

  const toolsList = await mcpClient.listTools();


  availabletool = toolsList.tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: "object",
      properties: tool.inputSchema.properties,
      required: tool.inputSchema.required,
    }
  }));

  console.log("✅ MCP Client connected and tools loaded:", availabletool.map(t => t.name));
};


const processUserMessage = async (userid, message) => {
  if (!availabletool.length) {
    console.warn("⚠️ MCP tools not loaded yet. Waiting...");
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!availabletool.length) throw new Error("❌ MCP tools still not loaded.");
  }

  console.log("avalable toollllllllllllllllllll", availabletool.length);

  const key = `chat:${userid}`;
  await clint.rpush(key, JSON.stringify({ role: "user", text: message }));

  const chathistory = await clint.lrange(key, 0, -1);
  const parsedHistory = chathistory.map(entry => {
    const { role, text } = JSON.parse(entry);
    return { role, parts: [{ type: "text", text }] };
  });

  const aiResponse = await getAIResponse(parsedHistory);

  await clint.rpush(key, JSON.stringify({ role: "model", text: aiResponse.text }));

  return aiResponse;
};

// const getAIResponse = async (userPrompt) => {
//   const response = await ai.models.generateContent({
//     model: "gemini-2.0-flash",
//     systemInstruction: `
// You are an AI assistant that uses tools to provide up-to-date information.

// Tool: "fetch-the-latest-data"
// - Use this tool for queries about recent or changing data (e.g., news, stocks, weather).
// - Always fetch fresh data instead of relying on memory for potentially outdated information.

// After fetching from "fetch-the-latest-data":
// 1. Process the tool's output, a JSON object with 'source' (array of URLs) and 'contant' (array with fields: contant_title, contant_url, contant_snippet, contant_important_details, contant_graph_horizontal, contant_graph_vertical).
// 2. Create an 'aiAnalyse' array, with one key insight per 'contant' entry from 'contant_snippet', 'contant_important_details', or graph data. Note if graph data exists (e.g., "Graph data shows trends with headers: [...]").
// 3. Create a 'summary' array. For each 'contant' entry, generate a 2-3 sentence summary (max 100 words) from 'contant_snippet' or 'contant_important_details.description' (prefer description), focusing on the main topic.
// 4. Create a 'source' array, each entry with:
//    - title: 'contant_title'.
//    - url: 'contant_url'.
//    - summary: 1-2 sentences (max 50 words) from 'contant_snippet' or 'contant_important_details.description'.
// 5. In 'source', list title, url, summary in that order.
// 6. Ignore entries with empty 'contant_snippet' or 'contant_title'.
// 7. Add background context from your knowledge, clearly separating it from fetched data.
// 8. Return a JSON response with 'aiAnalyse', 'summary', and 'source' arrays, ensuring 'source' lists title, url, summary in order.
//     `,
//     contents: [
//       {
//         role: "user",
//         parts: [
//           { content: userPrompt } // Changed 'text' to 'content'
//         ]
//       }
//     ],
//     tools: [{ functionDeclarations: availabletool }]
//   });

//   const candidate = response.candidates?.[0];
//   const part = candidate?.content?.parts?.[0];

//   if (part?.functionCall) {
//     return await handleToolCall(part.functionCall, [
//       { role: "user", parts: [{ content: userPrompt }] } // Match 'content' here too
//     ]);
//   }

//   return { text: part?.content || part?.text || "I don't have a response for that." };
// };


const getAIResponse = async (chathistory) => { 
  console.log("📤 Sending tools to Gemini:", 

  JSON.stringify(availabletool, null, 2));


   const response = await ai.models.generateContent({
     model: "gemini-2.0-flash",


     contents: chathistory,
     
     config: { tools: [{ functionDeclarations: availabletool }] }, });

      const candidate = response.candidates?.[0]; const part = candidate?.content?.parts?.[0]; 


      if (part?.functionCall) { return await handleToolCall(part.functionCall, chathistory); } 
      
      return { text: part?.text || "I don't have a response for that." }; };




const handleToolCall = async (functionCall, chathistory) => {
  if (!mcpClient) {
    throw new Error("MCP client not initialized");
  }

  const toolresult = await mcpClient.callTool({
    name: functionCall.name,
    arguments: functionCall.args
  });

  const updatedhistory = [
    ...chathistory,
    {
      role: "model",
      parts: [{ type: "text", text: `Calling tool: ${functionCall.name}` }],
    },
    {
      role: "user",
      parts: [{ type: "text", text: `Tool result: ${JSON.stringify(toolresult.content)}` }],
    },
  ];

  return getAIResponse(updatedhistory);
};

export { processUserMessage, startmcpserver };




