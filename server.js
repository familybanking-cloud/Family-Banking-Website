// server.js (ES module)
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());

// serve static frontend (adjust if your public folder differs)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// MongoDB
const client = new MongoClient(process.env.MONGO_URI);
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("familybanking");
    console.log("✅ MongoDB connected");

    // ensure collections exist
    const existing = (await db.listCollections().toArray()).map(c => c.name);
    const needed = ["members", "weekly", "withdrawals", "loans"];
    for (const n of needed) if (!existing.includes(n)) await db.createCollection(n);

    // seed admin if missing
    const mcol = db.collection("members");
    const admin = await mcol.findOne({ username: "admin" });
    if (!admin) {
      await mcol.insertOne({
        username: "admin",
        password: "adminfb2025",
        role: "admin",
        name: "Administrator",
        status: "active",
        startDate: new Date().toISOString().split("T")[0],
      });
      console.log("👑 Admin created");
    }
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
}

// helper: whitelist collection names
function validCollection(name) {
  return ["members", "weekly", "withdrawals", "loans"].includes(name);
}

// ROUTES

// Admin: fetch all collections
app.get("/api/admin-data", async (req, res) => {
  try {
    const members = await db.collection("members").find({}).toArray();
    const weekly = await db.collection("weekly").find({}).toArray();
    const withdrawals = await db.collection("withdrawals").find({}).toArray();
    const loans = await db.collection("loans").find({}).toArray();
    res.json({ members, weekly, withdrawals, loans });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error fetching admin data" });
  }
});

// Admin: insert / update / delete per-collection
app.post("/api/admin-data/:collection", async (req, res) => {
  const { collection } = req.params;
  const { item, deleteFlag } = req.body;

  if (!validCollection(collection)) return res.status(400).json({ success: false, message: "Invalid collection" });

  try {
    const coll = db.collection(collection);

    // delete
    if (deleteFlag) {
      if (!item || !item._id) return res.status(400).json({ success: false, message: "Missing _id for delete" });
      await coll.deleteOne({ _id: ObjectId(item._id) });
      return res.json({ success: true });
    }

    // update existing doc
    if (item && item._id) {
      const id = ObjectId(item._id);
      const copy = { ...item };
      delete copy._id;
      await coll.updateOne({ _id: id }, { $set: copy });
      const updated = await coll.findOne({ _id: id });
      return res.json({ success: true, item: updated });
    }

    // insert new doc
    if (item) {
      const insertResult = await coll.insertOne(item);
      const inserted = await coll.findOne({ _id: insertResult.insertedId });
      return res.json({ success: true, item: inserted });
    }

    return res.status(400).json({ success: false, message: "Missing item in body" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error saving data" });
  }
});

// Member: fetch per-member data
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

// Member: request withdrawal (convenience endpoint)
app.post("/member/withdraw", async (req, res) => {
  const { username, amount, date } = req.body;
  try {
    const doc = { member: username, withdrawn: parseFloat(amount), date };
    const r = await db.collection("withdrawals").insertOne(doc);
    const inserted = await db.collection("withdrawals").findOne({ _id: r.insertedId });
    res.json({ success: true, item: inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error requesting withdrawal" });
  }
});

// Member: request loan (convenience)
app.post("/member/request-loan", async (req, res) => {
  const { username, amount, date } = req.body;
  try {
    const doc = {
      member: username,
      loanRequested: parseFloat(amount),
      borrowed: 0,
      repayment: 0,
      dateTaken: date,
      dueDate: "",
      finishDate: "",
      status: "ongoing"
    };
    const r = await db.collection("loans").insertOne(doc);
    const inserted = await db.collection("loans").findOne({ _id: r.insertedId });
    res.json({ success: true, item: inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error requesting loan" });
  }
});

// auth routes (signup/login) - minimal, compatible with existing front-end
app.post("/signup", async (req, res) => {
  const { fullname, email, username, password } = req.body;
  if (!fullname || !email || !username || !password) return res.json({ success: false, message: "All fields required" });
  try {
    const existing = await db.collection("members").findOne({ username });
    if (existing) return res.json({ success: false, message: "Username exists" });
    const doc = { name: fullname, email, username, password, role: "member", status: "active", startDate: new Date().toISOString().split("T")[0] };
    await db.collection("members").insertOne(doc);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error signing up" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const member = await db.collection("members").findOne({ username, password });
    if (!member) return res.json({ success: false, message: "Invalid username/password" });
    res.json({ success: true, username: member.username, role: member.role, name: member.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// start
const PORT = process.env.PORT || 10000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
});
