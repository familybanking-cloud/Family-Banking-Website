const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000; // For Render
const DATA_FILE = path.join(__dirname, "bankData.json");

// ---------- Middleware ----------
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve frontend files

// ---------- Helpers ----------
function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initData = { members: [], weekly: [], withdrawals: [], loans: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initData, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------- Login ----------
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const data = readData();

  const user = data.members.find(
    u => u.username === username && u.password === password
  );

  if (!user) return res.json({ success: false, message: "Invalid username or password." });

  res.json({
    success: true,
    role: user.role,
    name: user.name,
    username: user.username
  });
});

// ---------- Signup ----------
app.post("/signup", (req, res) => {
  const { fullname, email, username, password } = req.body;
  if (!fullname || !email || !username || !password)
    return res.json({ success: false, message: "All fields required." });

  const data = readData();
  if (data.members.some(u => u.username === username))
    return res.json({ success: false, message: "Username already exists." });

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

// ---------- Admin ----------
app.get("/api/admin-data", (req, res) => {
  res.json(readData());
});

app.post("/api/admin-data", (req, res) => {
  writeData(req.body);
  res.json({ success: true });
});

// Change password
app.post("/api/change-password", (req, res) => {
  const { username, oldPassword, newPassword } = req.body || {};
  if (!username || !oldPassword || !newPassword)
    return res.json({ success: false, message: "Missing fields." });

  const data = readData();
  const user = data.members.find(
    u => u.username === username && u.password === oldPassword
  );
  if (!user) return res.json({ success: false, message: "Old password is incorrect" });

  user.password = newPassword;
  writeData(data);
  res.json({ success: true, message: "Password updated successfully" });
});

// ---------- Member ----------
app.get("/api/member-data/:username", (req, res) => {
  const { username } = req.params;
  const data = readData();
  const user = data.members.find(m => m.username === username);
  if (!user) return res.json({ success: false, message: "Member not found" });

  const weekly = data.weekly.filter(w => w.member === username);
  const withdrawals = data.withdrawals.filter(w => w.member === username);
  const loans = data.loans ? data.loans.filter(l => l.member === username) : [];

  // Calculate balance
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
});

// Withdraw
app.post("/member/withdraw", (req, res) => {
  const { username, amount, date } = req.body;
  const data = readData();

  if (!data.members.some(u => u.username === username))
    return res.json({ success: false, message: "User not found." });

  data.withdrawals.push({
    member: username,
    withdrawn: parseFloat(amount),
    date: date || new Date().toISOString().split("T")[0]
  });

  writeData(data);
  res.json({ success: true });
});

// Request loan
app.post("/member/request-loan", (req, res) => {
  const { username, amount, date } = req.body;
  const data = readData();

  if (!data.members.some(u => u.username === username))
    return res.json({ success: false, message: "User not found." });

  data.loans.push({
    member: username,
    loanRequested: parseFloat(amount),
    borrowed: 0,
    repayment: 0,
    dateTaken: date || new Date().toISOString().split("T")[0],
    status: "ongoing"
  });

  writeData(data);
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


