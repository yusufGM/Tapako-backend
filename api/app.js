import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { connectDB } from "./db.js";
import { getEnv } from "./env.js";
import User from "../models/User.js";
import Item from "../models/Item.js";
import Order from "../models/Order.js";
import adminRoutes from "./admin.routes.js";

const app = express();
const { MONGO_URI, JWT_SECRET, XENDIT_SECRET_KEY, FRONTEND_URL, CORS_ORIGIN } = getEnv();

app.use(express.json());

const allowedOrigins = new Set([CORS_ORIGIN, FRONTEND_URL, "http://localhost:5173"].filter(Boolean));
const corsOptionsDelegate = (req, cb) => {
  const origin = req.headers.origin || "";
  cb(null, {
    origin: origin && allowedOrigins.has(origin),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204
  });
};
app.use((req, res, next) => { res.setHeader("Vary", "Origin"); next(); });
app.use(cors(corsOptionsDelegate));
app.options("*", cors(corsOptionsDelegate));

app.use(async (_req, _res, next) => { await connectDB(MONGO_URI); next(); });

const authMiddleware = (req, res, next) => {
  try {
    const token = (req.headers.authorization || "").split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id; req.username = decoded.username; req.role = decoded.role;
    next();
  } catch { return res.status(401).json({ error: "Invalid token" }); }
};

const adminOnly = (req, res, next) => {
  try {
    const token = (req.headers.authorization || "").split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ error: "Forbidden: Admin only" });
    req.userId = decoded.id; req.username = decoded.username; req.role = decoded.role;
    next();
  } catch { return res.status(401).json({ error: "Invalid token" }); }
};

const attachActor = (req, _res, next) => { req.actor = req.username || "system"; next(); };

app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get("/api/test", (_req, res) => res.json({ message: "API is running" }));

app.get("/api/items", async (_req, res) => {
  try {
    const items = await Item.find().lean();
    res.json(items);
  } catch (err) {
    console.error("GET /api/items error:", err);
    res.status(500).json({ error: "Gagal ambil data", detail: err?.message || String(err) });
  }
});

app.get("/api/items/:id", async (req, res) => {
  try {
    const product = await Item.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: "Produk tidak ditemukan" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Gagal ambil data", detail: err.message });
  }
});

app.post("/api/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username dan password harus diisi" });
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) return res.status(400).json({ error: "Username atau email sudah digunakan" });
    await User.create({ username, email, password, role: "user" });
    res.status(201).json({ message: "User registered" });
  } catch (err) {
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: "Username/email dan password harus diisi" });
    const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
    if (!user) return res.status(401).json({ error: "User tidak ditemukan" });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: "Password salah" });
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ message: "Login successful", token, user: { id: user._id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

app.post("/api/checkout", authMiddleware, async (req, res) => {
  try {
    const { address, whatsapp, items } = req.body;
    const { username, userId } = req;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Items wajib diisi dan tidak boleh kosong" });
    const total = items.reduce((s, it) => s + (it.price || 0) * (it.qty || 0), 0);
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
      status: "PENDING"
    });
    const resp = await fetch("https://api.xendit.co/v2/invoices", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${XENDIT_SECRET_KEY}:`).toString("base64"),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        external_id: `order-${newOrder._id}`,
        payer_email: email,
        amount: total,
        description: `Order oleh ${username}`,
        success_redirect_url: `${FRONTEND_URL}/success`,
        failure_redirect_url: `${FRONTEND_URL}/failed`,
        currency: "IDR"
      })
    });
    const invoice = await resp.json();
    if (!resp.ok) throw new Error(invoice?.error_code || invoice?.message || "Gagal membuat invoice");
    newOrder.paymentUrl = invoice.invoice_url;
    await newOrder.save();
    res.json({ paymentUrl: invoice.invoice_url, invoiceId: invoice.id, status: invoice.status });
  } catch (err) {
    res.status(500).json({ error: "Gagal membuat invoice", details: err.message });
  }
});

app.get("/api/admin/orders", adminOnly, async (req, res) => {
  try {
    const { from, to, username, q, tz } = req.query;
    const filter = {};
    const nameQuery = (username || q || "").trim();
    if (nameQuery) filter.username = { $regex: nameQuery, $options: "i" };
    const parseYmd = s => {
      if (!s) return null;
      const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
    };
    const minutesOffset = Number.isFinite(Number(tz)) ? Number(tz) : 0;
    const f = parseYmd(from);
    const t = parseYmd(to);
    if (f || t) {
      const range = {};
      if (f) {
        const startUtc = new Date(Date.UTC(f.y, f.mo, f.d, 0, 0, 0, 0));
        range.$gte = new Date(startUtc.getTime() - minutesOffset * 60000);
      }
      if (t) {
        const endUtc = new Date(Date.UTC(t.y, t.mo, t.d, 23, 59, 59, 999));
        range.$lte = new Date(endUtc.getTime() - minutesOffset * 60000);
      }
      filter.createdAt = range;
    }
    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Gagal ambil orders", detail: err.message });
  }
});

app.use("/api/admin", adminOnly, attachActor, adminRoutes);

export default app;
