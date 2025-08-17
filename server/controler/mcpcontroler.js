import { mcpServer , SSEServerTransport , transport  } from "../mcpsetup.js";

const handelSeeConnection = async (req , res )=>{

      const transports = new SSEServerTransport('/messages', res);
      transport[transports.sessionId] = transports;

      res.on("close", ()=>{
        delete  transport[transports.sessionId];
         console.log(`Client disconnected: ${transports.sessionId}`);
      })

      try {
         await mcpServer.connect(transports);
           console.log(`New client connected: ${transports.sessionId}`);
      } catch (error) {
        console.error("SSE connection error:", error);
    res.status(500).end();
      }

}



const handelPostMessage = async (req , res )=>{


    const sessionId = req.query.sessionId;
    if (!sessionId) return res.status(400).send("sessionId is required");
    const transports = transport[sessionId];
    if (!transports) return res.status(404).send("Transport not found");


  try {
    await transports.handlePostMessage(req, res);
  } catch (err) {
    console.error("Message handling error:", err);
    res.status(500).send("Internal server error");
  }

}


export {handelSeeConnection  , handelPostMessage };



