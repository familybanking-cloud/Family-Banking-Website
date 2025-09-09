// server.js
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

const client = new MongoClient(process.env.MONGO_URI);
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("familybanking");
    console.log("MongoDB connected");
    const needed = ["members", "weekly", "withdrawals", "loans"];
    const existing = (await db.listCollections().toArray()).map(c => c.name);
    for (const n of needed) if (!existing.includes(n)) await db.createCollection(n);
    const admin = await db.collection("members").findOne({ username: "admin" });
    if (!admin) {
      await db.collection("members").insertOne({
        username: "Jal",
        password: "adminfb2025",
        role: "admin",
        name: "Administrator",
        status: "active",
        startDate: new Date().toISOString().split("T")[0],
      });
      console.log("Admin created");
    }
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
}

function validCollection(name) {
  return ["members","weekly","withdrawals","loans"].includes(name);
}

// --- Admin Routes ---
app.get("/api/admin-data", async (req,res)=>{
  try {
    const members = await db.collection("members").find({}).toArray();
    const weekly = await db.collection("weekly").find({}).toArray();
    const withdrawals = await db.collection("withdrawals").find({}).toArray();
    const loans = await db.collection("loans").find({}).toArray();
    res.json({members,weekly,withdrawals,loans});
  } catch(err){console.error(err); res.status(500).json({success:false,message:"Error"});}
});

app.post("/api/admin-data/:collection", async (req,res)=>{
  const {collection} = req.params;
  const {item,deleteFlag} = req.body;
  if(!validCollection(collection)) return res.status(400).json({success:false,message:"Invalid collection"});
  try{
    const coll = db.collection(collection);
    if(deleteFlag){ 
      if(!item || !item._id) return res.status(400).json({success:false,message:"Missing _id"}); 
      await coll.deleteOne({_id:ObjectId(item._id)}); 
      return res.json({success:true});
    }
    if(item && item._id){
      const id=ObjectId(item._id); delete item._id;
      await coll.updateOne({_id:id},{$set:item});
      return res.json({success:true});
    }
    if(item){await coll.insertOne(item); return res.json({success:true});}
    res.status(400).json({success:false,message:"Missing item"});
  }catch(err){console.error(err); res.status(500).json({success:false,message:"Error saving"});}
});

// --- Member Routes ---
app.get("/api/member-data/:username", async(req,res)=>{
  const {username} = req.params;
  try{
    const weekly = await db.collection("weekly").find({member:username}).toArray();
    const withdrawals = await db.collection("withdrawals").find({member:username}).toArray();
    const loans = await db.collection("loans").find({member:username}).toArray();
    res.json({success:true,weekly,withdrawals,loans});
  }catch(err){console.error(err); res.status(500).json({success:false,message:"Error"});}
});

app.post("/signup", async(req,res)=>{
  const {fullname,email,username,password} = req.body;
  if(!fullname || !email || !username || !password) return res.json({success:false,message:"All fields required"});
  try{
    const existing = await db.collection("members").findOne({username});
    if(existing) return res.json({success:false,message:"Username exists"});
    await db.collection("members").insertOne({name:fullname,email,username,password,role:"member",status:"active",startDate:new Date().toISOString().split("T")[0]});
    res.json({success:true});
  }catch(err){console.error(err); res.status(500).json({success:false,message:"Error"});}
});

app.post("/login", async(req,res)=>{
  const {username,password}=req.body;
  try{
    const member = await db.collection("members").findOne({username,password});
    if(!member) return res.json({success:false,message:"Invalid username/password"});
    res.json({success:true,username:member.username,role:member.role,name:member.name});
  }catch(err){console.error(err); res.status(500).json({success:false,message:"Server error"});}
});

const PORT = process.env.PORT||5000;
connectDB().then(()=>app.listen(PORT,()=>console.log(`Server running on port ${PORT}`)));
