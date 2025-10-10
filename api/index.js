import app from "./app.js";

export default app;

if (!process.env.VERCEL) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log("API listening on " + port));
}
