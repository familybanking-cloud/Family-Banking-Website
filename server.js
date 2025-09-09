const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 10000;

// ---------- MongoDB Setup ----------
const uri = "mongodb+srv://familybanking:@workadminfb2025website@cluster0.ujmi3xs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("familyBankingDB");
    console.log("✅ Connected to MongoDB Atlas");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}
connectDB();

// ---------- Middleware ----------
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Login ----------
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.collection("members").findOne({ username, password });
    if (!user) return res.json({ success: false, message: "Invalid username or password." });

    res.json({
      success: true,
      role: user.role,
      name: user.name,
      username: user.username
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ---------- Signup ----------
app.post("/signup", async (req, res) => {
  const { fullname, email, username, password } = req.body;
  if (!fullname || !email || !username || !password)
    return res.json({ success: false, message: "All fields required." });

  try {
    const exists = await db.collection("members").findOne({ username });
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

    await db.collection("members").insertOne(newUser);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ---------- Admin API ----------
app.get("/api/admin-data", async (req, res) => {
  try {
    const members = await db.collection("members").find({}).toArray();
    const weekly = await db.collection("weekly").find({}).toArray();
    const withdrawals = await db.collection("withdrawals").find({}).toArray();
    const loans = await db.collection("loans").find({}).toArray();

    res.json({ members, weekly, withdrawals, loans });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ---------- Admin Collections Endpoints ----------
app.post("/api/admin-data/:collection", async (req, res) => {
  const { collection } = req.params;
  const { all, item, index, deleteFlag } = req.body;

  try {
    const col = db.collection(collection);

    if (all) {
      // Replace all (optional, use carefully)
      await col.deleteMany({});
      await col.insertMany(all);
    } else if (item && deleteFlag && index !== undefined) {
      // Delete item by _id
      await col.deleteOne({ _id: new ObjectId(item._id) });
    } else if (item && index !== undefined) {
      // Update existing by _id
      const {_id, ...rest} = item;
      await col.updateOne({ _id: new ObjectId(_id) }, { $set: rest });
    } else if (item) {
      // Insert new
      await col.insertOne(item);
    }

    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ---------- Member Data ----------
app.get("/api/member-data/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const user = await db.collection("members").findOne({ username });
    if (!user) return res.json({ success: false, message: "Member not found" });

    const weekly = await db.collection("weekly").find({ member: username }).toArray();
    const withdrawals = await db.collection("withdrawals").find({ member: username }).toArray();
    const loans = await db.collection("loans").find({ member: username }).toArray();

    const depositsTotal = weekly.reduce((sum, w) => sum + parseFloat(w.amount || 0), 0);
    const withdrawalsTotal = withdrawals.reduce((sum, w) => sum + parseFloat(w.withdrawn || 0), 0);
    const loansTotal = loans.reduce((sum, l) => sum + parseFloat(l.borrowed || 0), 0);
    const balance = depositsTotal - withdrawalsTotal - loansTotal;

    res.json({
      success: true,
      user,
      weekly,
      withdrawals,
      loans,
      depositsTotal,
      withdrawalsTotal,
      loansTotal,
      balance
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ---------- Member Actions ----------
app.post("/member/withdraw", async (req, res) => {
  const { username, amount, date } = req.body;
  try {
    const user = await db.collection("members").findOne({ username });
    if (!user) return res.json({ success: false, message: "User not found." });

    await db.collection("withdrawals").insertOne({
      member: username,
      withdrawn: parseFloat(amount),
      date: date || new Date().toISOString().split("T")[0]
    });

    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post("/member/request-loan", async (req, res) => {
  const { username, amount, date } = req.body;
  try {
    const user = await db.collection("members").findOne({ username });
    if (!user) return res.json({ success: false, message: "User not found." });

    await db.collection("loans").insertOne({
      member: username,
      loanRequested: parseFloat(amount),
      borrowed: 0,
      repayment: 0,
      dateTaken: date || new Date().toISOString().split("T")[0],
      status: "ongoing"
    });

    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ---------- Serve HTML ----------
const pages = ["index","signup","login","admin","member","about","contact","FAQ","home"];
pages.forEach(p => {
  app.get(p === "index" ? "/" : `/${p}.html`, (req, res) => {
    res.sendFile(path.join(__dirname, "public", `${p}.html`));
  });
});

// ---------- Start Server ----------
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
