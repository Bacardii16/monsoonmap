import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Report, { WATER_SEVERITIES, POTHOLE_SEVERITIES } from "../models/Report.js";

const router = express.Router();

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// --- Photo upload setup (stores locally in /uploads for this project) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// GET /api/reports — active (non-expired) reports, newest first.
// Optional ?type=waterlogging|pothole to fetch just one kind; omit for both
// (this is what the map uses so preloaded pothole markers and live
// waterlogging reports show up together).
router.get("/", async (req, res) => {
  try {
    const { type } = req.query;
    const query = type ? { type } : {};
    const reports = await Report.find(query).sort({ createdAt: -1 }).limit(500);
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reports", details: err.message });
  }
});

// GET /api/reports/:id — single report
router.get("/:id", async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch report", details: err.message });
  }
});

// POST /api/reports — create a new report (waterlogging or pothole)
router.post("/", upload.single("photo"), async (req, res) => {
  try {
    const { lat, lng, severity, areaName, type } = req.body;

    if (!lat || !lng || !severity) {
      return res.status(400).json({ error: "lat, lng, and severity are required" });
    }

    const reportType = type === "pothole" ? "pothole" : "waterlogging";
    const validSeverities = reportType === "pothole" ? POTHOLE_SEVERITIES : WATER_SEVERITIES;

    if (!validSeverities.includes(severity)) {
      return res.status(400).json({
        error: `Invalid severity for type "${reportType}". Expected one of: ${validSeverities.join(", ")}`,
      });
    }

    const report = await Report.create({
      type: reportType,
      location: {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        areaName: areaName || "",
      },
      severity,
      // Relative locally (frontend/backend share an origin there via
      // Vite's dev proxy), but absolute once PUBLIC_BASE_URL is set (e.g.
      // in production, where the frontend and backend live on different
      // domains) — the same env var already used for KML export links.
      photoUrl: req.file ? `${process.env.PUBLIC_BASE_URL || ""}/uploads/${req.file.filename}` : null,
    });

    res.status(201).json(report);
  } catch (err) {
    res.status(500).json({ error: "Failed to create report", details: err.message });
  }
});

// PATCH /api/reports/:id/upvote — confirm an existing report is still accurate
router.patch("/:id/upvote", async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { $inc: { upvotes: 1 } },
      { new: true }
    );
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: "Failed to upvote report", details: err.message });
  }
});

// How many "this has cleared up" confirmations before a report is removed
// outright. Low on purpose — a handful of independent people saying "it's
// gone" is a stronger, more actionable signal than the TTL alone, and lets
// a report clear early instead of waiting out its full expiry window.
const CLEAR_VOTE_THRESHOLD = 3;

// PATCH /api/reports/:id/clear — mark a report as no longer accurate
// (water has receded / pothole was fixed). Once enough people confirm
// this, the report is deleted rather than left to expire on its own.
router.patch("/:id/clear", async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { $inc: { clearVotes: 1 } },
      { new: true }
    );
    if (!report) return res.status(404).json({ error: "Report not found" });

    if (report.clearVotes >= CLEAR_VOTE_THRESHOLD) {
      await Report.findByIdAndDelete(req.params.id);
      return res.json({ deleted: true, _id: req.params.id });
    }

    res.json({ deleted: false, report });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark report as cleared", details: err.message });
  }
});

// DELETE /api/reports/:id — remove a report (moderation)
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Report.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Report not found" });
    res.json({ message: "Report deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete report", details: err.message });
  }
});

export default router;