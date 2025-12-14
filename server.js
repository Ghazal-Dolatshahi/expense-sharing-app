
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const dotenv = require("dotenv");
const { v4: uuidv4 } = require("uuid");
const axios = require('axios'); 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/expense-sharing")
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

const ExpenseSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  date: { type: Date, default: Date.now },
});

const PaymentSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  authority: { type: String, required: true, unique: true }, // کد رهگیری زرین‌پال
  status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);
const Expense = mongoose.model("Expense", ExpenseSchema);
const Payment = mongoose.model("Payment", PaymentSchema);

const ZARINPAL_MERCHANT_ID = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'; // این مرچنت آیدی صحیح سندباکس است
const ZARINPAL_REQUEST_URL = 'https://sandbox.zarinpal.com/pg/v4/payment/request.json';
const ZARINPAL_REDIRECT_URL = 'http://localhost:3000'; // آدرسی که بعد از پرداخت به آن بازمی‌گردد

const JWT_SECRET = process.env.JWT_SECRET || "expense-sharing-secret";

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Authentication required" });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
};


app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) return res.status(400).json({ message: "Username or email already exists" });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    const token = jwt.sign({ id: newUser._id, username: newUser.username }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ message: "User registered successfully", token, user: { id: newUser._id, username: newUser.username, email: newUser.email } });
  } catch (error) { console.error(error); res.status(500).json({ message: "Server error" }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ message: "Invalid credentials" });
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ message: "Login successful", token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (error) { console.error(error); res.status(500).json({ message: "Server error" }); }
});

app.get("/api/users", authenticateToken, async (req, res) => {
  try { const users = await User.find().select("-password"); res.json(users); }
  catch (error) { console.error(error); res.status(500).json({ message: "Server error" }); }
});

app.post("/api/expenses", authenticateToken, async (req, res) => {
  try {
    const { description, amount, category, paidBy, participants } = req.body;
    if (!description || !amount || !paidBy || !participants || participants.length === 0) return res.status(400).json({ message: "Please provide all required fields." });
    if (typeof amount !== 'number' || amount <= 0) return res.status(400).json({ message: "Amount must be a positive number." });
    const finalCategory = category && category.trim() !== '' ? category : "General";
    const newExpense = new Expense({ description, amount, category: finalCategory, paidBy, participants });
    await newExpense.save();
    res.status(201).json({ message: "Expense added successfully", expense: newExpense });
  } catch (error) { console.error("❌ Error adding expense:", error); res.status(500).json({ message: "Server error while adding expense" }); }
});

app.get("/api/expenses", authenticateToken, async (req, res) => {
  try { const userId = req.user.id; const expenses = await Expense.find({ $or: [{ paidBy: userId }, { participants: userId }] }).populate('paidBy', 'username email').populate('participants', 'username email').sort({ date: -1 }); res.json(expenses); }
  catch (error) { console.error("❌ Error fetching expenses:", error); res.status(500).json({ message: "Server error while fetching expenses" }); }
});

app.get("/api/balance", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const expenses = await Expense.find({ $or: [{ paidBy: userId }, { participants: userId }] }).populate("paidBy", "username").populate("participants", "username");
    const balances = {};
    expenses.forEach(expense => {
      const paidBy = expense.paidBy._id.toString(); const amountPerPerson = expense.amount / expense.participants.length;
      expense.participants.forEach(participant => {
        const participantId = participant._id.toString(); if (paidBy !== participantId) {
          balances[participantId] = balances[participantId] || {}; balances[participantId][paidBy] = (balances[participantId][paidBy] || 0) + amountPerPerson;
          balances[paidBy] = balances[paidBy] || {}; balances[paidBy][participantId] = (balances[paidBy][participantId] || 0) - amountPerPerson;
        }
      });
    });
    const formattedBalances = [];
    Object.keys(balances[userId] || {}).forEach(otherUserId => {
      const amount = balances[userId][otherUserId]; if (amount > 0) {
        const user = expenses.find(e => e.paidBy._id.toString() === otherUserId || e.participants.some(p => p._id.toString() === otherUserId)).participants.find(p => p._id.toString() === otherUserId) || expenses.find(e => e.paidBy._id.toString() === otherUserId).paidBy;
        formattedBalances.push({ owes: true, amount, user });
      }
    });
    Object.keys(balances).forEach(otherUserId => {
      if (otherUserId !== userId && balances[otherUserId][userId]) {
        const amount = -balances[otherUserId][userId]; if (amount > 0) {
          const user = expenses.find(e => e.paidBy._id.toString() === otherUserId || e.participants.some(p => p._id.toString() === otherUserId)).participants.find(p => p._id.toString() === otherUserId) || expenses.find(e => e.paidBy._id.toString() === otherUserId).paidBy;
          formattedBalances.push({ owes: false, amount, user });
        }
      }
    });
    res.json(formattedBalances);
  } catch (error) { console.error("❌ Error fetching balance:", error); res.status(500).json({ message: "Server error while fetching balance" }); }
});

app.get("/api/stats", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const expensesByCategory = await Expense.aggregate([{ $match: { $or: [{ paidBy: new mongoose.Types.ObjectId(userId) }, { participants: new mongoose.Types.ObjectId(userId) }] } }, { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } }]);
    const monthlyExpenses = await Expense.aggregate([{ $match: { $or: [{ paidBy: new mongoose.Types.ObjectId(userId) }, { participants: new mongoose.Types.ObjectId(userId) }] } }, { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } }, total: { $sum: "$amount" } } }, { $sort: { "_id.year": -1, "_id.month": -1 } }, { $limit: 12 }]);
    res.json({ expensesByCategory, monthlyExpenses });
  } catch (error) { console.error("❌ Error in /api/stats:", error); res.status(500).json({ message: "Server error while fetching stats" }); }
});

app.post("/api/payments", authenticateToken, async (req, res) => {
  try {
    const { toUserId, amount } = req.body;
    const fromUserId = req.user.id;

    console.log(`🚀 Initiating payment: ${amount} from ${fromUserId} to ${toUserId}`);

    const response = await axios.post(ZARINPAL_REQUEST_URL, {
      merchant_id: ZARINPAL_MERCHANT_ID,
      amount: amount * 10, 
      description: `Settling debt with user ID: ${toUserId}`,
      callback_url: ZARINPAL_REDIRECT_URL,
    });

    const { data } = response;
    if (data.errors.code || data.data.code !== 100) {
      console.error("Zarinpal Error:", data.errors);
      return res.status(400).json({ message: 'Could not initiate payment with Zarinpal', details: data.errors });
    }

    const authority = data.data.authority;
    const paymentUrl = `https://sandbox.zarinpal.com/pg/StartPay/${authority}`;

    const newPayment = new Payment({ from: fromUserId, to: toUserId, amount, authority, status: "pending" });
    await newPayment.save();
    console.log("✅ Payment record saved with authority:", authority);

    res.status(201).json({ message: "Payment initiated", paymentUrl });

} catch (error) {
    console.error("❌ Error in /api/payments:", error.message);
    if (error.response && error.response.data && error.response.data.errors) {
        console.error("🔍 Zarinpal Validation Errors:", error.response.data.errors);
    }
    res.status(500).json({ message: "Server error while initiating payment" });
}});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));