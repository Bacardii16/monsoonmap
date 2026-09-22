import mongoose from "mongoose";

// Two separate severity vocabularies, kept as distinct string sets (no
// overlapping values) so a single `severity` field can serve both report
// types without ambiguity.
export const WATER_SEVERITIES = ["clear", "minor", "difficult", "impassable"];
export const POTHOLE_SEVERITIES = ["small", "medium", "large", "hazardous"];

const reportSchema = new mongoose.Schema(
  {
    // "waterlogging" = flood-style reports (original feature).
    // "pothole" = road-damage reports (persist far longer than floods).
    type: {
      type: String,
      enum: ["waterlogging", "pothole"],
      default: "waterlogging",
    },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      areaName: { type: String, trim: true, default: "" },
    },
    severity: {
      type: String,
      enum: [...WATER_SEVERITIES, ...POTHOLE_SEVERITIES],
      required: true,
    },
    photoUrl: {
      type: String,
      default: null,
    },
    // Optional free-text context — mainly used by preloaded/seed entries
    // to explain why a spot was marked (e.g. "recurring monsoon pothole").
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    reportedBy: {
      // anonymous by default for MVP; can be wired to real auth later
      type: String,
      default: "anonymous",
    },
    // Distinguishes crowd-submitted reports ("user") from preloaded
    // municipal/seed data ("seed") — lets the frontend/exports label them
    // differently and lets the seed script re-run without duplicating.
    source: {
      type: String,
      enum: ["user", "seed"],
      default: "user",
    },
    upvotes: {
      type: Number,
      default: 0,
    },
    // Counts "this has cleared up" reports — the inverse of upvotes.
    // Crossing CLEAR_VOTE_THRESHOLD (see routes/reports.js) deletes the
    // report outright rather than just decrementing something, since "this
    // is gone now" is a factual claim about the world, not a downvote on
    // the report's quality.
    clearVotes: {
      type: Number,
      default: 0,
    },
    // Waterlogging is time-sensitive (conditions change within hours), so
    // it auto-expires in 6 hours via the TTL index below. Potholes are
    // physical road damage that persists for weeks/months, so they get a
    // much longer window (90 days) instead of disappearing overnight.
    // This is a function default so it can see `this.type`, which Mongoose
    // resolves after the provided fields (including `type`) are applied.
    expiresAt: {
      type: Date,
      default: function () {
        const type = this && this.type;
        const hours = type === "pothole" ? 24 * 90 : 6;
        return new Date(Date.now() + hours * 60 * 60 * 1000);
      },
    },
  },
  { timestamps: true }
);

reportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
reportSchema.index({ "location.lat": 1, "location.lng": 1 });
reportSchema.index({ type: 1 });

export default mongoose.model("Report", reportSchema);