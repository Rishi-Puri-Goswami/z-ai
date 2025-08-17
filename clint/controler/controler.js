import clint from "../../redis/index.js";
import { processUserMessage } from "../index.js";
import { User } from "../module/dbmodule.js";
import jwt from  "jsonwebtoken";
import brycpt from "bcryptjs"
const register =  async (req , res )=>{

    try {

        const  {name , email , password } = req.body;
        if(!name || !email || !password){
            return res.status(404).json({message : "no result found"});
        }
        
        const user = await User.findOne({email});
        if(user){
            return res.status(201).json({message : "user with this email already exit"});
        }

        const hash = await brycpt.hash(password , 10);

        const createuser = await User.create({

            name ,
            email,
            password : hash
        });

        if(!createuser){
            return res.status(400).json({message : "error on create user"});
        }

        return res.status(200).json({message : "user register successfully" , user : createuser});



    } catch (error) {
        console.log("error on register user " , error)
    }

}



const loginUser = async (req , res) =>{

    try {
        const {email , password } = req.body;
        if(!email || !password){
            return res.status(200).json({message : "all field are require "});
        }


        const  finduser = await User.findOne({email});

        if(!finduser){
            return res.status(200).json({message : "password or email are wrong : "});
        }

        const passwords = await brycpt.compare(password , finduser.password)
        
        if(!passwords){
            return res.status(200).json({message : "password or email are wrong :"});
        }


        const token =  jwt.sign({id:finduser._id  ,  email:finduser.email
        } , process.env.JWT_KEY)


        
const Option = {

    httpOnly: true,
    secure: true,
      sameSite: "none",
      maxAge: 10 * 24 * 60 * 60 * 1000,
}
        res.cookie("User" ,token , Option );

        const isUser = await User.findById(finduser._id).select("-password");

if(!isUser){
    return res.status(200).json({message : "User loging error"});
}

return res.status(200).json({message : "user login successfully " , status : 2000 , user:isUser});




    } catch (error) {
        console.log("error during login User from server  :" , error)
    }

}



const chatcontroler =  async (req , res )=>{

try {
    
        // const userid = req.user?._id;
        const userid = "049309403";
    
        if(!userid){
            return res.status(404).json({message :"user id not found"});
        }
    
        const {message} = req.body;
    
        if(!message){
            return res.status(404).json({message : "user message  is required"});
        }
    
        const responce = await processUserMessage(userid , message);
    
        if(!responce){
            return res.status(404).json({message : "ai not responce"});
        }

        console.log( "ai responce :-" , responce )
        return res.status(200).json({message : "ai responce"  , responce} );
    
} catch (error) {
    console.log("error on chat controler" , error);
}

}


const getChatHestory = async (req , res) =>{
try {
    
    const userid = req.user?._id;

    if(!userid){
        return res.status(404).json({message : "user id not found "})
    }

const key =  `chat:${userid}`;

const chatdata = await clint.lrange(key , 0 , -1);
if(!chatdata){
    return res.status(404).json({message : "no chat data found from redis" });
}


const chat = chatdata.map(item => JSON.parse(item));

res.status(200).json({message : "chat found " , chat});

} catch (error) {
   console.log("error on get chat data" , error) 
}

}

   
export {chatcontroler , getChatHestory , register , loginUser};






