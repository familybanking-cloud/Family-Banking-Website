// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------- Helpers for ES Modules ----------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------- Middleware ----------------------
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve all static files (CSS, JS, images)
app.use(express.static(path.join(__dirname)));

// ---------------------- MongoDB Setup ----------------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const client = new MongoClient(MONGO_URI);
let db;

async function connectDB() {
  await client.connect();
  db = client.db('familyBanking'); // database name
  console.log('Connected to MongoDB');
}
connectDB().catch(console.error);

// ---------------------- JWT Secret ----------------------
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ---------------------- Routes ----------------------
// Serve homepage (login)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve other HTML pages
app.get('/:page', (req, res) => {
  const page = req.params.page;
  const allowedPages = ['signup.html', 'member.html', 'admin.html', 'home.html', 'about.html', 'contact.html', 'FAQ.html'];
  if (allowedPages.includes(page)) {
    res.sendFile(path.join(__dirname, page));
  } else {
    res.status(404).send('Page not found');
  }
});

// ---------------------- Login Route Example ----------------------
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.collection('members').findOne({ username });
    if (!user) return res.json({ success: false, message: 'Invalid username/password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.json({ success: false, message: 'Invalid username/password' });

    // Generate JWT
    const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ success: true, token, username: user.username, role: user.role, name: user.name });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Server error' });
  }
});

// ---------------------- Start Server ----------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});error