require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- MongoDB Connection ----------
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/familyBanking", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ---------- Schema ----------
const memberSchema = new mongoose.Schema({
  name: String,
  startDate: { type: Date, default: Date.now },
  status: { type: String, default: "active" },
  contributions: [{ amount: Number, date: { type: Date, default: Date.now } }],
  withdrawals: [{ amount: Number, date: { type: Date, default: Date.now } }],
  loans: [{
    amount: Number,
    date: { type: Date, default: Date.now },
    dueDate: { type: Date },   // Loan due date
    repaid: { type: Boolean, default: false },
    penaltyApplied: { type: Boolean, default: false }
  }],
  currentBalance: { type: Number, default: 0 },
});

const Member = mongoose.model("Member", memberSchema);

// ---------- Helper: Recalculate balances ----------
async function recalcMemberBalance(memberId) {
  const member = await Member.findById(memberId);
  if (!member) return null;

  const today = new Date();

  // Apply 2% penalty if overdue and not repaid
  member.loans.forEach(loan => {
    if (!loan.repaid && loan.dueDate && today > loan.dueDate && !loan.penaltyApplied) {
      loan.amount = loan.amount * 1.02;
      loan.penaltyApplied = true;
    }
  });

  const totalContributions = member.contributions.reduce((sum, c) => sum + c.amount, 0);
  const totalWithdrawals = member.withdrawals.reduce((sum, w) => sum + w.amount, 0);
  const totalLoans = member.loans.reduce((sum, l) => sum + l.amount, 0);

  member.currentBalance = totalContributions - totalWithdrawals - totalLoans;
  await member.save();
  return member;
}

// ---------- Routes ----------

// Add member
app.post("/api/members", async (req, res) => {
  const member = new Member({ name: req.body.name });
  await member.save();
  res.json(member);
});

// Add contribution
app.post("/api/members/:id/contributions", async (req, res) => {
  const member = await Member.findById(req.params.id);
  member.contributions.push({ amount: req.body.amount });
  await member.save();
  await recalcMemberBalance(member._id);
  res.json(await Member.findById(member._id));
});

// Add withdrawal
app.post("/api/members/:id/withdrawals", async (req, res) => {
  const member = await Member.findById(req.params.id);
  member.withdrawals.push({ amount: req.body.amount });
  await member.save();
  await recalcMemberBalance(member._id);
  res.json(await Member.findById(member._id));
});

// Add loan
app.post("/api/members/:id/loans", async (req, res) => {
  const member = await Member.findById(req.params.id);

  const loan = {
    amount: req.body.amount,
    date: new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days later
  };

  member.loans.push(loan);
  await member.save();
  await recalcMemberBalance(member._id);
  res.json(await Member.findById(member._id));
});

// Mark loan as repaid
app.post("/api/members/:id/loans/:loanId/repaid", async (req, res) => {
  const member = await Member.findById(req.params.id);
  const loan = member.loans.id(req.params.loanId);
  if (loan) {
    loan.repaid = true;
    await member.save();
    await recalcMemberBalance(member._id);
  }
  res.json(await Member.findById(member._id));
});

// Delete contribution
app.delete("/api/members/:id/contributions/:cid", async (req, res) => {
  const member = await Member.findById(req.params.id);
  member.contributions.id(req.params.cid).remove();
  await member.save();
  await recalcMemberBalance(member._id);
  res.json(await Member.findById(member._id));
});

// Delete withdrawal
app.delete("/api/members/:id/withdrawals/:wid", async (req, res) => {
  const member = await Member.findById(req.params.id);
  member.withdrawals.id(req.params.wid).remove();
  await member.save();
  await recalcMemberBalance(member._id);
  res.json(await Member.findById(member._id));
});

// Delete loan
app.delete("/api/members/:id/loans/:lid", async (req, res) => {
  const member = await Member.findById(req.params.id);
  member.loans.id(req.params.lid).remove();
  await member.save();
  await recalcMemberBalance(member._id);
  res.json(await Member.findById(member._id));
});

// Get all members with totals
app.get("/api/admin-data", async (req, res) => {
  const members = await Member.find();
  let bankTotal = 0;

  const membersWithBalance = await Promise.all(
    members.map(async m => {
      const updated = await recalcMemberBalance(m._id);
      bankTotal += updated.contributions.reduce((sum, c) => sum + c.amount, 0);
      return updated;
    })
  );

  res.json({ members: membersWithBalance, bankTotal });
});

// ---------- Serve HTML Pages ----------
const pages = ["index", "signup", "admin", "member"];
pages.forEach(p => {
  app.get(p === "index" ? "/" : `/${p}.html`, (req, res) => {
    res.sendFile(path.join(__dirname, "public", `${p}.html`));
  });
});

// ---------- Start Server ----------
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
