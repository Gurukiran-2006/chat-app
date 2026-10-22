const mongoose=require("mongoose");

const conversationSchema=new mongoose.model({
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },
   title:{
       type:String,
       trim:true,
       maxlength:100,
       default:"New Chat"
   },
  model:{
    type:String,
    required:true,
    trim:true
  },
  systemPrompt:{
    type:String,
    maxlength:2000,
    trim:true,
    default:""
  },
},
{
    timestamps:true
});

conversationSchema.index({user:1,updatedAt:-1});

module.exports=mongoose.model("Conversation",conversationSchema);