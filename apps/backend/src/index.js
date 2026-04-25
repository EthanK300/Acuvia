import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Backend scaffold running on http://localhost:${port}`);
});
