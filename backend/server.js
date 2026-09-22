import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import { connectDB } from "./config/db.js";
import reportRoutes from "./routes/reports.js";
import geocodeRoutes from "./routes/geocode.js";
import exportRoutes from "./routes/export.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure uploads folder exists (for report photos)
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
  res.json({ status: "MonsoonMap API is running" });
});

app.use("/api/reports", reportRoutes);
app.use("/api/geocode", geocodeRoutes);
app.use("/api/export", exportRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

connectDB().then(() => {
  app.listen(PORT, () => console.log(`MonsoonMap API running on port ${PORT}`));
});
