const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- File Paths ----------
const dataFile = path.join(__dirname, "bankData.json");
const backupFile = path.join(__dirname, "bankData_backup.json");

// ---------- Data Helpers ----------
function readData() {
  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("❌ Error reading main data file:", err.message);

    // Try restoring from backup if main file is corrupted/missing
    try {
      if (fs.existsSync(backupFile)) {
        const backupRaw = fs.readFileSync(backupFile, "utf8");
        console.warn("⚠ Restoring data from backup...");
        return JSON.parse(backupRaw);
      }
    } catch (backupErr) {
      console.error("❌ Error reading backup file:", backupErr.message);
    }

    // Return default structure if all fails
    return { members: [], weekly: [], withdrawals: [], loans: [] };
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2)); // Keep backup in sync
  } catch (err) {
    console.error("❌ Error writing data:", err.message);
  }
}

// ---------- Admin ----------
app.get("/api/admin-data", (req, res) => {
  res.json(readData());
});

app.post("/api/admin-data", (req, res) => {
  writeData(req.body);
  res.json({ success: true });
});

app.post("/api/change-password", (req, res) => {
  const { username, oldPassword, newPassword } = req.body || {};
  if (!username || !oldPassword || !newPassword)
    return res.json({ success: false, message: "Missing fields." });

  const data = readData();
  const user = data.members.find(
    (u) => u.username === username && u.password === oldPassword
  );
  if (!user)
    return res.json({ success: false, message: "Old password is incorrect" });

  user.password = newPassword;
  writeData(data);
  res.json({ success: true, message: "Password updated successfully" });
});

// ---------- Member ----------
app.get("/api/member-data/:username", (req, res) => {
  const { username } = req.params;
  const data = readData();
  const user = data.members.find((m) => m.username === username);
  if (!user) return res.json({ success: false, message: "Member not found" });

  const weekly = data.weekly.filter((w) => w.member === username);
  const withdrawals = data.withdrawals.filter((w) => w.member === username);
  const loans = data.loans ? data.loans.filter((l) => l.member === username) : [];

  // Balance calculations
  const depositsTotal = weekly.reduce(
    (sum, w) => sum + parseFloat(w.amount || 0),
    0
  );
  const withdrawalsTotal = withdrawals.reduce(
    (sum, w) => sum + parseFloat(w.withdrawn || w.amount || 0),
    0
  );
  const loansTotal = loans.reduce(
    (sum, l) => sum + parseFloat(l.borrowed || l.loanRequested || 0),
    0
  );

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
    balance,
  });
});

app.post("/member/withdraw", (req, res) => {
  const { username, amount, date } = req.body;
  const data = readData();

  if (!data.members.some((u) => u.username === username))
    return res.json({ success: false, message: "User not found." });

  data.withdrawals.push({
    member: username,
    amount: parseFloat(amount),
    date: date || new Date().toISOString().split("T")[0],
  });

  writeData(data);
  res.json({ success: true });
});

app.post("/member/request-loan", (req, res) => {
  const { username, amount, date } = req.body;
  const data = readData();

  if (!data.members.some((u) => u.username === username))
    return res.json({ success: false, message: "User not found." });

  data.loans.push({
    member: username,
    loanRequested: parseFloat(amount),
    borrowed: 0,
    repayment: 0,
    dateTaken: date || new Date().toISOString().split("T")[0],
    status: "ongoing",
  });

  writeData(data);
  res.json({ success: true });
});

// ---------- HTML Pages ----------
const pages = [
  "index",
  "signup",
  "login",
  "admin",
  "member",
  "about",
  "contact",
  "FAQ",
  "home",
];
pages.forEach((p) => {
  app.get(p === "index" ? "/" : `/${p}.html`, (req, res) => {
    res.sendFile(path.join(__dirname, "public", `${p}.html`));
  });
});

// ---------- Start Server ----------
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
