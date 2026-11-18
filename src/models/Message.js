const mongoose=require("mongoose");

const messageSchema=new mongoose.Schema({
    conversation:{
        type:mongoose.Schema.Types.ObjectId,
        required:true,
        ref:"Conversation"
    },
    role:{
       type:String,
       required:true,
       enum:["user","assistant","system"]
    },
    content:{
        required:true,
        type:String
    },
    model:{
        type:String
    },
// true when the input guard blocked this prompt. Blocked messages stay visible
// in the chat history but are never sent to the model.
blocked: { 
    type: Boolean, 
    default: false 
},
},
{timestamps:true,
});

messageSchema.index({conversation:1,createdAt:-1});
module.exports=mongoose.model("message",messageSchema);
