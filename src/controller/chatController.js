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

// POST /chat/conversations   body: { model, systemPrompt? }
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
 
    // Ollama lists names with a tag, e.g. "llama3.2-gpu:latest". Accept the short form too.
    const wanted = model.trim();
    const found = available.find((n) => n === wanted || n === `${wanted}:latest`);
    if (!found) {
      return res.status(400).json({ message: `Model "${wanted}" is not installed.` });
    }
 
    const convo = await Conversation.create({
      user: req.user._id,
      model: found,
      systemPrompt,
    });
 
    return res.status(201).json({ conversation: toSummary(convo) });
  } catch (err) {
    return serverError(res, "createConversation", err);
  }
};