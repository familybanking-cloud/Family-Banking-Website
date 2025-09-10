require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 10000; // For Render
const MONGO_URI = process.env.MONGO_URI || "your_mongodb_connection_string"; // Set in Render env vars
const DB_NAME = "familyBank";

// ---------- Middleware ----------
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve frontend files

// ---------- MongoDB Connection ----------
let db, membersCol, weeklyCol, withdrawalsCol, loansCol;

MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then(client => {
    db = client.db(DB_NAME);
    membersCol = db.collection("members");
    weeklyCol = db.collection("weekly");
    withdrawalsCol = db.collection("withdrawals");
    loansCol = db.collection("loans");
    console.log("✅ Connected to MongoDB");
  })
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ---------- Login ----------
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await membersCol.findOne({ username, password });
  if (!user) return res.json({ success: false, message: "Invalid username or password." });

  res.json({
    success: true,
    role: user.role,
    name: user.name,
    username: user.username
  });
});

// ---------- Signup ----------
app.post("/signup", async (req, res) => {
  const { fullname, email, username, password } = req.body;
  if (!fullname || !email || !username || !password)
    return res.json({ success: false, message: "All fields required." });

  const exists = await membersCol.findOne({ username });
  if (exists) return res.json({ success: false, message: "Username already exists." });

  const newUser = {
    startDate: new Date().toISOString().split("T")[0],
    name: fullname,
    email,
    username,
    password,
    role: "member",
    status: "active"
  };

  await membersCol.insertOne(newUser);
  res.json({ success: true });
});

// ---------- Admin ----------
app.get("/api/admin-data", async (req, res) => {
  const members = await membersCol.find().toArray();
  const weekly = await weeklyCol.find().toArray();
  const withdrawals = await withdrawalsCol.find().toArray();
  const loans = await loansCol.find().toArray();
  res.json({ members, weekly, withdrawals, loans });
});

app.post("/api/admin-data", async (req, res) => {
  // Overwrites collections (use carefully)
  const { members, weekly, withdrawals, loans } = req.body;
  if (members && membersCol) {
    await membersCol.deleteMany({});
    if (members.length) await membersCol.insertMany(members);
  }
  if (weekly && weeklyCol) {
    await weeklyCol.deleteMany({});
    if (weekly.length) await weeklyCol.insertMany(weekly);
  }
  if (withdrawals && withdrawalsCol) {
    await withdrawalsCol.deleteMany({});
    if (withdrawals.length) await withdrawalsCol.insertMany(withdrawals);
  }
  if (loans && loansCol) {
    await loansCol.deleteMany({});
    if (loans.length) await loansCol.insertMany(loans);
  }
  res.json({ success: true });
});

// Change password
app.post("/api/change-password", async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  if (!username || !oldPassword || !newPassword)
    return res.json({ success: false, message: "Missing fields." });

  const user = await membersCol.findOne({ username, password: oldPassword });
  if (!user) return res.json({ success: false, message: "Old password is incorrect" });

  await membersCol.updateOne({ username }, { $set: { password: newPassword } });
  res.json({ success: true, message: "Password updated successfully" });
});

// ---------- Member ----------
app.get("/api/member-data/:username", async (req, res) => {
  const { username } = req.params;
  const user = await membersCol.findOne({ username });
  if (!user) return res.json({ success: false, message: "Member not found" });

  const weekly = await weeklyCol.find({ member: username }).toArray();
  const withdrawals = await withdrawalsCol.find({ member: username }).toArray();
  const loans = await loansCol.find({ member: username }).toArray();

  const depositsTotal = weekly.reduce((sum, w) => sum + parseFloat(w.amount || 0), 0);
  const withdrawalsTotal = withdrawals.reduce((sum, w) => sum + parseFloat(w.withdrawn || 0), 0);
  const loansTotal = loans.reduce((sum, l) => sum + parseFloat(l.borrowed || 0), 0);
  const balance = depositsTotal - withdrawalsTotal - loansTotal;

  res.json({ success: true, user, weekly, withdrawals, loans, depositsTotal, withdrawalsTotal, loansTotal, balance });
});

// Withdraw
app.post("/member/withdraw", async (req, res) => {
  const { username, amount, date } = req.body;
  const user = await membersCol.findOne({ username });
  if (!user) return res.json({ success: false, message: "User not found." });

  await withdrawalsCol.insertOne({
    member: username,
    withdrawn: parseFloat(amount),
    date: date || new Date().toISOString().split("T")[0]
  });

  res.json({ success: true });
});

// Request loan
app.post("/member/request-loan", async (req, res) => {
  const { username, amount, date } = req.body;
  const user = await membersCol.findOne({ username });
  if (!user) return res.json({ success: false, message: "User not found." });

  await loansCol.insertOne({
    member: username,
    loanRequested: parseFloat(amount),
    borrowed: 0,
    repayment: 0,
    dateTaken: date || new Date().toISOString().split("T")[0],
    status: "ongoing"
  });

  res.json({ success: true });
});

// ---------- Serve HTML Pages ----------
const pages = ["index","signup","login","admin","member","about","contact","FAQ","home"];
pages.forEach(p => {
  app.get(p === "index" ? "/" : `/${p}.html`, (req, res) => {
    res.sendFile(path.join(__dirname, "public", `${p}.html`));
  });
});

// ---------- Start server ----------
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
