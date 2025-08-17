import dotenv from "dotenv"

dotenv.config({
    path : "../.env"
});

 import express from "express";

 import clint from "../redis/index.js";
 import { handelPostMessage , handelSeeConnection } from "./controler/mcpcontroler.js";

 const app = express();
 const PORT = process.env.MCP_PORT || 3001;

 app.get("/sse", handelSeeConnection);
 app.post("/messages" , handelPostMessage );


app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
  });
});

(async () => {
  try {
    app.listen(PORT , () => console.log(`MCP Server running on port ${PORT}`));
  } catch (err) {
    console.error("Startup error:", err);
  }
})();



process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Shutting down...");
  await clint.quit();
  process.exit(0);
});




