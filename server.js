// server.js
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());

// Serve static frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// -------------------- MongoDB Setup --------------------
const client = new MongoClient(process.env.MONGO_URI);
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("familybanking");
    console.log("✅ MongoDB connected");
    await seedDatabase();
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
}

// -------------------- Seed Database --------------------
async function seedDatabase() {
  const membersCollection = db.collection("members");

  // Admin account
  const adminExists = await membersCollection.findOne({ username: "admin" });
  if (!adminExists) {
    await membersCollection.insertOne({
      username: "Jal",
      password: "adminfb2025",
      role: "admin",
      name: "Administrator",
      status: "active",
      startDate: new Date().toISOString().split("T")[0],
    });
    console.log("👑 Admin account created!");
  }
}

// -------------------- Routes --------------------

// Signup
app.post("/signup", async (req, res) => {
  const { fullname, email, username, password } = req.body;

  if (!fullname || !email || !username || !password) {
    return res.json({ success: false, message: "All fields are required" });
  }

  try {
    const existing = await db.collection("members").findOne({ username });
    if (existing) return res.json({ success: false, message: "Username already exists" });

    await db.collection("members").insertOne({
      name: fullname,
      email,
      username,
      password,
      role: "member",
      status: "active",
      startDate: new Date().toISOString().split("T")[0],
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error creating account" });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const member = await db.collection("members").findOne({ username, password });
    if (!member) return res.json({ success: false, message: "Invalid username or password" });
    res.json({ success: true, username: member.username, role: member.role, name: member.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Member data
app.get("/api/member-data/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const weekly = await db.collection("weekly").find({ member: username }).toArray();
    const withdrawals = await db.collection("withdrawals").find({ member: username }).toArray();
    const loans = await db.collection("loans").find({ member: username }).toArray();
    res.json({ success: true, weekly, withdrawals, loans });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error fetching member data" });
  }
});

// Admin data
app.get("/api/admin-data", async (req, res) => {
  try {
    const members = await db.collection("members").find({}).toArray();
    const weekly = await db.collection("weekly").find({}).toArray();
    const withdrawals = await db.collection("withdrawals").find({}).toArray();
    const loans = await db.collection("loans").find({}).toArray();
    res.json({ members, weekly, withdrawals, loans });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching admin data" });
  }
});

// Admin update/save
app.post("/api/admin-data/:collection", async (req, res) => {
  const { collection } = req.params;
  const { item, deleteFlag } = req.body;

  try {
    const coll = db.collection(collection);

    if (deleteFlag) {
      await coll.deleteOne({ _id: ObjectId(item._id) });
      return res.json({ success: true });
    }

    if (item._id) {
      const id = ObjectId(item._id);
      delete item._id;
      await coll.updateOne({ _id: id }, { $set: item });
    } else {
      await coll.insertOne(item);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error saving data" });
  }
});

// Member withdrawal
app.post("/member/withdraw", async (req, res) => {
  const { username, amount, date } = req.body;
  try {
    await db.collection("withdrawals").insertOne({ member: username, withdrawn: parseFloat(amount), date });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error requesting withdrawal" });
  }
});

// Member loan request
app.post("/member/request-loan", async (req, res) => {
  const { username, amount, date } = req.body;
  try {
    await db.collection("loans").insertOne({
      member: username,
      loanRequested: parseFloat(amount),
      borrowed: 0,
      repayment: 0,
      dateTaken: date,
      dueDate: "",
      finishDate: "",
      status: "ongoing",
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error requesting loan" });
  }
});

// -------------------- Start Server --------------------
const PORT = process.env.PORT || 10000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
});
