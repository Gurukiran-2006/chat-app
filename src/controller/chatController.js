const conversation=require("../models/Conversation");
const message=require("../models/Message");
const {listModels}=require("../service/ollama");

//what is client is allowed to see
const toSummary=(c)=>({
    id:c._id,
    title:c.title,
    model:c.model,
    systemPrompt:c.systemPrompt,
    updatedAt:c.updatedAt
});

const serverError=(req,label,err)=>{
    console.error(`${label}:`,err);
    return res.status(500).json({message:"something went wrong please try again"});
}

const getModels=async(req,res)=>{
    try{
     return res.json({models:await listModels});
    }
    catch(err){
    return res.status(503).json({message:err.message});
    }
};