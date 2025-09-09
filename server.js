import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
app.use(express.json());

// For __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_here";

let db;

// ---------- MongoDB Connection ----------
async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db("familyBanking");
  console.log("Connected to MongoDB");
}
connectDB().catch(console.error);

// ---------- JWT Middleware ----------
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader)
    return res.status(401).json({ success: false, message: "No token provided" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: "Invalid token" });
    req.user = decoded;
    next();
  });
}

// ---------- Login ----------
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: "Missing credentials" });

  try {
    const user = await db.collection("members").findOne({ username });
    if (!user) return res.status(401).json({ success: false, message: "Invalid username/password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: "Invalid username/password" });

    const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "12h" });

    res.json({ success: true, username: user.username, role: user.role, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

// ---------- Member Routes ----------
app.get("/api/member-data", verifyToken, async (req, res) => {
  if (req.user.role !== "member")
    return res.status(403).json({ success: false, message: "Members only" });

  try {
    const username = req.user.username;
    const member = await db.collection("members").findOne({ username });
    if (!member) return res.status(404).json({ success: false, message: "Member not found" });

    const weekly = await db.collection("weekly").find({ username }).toArray();
    const withdrawals = await db.collection("withdrawals").find({ username }).toArray();
    const loans = await db.collection("loans").find({ username }).toArray();

    let balance = 0;
    weekly.forEach(w => balance += parseFloat(w.amount || 0));
    withdrawals.forEach(w => balance -= parseFloat(w.amount || 0));
    loans.forEach(l => {
      const borrowed = parseFloat(l.borrowed || 0);
      const repaid = parseFloat(l.repayment || 0);
      balance -= borrowed;
      balance += repaid;
    });

    res.json({ success: true, member: { ...member, balance }, weekly, withdrawals, loans });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error fetching member data" });
  }
});

// ---------- Admin Routes ----------
function validCollection(col) {
  return ["members", "weekly", "withdrawals", "loans"].includes(col);
}

app.get("/api/admin-data", verifyToken, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ success: false, message: "Admins only" });

  try {
    const members = await db.collection("members").find({}).toArray();
    const weekly = await db.collection("weekly").find({}).toArray();
    const withdrawals = await db.collection("withdrawals").find({}).toArray();
    const loans = await db.collection("loans").find({}).toArray();
    res.json({ success: true, members, weekly, withdrawals, loans });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error fetching admin data" });
  }
});

app.post("/api/admin-data/:collection", verifyToken, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ success: false, message: "Admins only" });

  const { collection } = req.params;
  const { item, deleteFlag } = req.body;

  if (!validCollection(collection))
    return res.status(400).json({ success: false, message: "Invalid collection" });

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
    res.status(500).json({ success: false, message: "Error saving data" });
  }
});

// ---------- Serve index.html for root ----------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- Server ----------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
