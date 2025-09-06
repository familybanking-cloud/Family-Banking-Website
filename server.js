const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // serve static HTML/CSS/JS

// ---------- Data helpers ----------
const dataFile = path.join(__dirname, "bankData.json");

function loadData() {
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(
      dataFile,
      JSON.stringify({ members: [], weekly: [], withdrawals: [], loans: [] }, null, 2)
    );
  }
  return JSON.parse(fs.readFileSync(dataFile));
}

function saveData(newData) {
  fs.writeFileSync(dataFile, JSON.stringify(newData, null, 2));
}

// ---------- Auth ----------
app.post("/signup", (req, res) => {
  const { fullname, email, username, password } = req.body || {};
  if (!fullname || !email || !username || !password) {
    return res.json({ success: false, message: "All fields are required." });
  }

  const data = loadData();
  if (data.members.find(m => m.username === username)) {
    return res.json({ success: false, message: "Username already exists" });
  }

  const newMember = {
    startDate: new Date().toISOString().split("T")[0],
    name: fullname,
    email,
    username,
    password, // In production, hash this!
    role: "member",
    status: "active"
  };

  data.members.push(newMember);
  saveData(data);
  res.json({ success: true, message: "Signup successful! Please log in." });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const data = loadData();
  const user = data.members.find(m => m.username === username && m.password === password);
  if (!user) return res.json({ success: false, message: "Invalid credentials" });

  res.json({ success: true, role: user.role, username: user.username, name: user.name });
});

// ---------- Admin data ----------
app.get("/api/admin-data", (req, res) => res.json(loadData()));
app.post("/api/admin-data", (req, res) => {
  const incoming = req.body;
  if (!incoming || !incoming.members || !incoming.weekly || !incoming.withdrawals || !incoming.loans) {
    return res.json({ success: false, message: "Invalid payload." });
  }
  saveData(incoming);
  res.json({ success: true, message: "Data saved successfully" });
});

// ---------- Member data ----------
app.get("/api/member-data/:username", (req, res) => {
  const { username } = req.params;
  const data = loadData();
  const member = data.members.find(m => m.username === username);
  if (!member) return res.json({ success: false, message: "Member not found" });

  const weekly = data.weekly.filter(w => w.member === username);
  const withdrawals = data.withdrawals.filter(w => w.member === username);
  const loans = data.loans.filter(l => l.member === username);

  res.json({ success: true, member, weekly, withdrawals, loans });
});

// ---------- Change password ----------
app.post("/api/change-password", (req, res) => {
  const { username, oldPassword, newPassword } = req.body || {};
  if (!username || !oldPassword || !newPassword) {
    return res.json({ success: false, message: "Missing fields." });
  }

  const data = loadData();
  const user = data.members.find(m => m.username === username && m.password === oldPassword);
  if (!user) return res.json({ success: false, message: "Old password is incorrect" });

  user.password = newPassword;
  saveData(data);
  res.json({ success: true, message: "Password updated successfully" });
});

// ---------- HTML routes ----------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "public", "signup.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/member", (req, res) => res.sendFile(path.join(__dirname, "public", "member.html")));
app.get("/about", (req, res) => res.sendFile(path.join(__dirname, "public", "about.html")));
app.get("/contact", (req, res) => res.sendFile(path.join(__dirname, "public", "contact.html")));
app.get("/FAQ", (req, res) => res.sendFile(path.join(__dirname, "public", "FAQ.html")));
app.get("/home", (req, res) => res.sendFile(path.join(__dirname, "public", "home.html")));

// ---------- Start server ----------
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
