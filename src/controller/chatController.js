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

const serverError=(res,label,err)=>{
    console.error(`${label}:`,err);
    return res.status(500).json({message:"something went wrong please try again"});
}

const getModels=async(req,res)=>{
    try{
     return res.json({models:await listModels()});
    }
    catch(err){
    return res.status(503).json({message:err.message});
    }
};

// POST /chat/conversations
const createConversation = async (req, res) => {
  try {
    const { model, systemPrompt = "" } = req.body;
 
    if (typeof model !== "string" || !model.trim()) {
      return res.status(400).json({ message: "A model is required." });
    }
    if (typeof systemPrompt !== "string" || systemPrompt.length > 2000) {
      return res.status(400).json({ message: "System prompt must be text up to 2000 characters." });
    }
 
    let available;
    try {
      available = await listModels();
    } catch (err) {
      return res.status(503).json({ message: err.message });
    }
 
    // Ollama lists names with a tag
    const wanted = model.trim();
    const found = available.find((n) => n === wanted || n === `${wanted}:latest`);
    if (!found) {
      return res.status(400).json({ message: `Model "${wanted}" is not installed.` });
    }
 
    const convo = await conversation.create({
      user: req.user._id,
      model: found,
      systemPrompt,
    });
 
    return res.status(201).json({ conversation: toSummary(convo) });
  } catch (err) {
    return serverError(res, "createConversation", err);
  }
};

const listConversation=async(req,res)=>{
  try{
      const convos=await conversation.find({user:req.user._id})
      .sort({updatedAt:-1})
      .select("title model systemPrompt updatedAt");
      
      return res.json({conversations:convos.map(toSummary)});

  }
  catch(err){
    return serverError(res,"listConversation",err);
  }
};

const getConversation=async(req,res)=>{
  try{
      const convo=await conversation.find({_id:req.params.id,user:req.user._id});

      if(!convo){
        return res.status(404).json({message:"Conversation not found"});
      }

      const messages=await message.find({conversation:convo._id})
      .sort({createdAt:1})
      .select("role content model createdAt");

      return res.json({converstion:toSummary(convo),messages});
  }
  catch(err){
    return serverError(res,"getConversation",err);
  }
};

const updateConversation=async(req,res)=>{
  try{

     const {title,systemPrompt=""}=req.body;
     
     const updates={};
     if(title!==undefined){
      if(typeof title!=="String" || !title.trim() || title.trim().length>100){
         return res.status(404).json({message:"title must be 1 to 100 characters"});
      }
      updates.title=title.trim();
     }

     if(systemPrompt!==undefined){
      if(typeof systemPrompt!=="String" || systemPrompt.length>2000){
        return res.status(404).json({message:"systemPrompt cannot exceed 2000 characters"});
      }
      updates.systemPrompt=systemPrompt;
     }
     
     if(Object.keys(updates).length===0){
      return res.status(404).json({message:"othing to update"});
     }

      const convo=await conversation.findOneAndUpdate({_id:req.params.id,user:req.user._id},
        updates,
        {new:true, runValidators:true}
      );

      if(!convo){
        return res.status(404).json({message:"Cinversation not found"});
      }
     
      return res.json({conversation:toSummary(convo)});
  }
  catch(err){
   return serverError(res,"updateConversation",err);
  }
};
