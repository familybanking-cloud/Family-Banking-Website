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

// ---------- Admin Data ----------
app.get("/api/admin-data", async (req, res) => {
  const members = await membersCol.find().toArray();
  const weekly = await weeklyCol.find().toArray();
  const withdrawals = await withdrawalsCol.find().toArray();
  const loans = await loansCol.find().toArray();
  res.json({ members, weekly, withdrawals, loans });
});

app.post("/api/admin-data", async (req, res) => {
  try {
    const { username, field, data } = req.body;
    if (!username || !field) return res.json({ success: false, message: "Missing username or field" });

    // Delete member
    if (field === "delete") {
      await membersCol.deleteOne({ username });
      await weeklyCol.deleteMany({ member: username });
      await withdrawalsCol.deleteMany({ member: username });
      await loansCol.deleteMany({ member: username });
      return res.json({ success: true, message: "Member deleted" });
    }

    // Update member field
    if (["name", "status", "startDate"].includes(field)) {
      await membersCol.updateOne({ username }, { $set: { [field]: data } }, { upsert: true });
      return res.json({ success: true, message: "Member updated" });
    }

    // Add weekly contribution
    if (field === "weekly") {
      await weeklyCol.insertOne({ member: username, ...data });
      return res.json({ success: true, message: "Weekly added" });
    }

    // Add withdrawal
    if (field === "withdrawal") {
      await withdrawalsCol.insertOne({ member: username, ...data });
      return res.json({ success: true, message: "Withdrawal added" });
    }

    // Add or update loan
    if (field === "loan") {
      if (data._id) {
        const _id = new ObjectId(data._id);
        const rest = { ...data };
        delete rest._id;
        await loansCol.updateOne({ _id }, { $set: rest });
      } else {
        await loansCol.insertOne({ member: username, ...data });
      }
      return res.json({ success: true, message: "Loan saved" });
    }

    res.json({ success: false, message: "Unknown field" });
  } catch (err) {
    console.error("Admin POST error:", err);
    res.json({ success: false, message: "Error updating admin data" });
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
