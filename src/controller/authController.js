const bcrypt=require("bcrypt");
const jwt=require("jsonwebtoken");
const User=require("../models/User");

const Email_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const WEEK_MS=7*24*60*60*1000;

const baseCookie={
    httpOnly:true,
    sameSite:"lax",
    secure:process.env.NODE_ENV==="production",
};

const publicUser=(user)=>({
    id:user._id,
    name:user.name,
    email:user.email
});

const signUp=async (req,res)=>{
try{
  const {name,email,password}=req.body;
  
  if(![name,email,password].every((v)=> typeof v==="string" && v.trim())){
    return res.status(400).json({
        message:"All fileds are Required"
    });
  }

  if(!Email_RE.test(email.trim())){
    return res.status(400).json({
        message:"enter a valid email address"
    });
  }
  
  if(password.length<8){
    return res.status(400).json({
        message:"enter a strong password"
    });
  }
  
  const normalisedEmail=email.trim().toLowerCase();
  const existing=await User.findOne({email:normalisedEmail});

  if(existing){
    return res.status(409).json({
        message:"email already exists"
    });
  }

  const passwordHash=await bcrypt.hash(password,10);
  const user=await User.create({
    name:name.trim(),
    email:normalisedEmail,
    password:passwordHash
  });

  return res.status(201).json({
    message:"Account created",
    user:publicUser(user)
  });
}
catch(err){
    res.status(500).json({
        message:"something went wrong"
    });
}
};

const login=async(req,res)=>{
    try{
       const {email,password}=req.body;
       if(typeof email!=="string" || typeof password!=="string" || !email.trim() || !password){
        return res.status(400).json({
            message:"Invalid credentials"
        });
       }
       
       const normalisedEmail=email.trim().toLowerCase();
       const user=await User.findOne({email:normalisedEmail}).select("+password");

       const ok=user && (await bcrypt.compare(password,user.password));

       if(!ok){
        return res.status(401).json({
            message:"Invalid credentials"
        });
       }

       const token=jwt.sign(
        {id:user._id},
        process.env.JWT_SECRET,
        {expiresIn:"7d"},
       );
       
       res.cookie("token",token,{...baseCookie,maxAge:WEEK_MS});

       return res.status(201).json({
        message:"Logged In successfully",
        user:publicUser(user)
       });

    }
    catch(err){
     return res.status(500).json({
        message:"something went wrong please try again"
     });
    }
};

const logout=(req,res)=>{
    try{
    res.clearCookie("token",baseCookie);
    return res.status(201).json({message:"logout successfully"});
    }
    catch(err){
        return res.status(500).json({message:"Error"+err.message});
    }
}

// Who am I? Runs behind requireAuth, so req.user is already set.
const me = (req, res) => {
  return res.json({ user: publicUser(req.user) });
};

module.exports={signUp,login,logout,me};
