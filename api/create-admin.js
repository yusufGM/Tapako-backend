import dotenv from "dotenv";
import mongoose from "mongoose";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { fileURLToPath } from "url";
import path from "path";
import User from "../models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const argv = yargs(hideBin(process.argv))
  .option("username", { type: "string", demandOption: true })
  .option("password", { type: "string", demandOption: true })
  .option("email", { type: "string", default: "" })
  .help().argv;

async function main() {
  const { MONGO_URI } = process.env;
  if (!MONGO_URI) throw new Error("MONGO_URI belum di-set");

  await mongoose.connect(MONGO_URI);

  const exists = await User.findOne({ username: argv.username });
  if (exists) {
    exists.role = "admin";
    if (argv.password) exists.password = argv.password;
    if (argv.email) exists.email = argv.email;
    await exists.save();
    console.log("✅ User di-promote menjadi admin.");
  } else {
    await User.create({
      username: argv.username,
      email: argv.email || undefined,
      password: argv.password,
      role: "admin",
    });
    console.log("✅ Admin baru dibuat.");
  }

  await mongoose.disconnect();
  console.log("✅ Selesai.");
}

main().catch(async (err) => {
  console.error("❌ Error:", err.message || err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
