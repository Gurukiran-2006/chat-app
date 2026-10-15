const express=require("express");
const router=express.Router();

const {signUp,login,logout,me} = require("../controller/authController");
const requireAuth = require("../middleware/auth");

router.post("/signup",signUp);
router.post("/login",login);
router.post("/logout",logout);
router.get("/me",requireAuth,me);

module.exports=router;
