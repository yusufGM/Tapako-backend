import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Item from "../models/Item.js";

dotenv.config();

const app = express();
app.use(express.json());

const ALLOWED_ORIGINS = [
  "https://tapako-frontend.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/items", async (req, res) => {
  try {
    const items = await Item.find().lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

export default app;
