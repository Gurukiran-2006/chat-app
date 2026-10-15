const mongoose=require("mongoose");

const userSchema=new mongoose.Schema({
    name:{
        type:"string",
        required:true,
        minlength:2,
        maxlenght:50,
        trim:true
    },
    email:{
        type:"string",
        required:true,
        unique:true,
        trim:true,
        lowercase:true
    },
    password:{
        type:"string",
        minlength:8,
        required:true,
        select:false
    },
},
{
    timestamps:true,
});

module.exports=mongoose.model("User",userSchema);