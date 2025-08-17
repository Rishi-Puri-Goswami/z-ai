import {Server} from "socket.io";
import http from "http";
import { processUserMessage } from "../index.js";
import app from "../app.js";
import clint from "../../redis/index.js";



const server = http.createServer(app);

const io = new Server(server  , {
    cors:{origin : "*"}
});


io.on("connection" , (socket)=>{
    console.log("user connected" , socket.id);


    socket.on("user_message" , async ({ message })=>{

        const userid = "689bd5a31d6d64d9deab4534";
        console.log( "user messageeeeeee",message )
        try {
            
            if(!userid || !message){
                return ;
            }


const key = `chat:${userid}`;
await clint.rpush(key , JSON.stringify({role : "user" , text:message}));

const hestory = await clint.lrange(key , 0 , -1);
const allhestory = hestory.map((item)=>{
    const {role , text} = JSON.parse(item) ;

     return { role, parts: [{ type: "text", text }] };

});

const aiResponse = await processUserMessage(userid , message);


console.log("aiResponseeeeeeeeeeeeeeeee" , aiResponse.text);
await clint.rpush(key ,JSON.stringify({ role: "model", text: aiResponse.text }))

socket.emit("aiResponse" , {text : aiResponse});



        } catch (error) {
            console.log("error on listion message from user in socket io" , error)
        }

    })





  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
  });




});

server.listen(3000, () => {
  console.log("Socket.io server running on port 3000");
});



