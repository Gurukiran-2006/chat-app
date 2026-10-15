require("dotenv").config();

const express=require("express");
const cors=require("cors");
const cookieParser=require("cookie-parser");

const app=express();

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

const connectDB = require("./config/database");
const requireAuth = require("./middleware/auth");
const authRouter = require("./routes/authRouter");

app.use("/auth",authRouter);

connectDB()
.then(()=>{
    console.log("database connection establised successfully");
    app.listen(process.env.PORT||5000,()=>
    console.log("server is running")
);
})
.catch((err)=>
console.log("unable to connect to database "+err.message))