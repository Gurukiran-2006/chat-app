const jwt=require("jsonwebtoken");
const bcrypt=require("bcrypt");
const User=require("../models/User");

const requireAuth=async(req,res,next)=>{
    try{
     const token=req.cookies?.token;

     if(!token){
        return res.status(404).json({message:"please Log In"});
     }

     const decoded=jwt.verify(token,process.env.JWT_SECRET);

     const user=await User.findBy(decoded._id);

     if(!user){
        return res.status(401).json({message:"please Log In"});
     }

     req.user=user;
     next();

    }

    catch(err){
        return res.status(500).json({
            message:"something went wrong please try again"
        });
    }
};

module.exports = requireAuth;