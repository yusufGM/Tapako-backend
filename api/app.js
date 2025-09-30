import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";

import { connectDB } from "./_db.js";
import { getEnv } from "./_env.js";
import User from "../models/User.js";
import Item from "../models/Item.js";
import Order from "../models/Order.js";

const app = express();
const { MONGO_URI, JWT_SECRET, XENDIT_SECRET_KEY, FRONTEND_URL, CORS_ORIGIN } = getEnv();

app.use(express.json());

const allowedOrigins = new Set(
  [
    CORS_ORIGIN,
    FRONTEND_URL,
    "http://localhost:5173",
  ].filter(Boolean)
);

const corsOptionsDelegate = (req, cb) => {
  const origin = req.headers.origin || "";
  if (!origin) return cb(null, { origin: false });
  const isAllowed = allowedOrigins.has(origin);
  cb(null, {
    origin: isAllowed,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  });
};

app.use((req, res, next) => {
  res.setHeader("Vary", "Origin");
  next();
});

app.use(cors(corsOptionsDelegate));
app.options("*", cors(corsOptionsDelegate));

app.use(async (_req, _res, next) => {
  await connectDB(MONGO_URI);
  next();
});

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.username = decoded.username;
    req.role = decoded.role;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const adminOnly = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ error: "Forbidden: Admin only" });
    req.userId = decoded.id;
    req.username = decoded.username;
    req.role = decoded.role;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

app.get("/test", (_req, res) => {
  res.json({ message: "API is running (Vercel serverless)" });
});
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/")) req.url = req.url.slice(4); 
  next();
});

app.get("/items", async (_req, res) => {
  try {
    const items = await Item.find().lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Gagal ambil data", detail: err.message });
  }
});

app.get("/items/:id", async (req, res) => {
  try {
    const product = await Item.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: "Produk tidak ditemukan" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Gagal ambil data", detail: err.message });
  }
});

app.post("/items", adminOnly, async (req, res) => {
  try {
    const item = await Item.create(req.body);
    res.status(201).json({ message: "Produk berhasil ditambahkan", item });
  } catch (err) {
    res.status(500).json({ error: "Gagal menambahkan produk", detail: err.message });
  }
});

app.put("/items/:id", adminOnly, async (req, res) => {
  try {
    const updated = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: "Produk tidak ditemukan" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Gagal update", detail: err.message });
  }
});

app.delete("/items/:id", adminOnly, async (req, res) => {
  try {
    const deleted = await Item.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Produk tidak ditemukan" });
    res.json({ message: "Produk dihapus" });
  } catch (err) {
    res.status(500).json({ error: "Gagal hapus", detail: err.message });
  }
});

app.get("/orders", adminOnly, async (_req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Gagal ambil orders", detail: err.message });
  }
});

app.post("/signup", async (req, res) => {
  try {
    const { username, email, password, role = "user" } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username dan password harus diisi" });
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) return res.status(400).json({ error: "Username atau email sudah digunakan" });
    await User.create({ username, email, password, role });
    res.status(201).json({ message: "User registered" });
  } catch (err) {
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: "Username/email dan password harus diisi" });
    const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
    if (!user) return res.status(401).json({ error: "User tidak ditemukan" });
    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: "Password salah" });
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

app.post("/checkout", authMiddleware, async (req, res) => {
  try {
    const { address, whatsapp, items } = req.body;
    const { username, userId } = req;

    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "Items wajib diisi dan tidak boleh kosong" });

    const total = items.reduce((sum, it) => sum + (it.price || 0) * (it.qty || 0), 0);
    if (total <= 0) return res.status(400).json({ error: "Total tidak boleh 0" });

    const email = `${username}@example.com`;

    const newOrder = await Order.create({
      user: userId,
      username,
      email,
      address,
      whatsapp,
      items: items.map(({ name, price, qty }) => ({ name, price, qty })),
      total,
      status: "PENDING",
    });

    const resp = await fetch("https://api.xendit.co/v2/invoices", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${XENDIT_SECRET_KEY}:`).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_id: `order-${newOrder._id}`,
        payer_email: email,
        amount: total,
        description: `Order oleh ${username}`,
        success_redirect_url: `${FRONTEND_URL}/success`,
        failure_redirect_url: `${FRONTEND_URL}/failed`,
        currency: "IDR",
      }),
    });

    const invoice = await resp.json();
    if (!resp.ok) {
      const msg = invoice?.error_code || invoice?.message || "Gagal membuat invoice";
      throw new Error(msg);
    }

    newOrder.paymentUrl = invoice.invoice_url;
    await newOrder.save();

    res.json({ paymentUrl: invoice.invoice_url, invoiceId: invoice.id, status: invoice.status });
  } catch (err) {
    console.error("❌ Checkout Error:", err);
    res.status(500).json({ error: "Gagal membuat invoice", details: err.message });
  }
});

export default app;
