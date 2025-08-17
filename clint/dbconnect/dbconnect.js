import mongoose from "mongoose";
import dotenv from "dotenv"

dotenv.config({
    path : "../../.env"
})

const dbconnect = async () =>{


    try {
        console.log(process.env.DB_URL , "db url");
        const db = await mongoose.connect(`${process.env.DB_URL}/z-ai`)

        console.log("db connect " , db.connection.host );


    } catch (error) {
        console.log("error on db connect " , error);
    }

}

export default dbconnect;

