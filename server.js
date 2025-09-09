import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

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
      const hashedPassword = await bcrypt.hash("adminfb2025", 10);
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

// ---------- JWT Middleware ----------
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: "Forbidden" });
    req.user = user;
    next();
  });
}

// ---------- Helpers ----------
function validCollection(name) {
  return ["members","weekly","withdrawals","loans"].includes(name);
}

// ---------- Signup ----------
app.post("/signup", async (req, res) => {
  const { fullname, email, username, password } = req.body;
  if (!fullname || !email || !username || !password) return res.json({ success: false, message: "All fields required" });
  
  try {
    const existing = await db.collection("members").findOne({ username });
    if (existing) return res.json({ success: false, message: "Username exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newMember = {
      name: fullname,
      email,
      username,
      password: hashedPassword,
      role: "member",
      status: "active",
      startDate: new Date().toISOString().split("T")[0]
    };
    await db.collection("members").insertOne(newMember);

    // Issue JWT
    const token = jwt.sign({ username, role: "member", name: fullname }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error signing up" });
  }
});

// ---------- Login ----------
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const member = await db.collection("members").findOne({ username });
    if (!member) return res.json({ success: false, message: "Invalid username/password" });

    const match = await bcrypt.compare(password, member.password);
    if (!match) return res.json({ success: false, message: "Invalid username/password" });

    // Issue JWT
    const token = jwt.sign({ username: member.username, role: member.role, name: member.name }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---------- Admin Routes ----------
app.get("/api/admin-data", authenticateJWT, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Admins only" });

  try {
    const members = await db.collection("members").find({}).toArray();
    const weekly = await db.collection("weekly").find({}).toArray();
    const withdrawals = await db.collection("withdrawals").find({}).toArray();
    const loans = await db.collection("loans").find({}).toArray();
    res.json({ members, weekly, withdrawals, loans });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error" });
  }
});

app.post("/api/admin-data/:collection", authenticateJWT, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Admins only" });

  const { collection } = req.params;
  const { item, deleteFlag } = req.body;
  if (!validCollection(collection)) return res.status(400).json({ success: false, message: "Invalid collection" });

  try {
    const coll = db.collection(collection);
    if (deleteFlag) {
      if (!item || !item._id) return res.status(400).json({ success: false, message: "Missing _id" });
      await coll.deleteOne({ _id: ObjectId(item._id) });
      return res.json({ success: true });
    }
    if (item && item._id) {
      const id = ObjectId(item._id);
      delete item._id;
      await coll.updateOne({ _id: id }, { $set: item });
      return res.json({ success: true });
    }
    if (item) {
      await coll.insertOne(item);
      return res.json({ success: true, item });
    }
    res.status(400).json({ success: false, message: "Missing item" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error saving" });
  }
});

// ---------- Member Routes ----------
app.get("/api/member-data/:username", authenticateJWT, async (req, res) => {
  if (req.user.role !== "member" && req.user.role !== "admin") return res.status(403).json({ success: false, message: "Forbidden" });
  const { username } = req.params;
  if (req.user.username !== username && req.user.role !== "admin") return res.status(403).json({ success: false, message: "Forbidden" });

  try {
    const weekly = await db.collection("weekly").find({ member: username }).toArray();
    const withdrawals = await db.collection("withdrawals").find({ member: username }).toArray();
    const loans = await db.collection("loans").find({ member: username }).toArray();
    res.json({ success: true, weekly, withdrawals, loans });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error" });
  }
});

const PORT = process.env.PORT || 5000;
connectDB().then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)));
