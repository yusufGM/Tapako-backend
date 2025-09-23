export function getEnv() {
  const {
    MONGO_URI,
    JWT_SECRET,
    XENDIT_SECRET_KEY,
    FRONTEND_URL,
    CORS_ORIGIN,  
  } = process.env;

  if (!MONGO_URI) throw new Error("MONGO_URI is required");
  if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
  if (!XENDIT_SECRET_KEY) throw new Error("XENDIT_SECRET_KEY is required");
  if (!FRONTEND_URL) throw new Error("FRONTEND_URL is required");

  return { MONGO_URI, JWT_SECRET, XENDIT_SECRET_KEY, FRONTEND_URL, CORS_ORIGIN };
}
