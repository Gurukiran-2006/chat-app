const express=require("express");
const mongoose=require("mongoose");

const {getModels,createConversation,listConversation,getConversation,updateConversation,deleteConversation}=require("../controller/chatController");

const { sendMessage } = require("../controller/messageController"); 

const router=express.Router();

router.param("id",(req,res,next,id)=>{
if(!mongoose.isValidObjectId(id)){
    return res.status(400).json({
        message:"invalid conversation id"
    });
}
    next();
});

router.get("/models",getModels);
router.post("/conversations", createConversation);
router.get("/conversations", listConversation);
router.get("/conversations/:id", getConversation);
router.patch("/conversations/:id", updateConversation);
router.delete("/conversations/:id", deleteConversation);

router.post("/conversations/:id/messages", sendMessage);

module.exports = router;