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

// ---------- Admin: Manage Members ----------

// Add member
app.post("/api/admin/add-member", async (req, res) => {
  try {
    const { fullname, email, username, password } = req.body;

    if (!fullname || !email || !username || !password) {
      return res.json({ success: false, message: "All fields are required" });
    }

    const existing = await membersCol.findOne({ username });
    if (existing) {
      return res.json({ success: false, message: "Username already exists" });
    }

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
    res.json({ success: true, message: "Member added successfully", member: newMember });
  } catch (err) {
    console.error("Add member error:", err);
    res.json({ success: false, message: "Failed to add member" });
  }
});

// Delete member
app.delete("/api/admin/delete-member/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const result = await membersCol.deleteOne({ username });

    if (result.deletedCount === 0) {
      return res.json({ success: false, message: "Member not found" });
    }

    res.json({ success: true, message: "Member deleted successfully" });
  } catch (err) {
    console.error("Delete member error:", err);
    res.json({ success: false, message: "Failed to delete member" });
  }
});

// Update member (for contributions, loans, etc.)
app.post("/api/admin/update-member", async (req, res) => {
  try {
    const { username, weeklyContribution, loan, withdrawal } = req.body;

    const user = await membersCol.findOne({ username });
    if (!user) return res.json({ success: false, message: "Member not found" });

    if (weeklyContribution) {
      await weeklyCol.insertOne({
        member: username,
        amount: parseFloat(weeklyContribution),
        date: new Date().toISOString().split("T")[0]
      });
    }

    if (loan) {
      await loansCol.insertOne({
        member: username,
        borrowed: parseFloat(loan),
        repayment: 0,
        dateTaken: new Date().toISOString().split("T")[0],
        status: "ongoing"
      });
    }

    if (withdrawal) {
      await withdrawalsCol.insertOne({
        member: username,
        withdrawn: parseFloat(withdrawal),
        date: new Date().toISOString().split("T")[0]
      });
    }

    res.json({ success: true, message: "Member updated successfully" });
  } catch (err) {
    console.error("Update member error:", err);
    res.json({ success: false, message: "Failed to update member" });
  }
});

// ---------- Admin: Record Transactions ----------

// Weekly contribution
app.post("/api/admin/add-weekly", async (req, res) => {
  try {
    const { username, amount } = req.body;
    const user = await membersCol.findOne({ username });
    if (!user) return res.json({ success: false, message: "Member not found" });

    await weeklyCol.insertOne({
      member: username,
      amount: parseFloat(amount),
      date: new Date().toISOString().split("T")[0]
    });

    res.json({ success: true, message: "Weekly contribution recorded." });
  } catch (err) {
    console.error("Add weekly error:", err);
    res.json({ success: false, message: "Failed to add weekly contribution." });
  }
});

// Withdrawal
app.post("/api/admin/add-withdrawal", async (req, res) => {
  try {
    const { username, amount } = req.body;
    const user = await membersCol.findOne({ username });
    if (!user) return res.json({ success: false, message: "Member not found" });

    await withdrawalsCol.insertOne({
      member: username,
      withdrawn: parseFloat(amount),
      date: new Date().toISOString().split("T")[0]
    });

    res.json({ success: true, message: "Withdrawal recorded." });
  } catch (err) {
    console.error("Add withdrawal error:", err);
    res.json({ success: false, message: "Failed to record withdrawal." });
  }
});

// Loan
app.post("/api/admin/add-loan", async (req, res) => {
  try {
    const { username, amount } = req.body;
    const user = await membersCol.findOne({ username });
    if (!user) return res.json({ success: false, message: "Member not found" });

    await loansCol.insertOne({
      member: username,
      loanRequested: parseFloat(amount),
      borrowed: parseFloat(amount),
      repayment: 0,
      dateTaken: new Date().toISOString().split("T")[0],
      status: "ongoing"
    });

    res.json({ success: true, message: "Loan recorded." });
  } catch (err) {
    console.error("Add loan error:", err);
    res.json({ success: false, message: "Failed to record loan." });
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
