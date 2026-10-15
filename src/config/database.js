const dns = require("dns");

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const mongoose=require("mongoose");

const connectDB=async()=>{
    await mongoose.connect(process.env.MONGO_URI);
};

module.exports=connectDB;