import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import dbconnect from "./dbconnect/dbconnect.js";
import { startmcpserver } from "./index.js";

import clint from "../redis/index.js";
import userroute from "./router/userRoute.js";

const app = express();
dotenv.config({path : "../.env"})
app.use(cors({
    origin : "http://localhost:5173",
    credentials : true
}));


dbconnect().then(()=>{

  
 app.on("error", (error) => {
            console.log(`Server is not talking: ${error}`);
            throw error;
        });


// app.listen(3000, () => {
//             console.log(`🚀 Server running on port 3000 `);
//         });
})


app.use(express.json());


app.use("/api/user" , userroute )


app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    services: {
      mcp: true,
      redis: true,
    },
  });
});


const initialize = async () => {

    try {
        
      
          await startmcpserver();
           
        
    } catch (error) {
        console.log("error on start the mcp " , error);
    }

}


process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    await clint.quit();
    process.exit(0);
});

initialize();

export default app ;

