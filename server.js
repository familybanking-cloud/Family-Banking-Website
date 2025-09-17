require("dotenv").config(); 
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI || "your-mongodb-uri";
const DB_NAME = "familyBanking";

// ---------- Middleware ----------
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- MongoDB Connection ----------
let db, membersCol, weeklyCol, withdrawalsCol, loansCol;

async function connectDB() {
  try {
    const client = await MongoClient.connect(MONGO_URI, { useUnifiedTopology: true });
    db = client.db(DB_NAME);
    membersCol = db.collection("members");
    weeklyCol = db.collection("weekly");
    withdrawalsCol = db.collection("withdrawals");
    loansCol = db.collection("loans");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
}

// ---------- Signup ----------
app.post("/signup", async (req, res) => {
  try {
    const { fullname, email, username, password } = req.body;
    if (!fullname || !email || !username || !password) {
      return res.json({ success: false, message: "Please fill all fields." });
    }

    const existingUser = await membersCol.findOne({ username });
    if (existingUser) {
      return res.json({ success: false, message: "Username already exists." });
    }

    const newUser = {
      startDate: new Date().toISOString().split("T")[0],
      name: fullname,
      email,
      username,
      password,
      role: "member",
      status: "active",
    };

    await membersCol.insertOne(newUser);
    res.json({ success: true, message: "Signup successful! You can now log in." });
  } catch (err) {
    console.error("Signup error:", err);
    res.json({ success: false, message: "Signup error. Contact Administrator" });
  }
});

// ---------- Login ----------
app.post("/index", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Enter username and password." });

    const user = await membersCol.findOne({ username, password });
    if (!user) return res.json({ success: false, message: "Invalid username or password." });

    res.json({
      success: true,
      username: user.username,
      name: user.name,
      role: user.role
    });
  } catch (err) {
    console.error("Login error:", err);
    res.json({ success: false, message: "Login error. Contact admin." });
  }
});

// ---------- Admin: Get All Data ----------
app.get("/api/admin-data", async (req, res) => {
  try {
    const members = await membersCol.find().toArray();
    const weekly = await weeklyCol.find().toArray();
    const withdrawals = await withdrawalsCol.find().toArray();
    const loansRaw = await loansCol.find().toArray();

    // Calculate loanLeft and late fee
    const loans = loansRaw.map(l => {
      const borrowed = parseFloat(l.borrowed || 0);
      const repaid = parseFloat(l.repayment || 0);
      let loanLeft = Math.max(borrowed - repaid, 0);
      let lateFee = 0;

      if (l.finishDate && new Date(l.finishDate) < new Date() && l.status === "ongoing") {
        lateFee = loanLeft * 0.02;
        loanLeft += lateFee;
      }

      return { ...l, loanLeft, lateFee };
    });

    res.json({ members, weekly, withdrawals, loans });
  } catch (err) {
    console.error("Admin data error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch admin data" });
  }
});

// ---------- Add Member ----------
app.post("/api/admin/add-member", async (req, res) => {
  try {
    const { fullname, email, username, password } = req.body;
    if (!fullname || !email || !username || !password) return res.json({ success: false, message: "All fields required" });

    const exists = await membersCol.findOne({ username });
    if (exists) return res.json({ success: false, message: "Username already exists" });

    const newMember = {
      startDate: new Date().toISOString().split("T")[0],
      name: fullname,
      email,
      username,
      password,
      role: "member",
      status: "active",
    };
    await membersCol.insertOne(newMember);
    res.json({ success: true, message: "Member added", member: newMember });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to add member" });
  }
});

// ---------- Add Weekly Contribution ----------
app.post("/api/admin/add-weekly", async (req, res) => {
  try {
    const { username, amount, date } = req.body;
    const user = await membersCol.findOne({ username });
    if (!user) return res.json({ success: false, message: "Member not found" });

    await weeklyCol.insertOne({
      member: username,
      amount: parseFloat(amount),
      date: date || new Date().toISOString().split("T")[0]
    });
    res.json({ success: true, message: "Weekly contribution added" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to add weekly contribution" });
  }
});

// ---------- Add Withdrawal ----------
app.post("/api/admin/add-withdrawal", async (req, res) => {
  try {
    const { username, amount, date } = req.body;
    const user = await membersCol.findOne({ username });
    if (!user) return res.json({ success: false, message: "Member not found" });

    await withdrawalsCol.insertOne({
      member: username,
      withdrawn: parseFloat(amount),
      date: date || new Date().toISOString().split("T")[0]
    });
    res.json({ success: true, message: "Withdrawal added" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to add withdrawal" });
  }
});

// ---------- Add Loan ----------
app.post("/api/admin/add-loan", async (req, res) => {
  try {
    const { username, loanRequested, borrowed, repayment, dateTaken, dueDate, finishDate, status } = req.body;
    const user = await membersCol.findOne({ username });
    if (!user) return res.json({ success: false, message: "Member not found" });

    const newLoan = {
      member: username,
      loanRequested: parseFloat(loanRequested || 0),
      borrowed: parseFloat(borrowed || loanRequested || 0),
      repayment: parseFloat(repayment || 0),
      dateTaken: dateTaken || new Date().toISOString().split("T")[0],
      dueDate: dueDate || null,
      finishDate: finishDate || null,
      status: status || "ongoing"
    };

    await loansCol.insertOne(newLoan);
    res.json({ success: true, message: "Loan added", loan: newLoan });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to add loan" });
  }
});

// ---------- Member Data ----------
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

// ---------- Serve HTML Pages ----------
const pages = ["index","signup","admin","member"];
pages.forEach(p => {
  app.get(p === "index" ? "/" : `/${p}.html`, (req, res) => {
    res.sendFile(path.join(__dirname, "public", `${p}.html`));
  });
});

// ---------- Start server ----------
connectDB().then(() => {
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
});
