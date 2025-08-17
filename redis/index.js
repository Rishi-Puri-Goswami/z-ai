import Redis from "ioredis";
const clint = new Redis({db : 5})
// try {
//     await clint.connect().then(()=>{
// console.log("redis connect successfully");
//  }) 
// } catch (error) {
//    console.log("error on connect redis " , error); 
// } 

export default clint;
    