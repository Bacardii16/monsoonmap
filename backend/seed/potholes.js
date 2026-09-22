// Preloads a starter set of known pothole / damaged-road spots so the map
// isn't empty on day one and users have something to upvote or correct.
//
// IMPORTANT: the coordinates and severities below are illustrative
// placeholders based on stretches that are commonly reported in local news
// each monsoon (Kurla, Sion-Trombay Rd, JVLR, S.V. Road, etc.) — they are
// NOT a verified survey. Treat this the same way you'd treat the old
// "Sample entry — edit or delete after import" placemarks in the demo KML:
// edit, remove, or replace with real BMC/municipal pothole-complaint data
// before relying on it in production.
//
// Run with:  node seed/potholes.js
// Safe to re-run — it upserts on (type + rounded lat/lng) instead of
// duplicating entries every time.

import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Report from "../models/Report.js";

dotenv.config();

const POTHOLE_SEED = [
  {
    areaName: "LBS Marg, Kurla West",
    lat: 19.0721,
    lng: 72.8788,
    severity: "large",
    notes: "Recurring pothole stretch reported in past monsoons near the flyover approach — verify current condition.",
  },
  {
    areaName: "Sion-Trombay Road, Sion",
    lat: 19.0453,
    lng: 72.8661,
    severity: "hazardous",
    notes: "Deep potholes historically reported here after heavy rain — verify current condition.",
  },
  {
    areaName: "JVLR, near Powai",
    lat: 19.1187,
    lng: 72.9061,
    severity: "medium",
    notes: "Uneven patched stretch near the Powai junction — verify current condition.",
  },
  {
    areaName: "S.V. Road, Malad West",
    lat: 19.1868,
    lng: 72.8482,
    severity: "large",
    notes: "Frequently cited pothole stretch near the station approach — verify current condition.",
  },
  {
    areaName: "Andheri-Ghatkopar Link Road",
    lat: 19.1136,
    lng: 72.8697,
    severity: "medium",
    notes: "Patchwork road surface, commonly flagged during monsoon — verify current condition.",
  },
  {
    areaName: "Eastern Express Highway service road, Sion",
    lat: 19.0405,
    lng: 72.8619,
    severity: "hazardous",
    notes: "Service-road potholes near the highway junction — verify current condition.",
  },
  {
    areaName: "Linking Road, Bandra West",
    lat: 19.0596,
    lng: 72.8295,
    severity: "small",
    notes: "Minor surface damage near market stretch — verify current condition.",
  },
  {
    areaName: "Ghodbunder Road, Thane border",
    lat: 19.2183,
    lng: 72.9781,
    severity: "large",
    notes: "Long-reported bad stretch near the city border — verify current condition.",
  },
];

async function seed() {
  await connectDB();

  let created = 0;
  let updated = 0;

  for (const spot of POTHOLE_SEED) {
    // Match on rounded coordinates so re-running this script updates the
    // same seed marker instead of piling up duplicates every time.
    const filter = {
      type: "pothole",
      source: "seed",
      "location.lat": { $gte: spot.lat - 0.0005, $lte: spot.lat + 0.0005 },
      "location.lng": { $gte: spot.lng - 0.0005, $lte: spot.lng + 0.0005 },
    };

    const update = {
      type: "pothole",
      source: "seed",
      severity: spot.severity,
      notes: spot.notes,
      reportedBy: "seed-data",
      location: { lat: spot.lat, lng: spot.lng, areaName: spot.areaName },
      // Set explicitly rather than relying on the schema default: during a
      // findOneAndUpdate upsert, Mongoose's setDefaultsOnInsert resolves
      // function defaults without a bound document, so `this.type` isn't
      // reliably available there.
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    };

    const result = await Report.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      rawResult: true,
    });

    if (result.lastErrorObject?.updatedExisting) updated++;
    else created++;
  }

  console.log(`Pothole seed complete: ${created} created, ${updated} updated.`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Pothole seed failed:", err);
  process.exit(1);
});
