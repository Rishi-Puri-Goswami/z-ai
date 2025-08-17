import express from "express";
import { chatcontroler, getChatHestory, loginUser, register } from "../controler/controler.js";

const userroute = express.Router();

userroute.route("/chatcontroler").post(chatcontroler);
userroute.route("/getChatHestory").get(getChatHestory);
userroute.route("/loginUser").post(loginUser);
userroute.route("/register").post(register);


export default userroute ;



