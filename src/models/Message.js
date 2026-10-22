const mongoose=require("mongoose");

const mongooseSchema=new mongoose.Schema({
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
},
{timestamps:true
});

messageSchema.index({conversation:1,createdAt:-1});
module.exports=mongoose.model("message",messageSchema);
