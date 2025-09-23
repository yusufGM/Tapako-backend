import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Item from "../models/Item.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedPathArg = process.argv[2];
const seedFilePath = seedPathArg
  ? path.resolve(seedPathArg)
  : path.resolve(__dirname, "../seed-items.json");

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI belum diset di .env");
    process.exit(1);
  }

  if (!fs.existsSync(seedFilePath)) {
    console.error(`❌ File tidak ditemukan: ${seedFilePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(seedFilePath, "utf-8");
  let items;
  try {
    items = JSON.parse(raw);
  } catch (e) {
    console.error("❌ Gagal parse JSON. Pastikan format valid.");
    throw e;
  }

  if (!Array.isArray(items)) {
    console.error("❌ File seed harus berupa JSON array.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB");

  const delRes = await Item.deleteMany({});
  console.log(`🗑 Koleksi 'items' dikosongkan: ${delRes.deletedCount} dokumen terhapus`);

  const insRes = await Item.insertMany(items, { ordered: false });
  console.log(`✅ ${insRes.length} items berhasil ditambahkan dari: ${path.basename(seedFilePath)}`);

  await mongoose.disconnect();
  console.log("✅ Selesai, koneksi ditutup.");
}

main().catch(async (err) => {
  console.error("❌ Error saat seeding:", err.message || err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
