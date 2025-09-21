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
    if (!username || !amount) return res.json({ success: false, message: "Invalid data" });

    const doc = {
      member: username,
      amount: parseFloat(amount),
      date: date || new Date().toISOString().slice(0, 10),
    };

    const result = await weeklyCol.insertOne(doc);
    res.json({ success: true, id: result.insertedId, ...doc });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to add weekly contribution" });
  }
});

// ---------- Add Withdrawal ----------
app.post("/api/admin/add-withdrawal", async (req, res) => {
  try {
    const { username, amount, date } = req.body;
    if (!username || !amount) return res.json({ success: false, message: "Invalid data" });

    const doc = {
      member: username,
      withdrawn: parseFloat(amount),
      date: date || new Date().toISOString().slice(0, 10),
    };

    const result = await withdrawalsCol.insertOne(doc);
    res.json({ success: true, id: result.insertedId, ...doc });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to add withdrawal" });
  }
});

// ---------- Add Loan ----------
app.post("/api/admin/add-loan", async (req, res) => {
  try {
    const { username, amount, repayment, date } = req.body;
    if (!username || !amount) return res.json({ success: false, message: "Invalid data" });

    const doc = {
      member: username,
      borrowed: parseFloat(amount),
      repayment: repayment ? parseFloat(repayment) : 0,
      status: "ongoing",
      dateTaken: date || new Date().toISOString().slice(0, 10),
    };

    const result = await loansCol.insertOne(doc);
    res.json({ success: true, id: result.insertedId, ...doc });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to add loan" });
  }
});

// ---------- Update Endpoints ----------
app.post("/api/admin/update-member", async (req, res) => {
  try {
    const { username, ...updateFields } = req.body;
    if (!username) return res.json({ success: false, message: "Invalid data" });
    await membersCol.updateOne({ username }, { $set: updateFields });
    res.json({ success: true, message: "Member updated" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to update member" });
  }
});

app.post("/api/admin/update-weekly", async (req, res) => {
  try {
    const { id, key, value } = req.body;
    if (!id || !key) return res.json({ success: false, message: "Invalid data" });
    const updateObj = {};
    updateObj[key] = key === "amount" ? parseFloat(value) : value;
    await weeklyCol.updateOne({ _id: ObjectId(id) }, { $set: updateObj });
    res.json({ success: true, message: "Weekly contribution updated" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to update weekly contribution" });
  }
});

app.post("/api/admin/update-withdrawal", async (req, res) => {
  try {
    const { id, key, value } = req.body;
    if (!id || !key) return res.json({ success: false, message: "Invalid data" });
    const updateObj = {};
    updateObj[key] = key === "withdrawn" ? parseFloat(value) : value;
    await withdrawalsCol.updateOne({ _id: ObjectId(id) }, { $set: updateObj });
    res.json({ success: true, message: "Withdrawal updated" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to update withdrawal" });
  }
});

app.post("/api/admin/update-loan", async (req, res) => {
  try {
    const { id, key, value } = req.body;
    if (!id || !key) return res.json({ success: false, message: "Invalid data" });
    const updateObj = {};
    if (["loanRequested","borrowed","repayment"].includes(key)) updateObj[key] = parseFloat(value);
    else updateObj[key] = value;
    await loansCol.updateOne({ _id: ObjectId(id) }, { $set: updateObj });
    res.json({ success: true, message: "Loan updated" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to update loan" });
  }
});

// ---------- Delete Endpoints ----------
app.delete("/api/admin/delete-member/:username", async (req, res) => {
  try {
    const { username } = req.params;
    await membersCol.deleteOne({ username });
    res.json({ success: true, message: "Member deleted" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to delete member" });
  }
});

app.delete("/api/admin/delete-weekly/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await weeklyCol.deleteOne({ _id: ObjectId(id) });
    res.json({ success: true, message: "Weekly contribution deleted" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to delete weekly contribution" });
  }
});

app.delete("/api/admin/delete-withdrawal/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await withdrawalsCol.deleteOne({ _id: ObjectId(id) });
    res.json({ success: true, message: "Withdrawal deleted" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to delete withdrawal" });
  }
});

app.delete("/api/admin/delete-loan/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await loansCol.deleteOne({ _id: ObjectId(id) });
    res.json({ success: true, message: "Loan deleted" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Failed to delete loan" });
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

app.get("/api/admin-data", async (req, res) => {
  try {
    const members = await Member.find();
    const weekly = await Weekly.find();
    const withdrawals = await Withdrawal.find();
    const loans = await Loan.find();

    // ✅ Calculate bank total from weekly contributions
    const bankTotal = weekly.reduce((sum, w) => sum + (w.amount || 0), 0);

    res.json({ members, weekly, withdrawals, loans, bankTotal });
  } catch (err) {
    res.status(500).json({ message: "Failed to load admin data" });
  }
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
