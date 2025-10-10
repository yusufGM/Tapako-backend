import mongoose from "mongoose";

let cached = global._mongoose;
if (!cached) cached = global._mongoose = { conn: null, promise: null };

export async function connectDB(uri) {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 })
      .then((m) => m)
      .catch((e) => { throw e; });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
