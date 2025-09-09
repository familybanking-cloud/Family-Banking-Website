import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
app.use(express.json());

// Serve frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// ---------------- MongoDB ----------------
const client = new MongoClient(process.env.MONGO_URI);
let db;

async function connectDB() {
  await client.connect();
  db = client.db("familybanking");
  console.log("✅ MongoDB connected");
  await seedDatabase();
}

async function seedDatabase() {
  const members = db.collection("members");
  const admin = await members.findOne({ username: "admin" });
  if (!admin) {
    await members.insertOne({
      username: "admin",
      password: "adminfb2025",
      role: "admin",
      name: "Administrator",
      status: "active",
      startDate: new Date().toISOString().split("T")[0],
    });
    console.log("👑 Admin created!");
  }
}

// ---------------- Helper: Balance ----------------
async function getBalance(username) {
  const weekly = await db.collection("weekly").find({ member: username }).toArray();
  const withdrawals = await db.collection("withdrawals").find({ member: username }).toArray();
  const loans = await db.collection("loans").find({ member: username }).toArray();

  let balance = 0;
  weekly.forEach(w => balance += parseFloat(w.amount) || 0);
  withdrawals.forEach(w => balance -= parseFloat(w.withdrawn) || 0);
  loans.forEach(l => balance = balance - (parseFloat(l.borrowed) || 0) + (parseFloat(l.repayment) || 0));

  return balance;
}

// ---------------- Routes ----------------

// Signup
app.post("/signup", async (req, res) => {
  const { fullname, email, username, password } = req.body;
  if (!fullname || !email || !username || !password) return res.json({ success: false, message: "All fields required" });
  const exists = await db.collection("members").findOne({ username });
  if (exists) return res.json({ success: false, message: "Username exists" });

  await db.collection("members").insertOne({
    name: fullname, email, username, password, role: "member", status: "active",
    startDate: new Date().toISOString().split("T")[0],
  });
  res.json({ success: true });
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const member = await db.collection("members").findOne({ username, password });
  if (!member) return res.json({ success: false, message: "Invalid username or password" });
  const balance = await getBalance(username);
  res.json({ success: true, username, role: member.role, name: member.name, balance });
});

// Member data
app.get("/api/member-data/:username", async (req, res) => {
  const { username } = req.params;
  const weekly = await db.collection("weekly").find({ member: username }).toArray();
  const withdrawals = await db.collection("withdrawals").find({ member: username }).toArray();
  const loans = await db.collection("loans").find({ member: username }).toArray();
  const balance = await getBalance(username);
  res.json({ success: true, weekly, withdrawals, loans, balance });
});

// Admin data
app.get("/api/admin-data", async (req, res) => {
  const members = await db.collection("members").find({}).toArray();
  const weekly = await db.collection("weekly").find({}).toArray();
  const withdrawals = await db.collection("withdrawals").find({}).toArray();
  const loans = await db.collection("loans").find({}).toArray();

  const balances = {};
  for (let m of members) balances[m.username] = await getBalance(m.username);

  res.json({ members, weekly, withdrawals, loans, balances });
});

// Admin add/update/delete
app.post("/api/admin-data/:collection", async (req, res) => {
  const { collection } = req.params;
  const { item, deleteFlag } = req.body;
  const coll = db.collection(collection);

  if (deleteFlag) {
    await coll.deleteOne({ _id: ObjectId(item._id) });
    return res.json({ success: true });
  }

  if (item._id) {
    const id = ObjectId(item._id);
    delete item._id;
    await coll.updateOne({ _id: id }, { $set: item });
  } else await coll.insertOne(item);

  res.json({ success: true });
});

// Member withdraw
app.post("/member/withdraw", async (req, res) => {
  const { username, amount, date } = req.body;
  await db.collection("withdrawals").insertOne({ member: username, withdrawn: parseFloat(amount), date });
  res.json({ success: true });
});

// Member loan request
app.post("/member/request-loan", async (req, res) => {
  const { username, amount, date } = req.body;
  await db.collection("loans").insertOne({
    member: username, loanRequested: parseFloat(amount),
    borrowed: 0, repayment: 0, dateTaken: date,
    dueDate: "", finishDate: "", status: "ongoing"
  });
  res.json({ success: true });
});

// ---------------- Start Server ----------------
const PORT = process.env.PORT || 10000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
});
