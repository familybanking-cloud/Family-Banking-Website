const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "bankData.json");

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve HTML/CSS/JS

// Helper functions
function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initData = { members: [], weekly: [], withdrawals: [], loans: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initData, null, 2));
  }
  const data = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(data);
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ------------------ Authentication ------------------
// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const data = readData();

  const user = data.members.find(u => u.username === username && u.password === password);
  if (!user) return res.json({ success: false, message: "Invalid username or password." });

  res.json({ success: true, role: user.role, name: user.name, username: user.username });
});

// Signup
app.post("/signup", (req, res) => {
  const { fullname, email, username, password } = req.body;
  if (!fullname || !email || !username || !password) return res.json({ success: false, message: "All fields required." });

  const data = readData();
  if (data.members.some(u => u.username === username)) return res.json({ success: false, message: "Username already exists." });

  const newUser = {
    startDate: new Date().toISOString().split("T")[0],
    name: fullname,
    email,
    username,
    password,
    role: "member",
    status: "active"
  };
  data.members.push(newUser);
  writeData(data);

  res.json({ success: true });
});

// ------------------ Admin ------------------
// Get all data for admin
app.get("/api/admin-data", (req, res) => {
  const data = readData();
  res.json(data);
});

// Save admin changes
app.post("/api/admin-data", (req, res) => {
  const newData = req.body;
  writeData(newData);
  res.json({ success: true });
});

// Change admin password
app.post("/api/change-password", (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  const data = readData();
  const user = data.members.find(u => u.username === username && u.password === oldPassword);
  if (!user) return res.json({ success: false, message: "Current password incorrect." });

  user.password = newPassword;
  writeData(data);
  res.json({ success: true, message: "Password updated successfully." });
});

// ------------------ Member ------------------
// Get member data
app.get("/api/member-data/:username", (req, res) => {
  const { username } = req.params;
  const data = readData();
  const user = data.members.find(u => u.username === username);
  if (!user) return res.json({ success: false, message: "User not found." });

  const weekly = data.weekly.filter(w => w.member === username);
  const withdrawals = data.withdrawals.filter(w => w.member === username);
  const loans = data.loans.filter(l => l.member === username);

  res.json({ success: true, weekly, withdrawals, loans, user });
});

// Member withdraw
app.post("/member/withdraw", (req, res) => {
  const { username, amount, date } = req.body;
  const data = readData();
  if (!data.members.some(u => u.username === username)) return res.json({ success: false, message: "User not found." });

  data.withdrawals.push({ member: username, withdrawn: parseFloat(amount), date });
  writeData(data);
  res.json({ success: true });
});

// Member request loan
app.post("/member/request-loan", (req, res) => {
  const { username, amount, date } = req.body;
  const data = readData();
  if (!data.members.some(u => u.username === username)) return res.json({ success: false, message: "User not found." });

  data.loans.push({ member: username, loanRequested: parseFloat(amount), borrowed: 0, repayment: 0, dateTaken: date || new Date().toISOString().split("T")[0], status: "ongoing" });
  writeData(data);
  res.json({ success: true });
});

// ------------------ Serve HTML Pages ------------------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/signup.html", (req, res) => res.sendFile(path.join(__dirname, "public/signup.html")));
app.get("/admin.html", (req, res) => res.sendFile(path.join(__dirname, "public/admin.html")));
app.get("/member.html", (req, res) => res.sendFile(path.join(__dirname, "public/member.html")));

// Start server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));


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

});

const PORT = process.env.PORT || 10000; // Use Render's port if available
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
