import express from "express";
import axios from "axios";

const router = express.Router();

// Uses OpenStreetMap's Nominatim service — completely free, no API key or
// billing account required. Its usage policy requires a descriptive
// User-Agent and a max of ~1 request/second, both handled here, so all
// geocoding calls are proxied through this backend rather than called
// directly from the browser.
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const HEADERS = { "User-Agent": "MonsoonMap-StudentProject/1.0 (college UI/UX project)" };

// Roughly the Indian mainland + islands, used to bias/limit search results
// to India so a place name doesn't return a namesake in another country.
const INDIA_VIEWBOX = "66.0,37.5,99.0,5.0"; // left,top,right,bottom

// GET /api/geocode/reverse?lat=..&lng=..
// Turns a dropped pin's coordinates into a human-readable area name
// (e.g. "Hindmata, Mumbai") so the report form can auto-fill it.
router.get("/reverse", async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: "lat and lng are required" });
    }

    const response = await axios.get(`${NOMINATIM_BASE}/reverse`, {
      headers: HEADERS,
      params: { lat, lon: lng, format: "jsonv2", addressdetails: 1, zoom: 14 },
    });

    const address = response.data.address || {};
    // In Mumbai (and much of urban India), OSM often only has a numbered
    // civic "Ward" tagged at the level Nominatim calls `suburb` — so
    // checking suburb first, unfiltered, surfaces something like "H/E
    // Ward" almost everywhere instead of a recognizable place name. Mumbai
    // wards are named with a letter-code prefix ("H/E Ward", "R/S Ward"),
    // so "Ward" can appear anywhere in the string, not just at the start —
    // matched as a whole word so it doesn't also strip a genuine place
    // name that happens to contain "ward" as part of a longer word.
    const isWardName = (v) => !v || /\bward\b/i.test(v.trim());
    const primary = [address.neighbourhood, address.suburb, address.residential, address.road];

    // Nominatim's full display_name is ordered most-specific to
    // least-specific ("Malad, Kandivali Road, ..., P/N Ward, Mumbai Zone
    // 4, ..."). When none of the structured fields above give us a
    // non-ward name, its first segment is often a genuinely useful local
    // name that just isn't broken out into its own address.* field for
    // this location — better than falling straight to the ward.
    const firstDisplaySegment = (response.data.display_name || "").split(",")[0]?.trim();
    const isUsableSegment = firstDisplaySegment && !isWardName(firstDisplaySegment) && !/^\d+$/.test(firstDisplaySegment);

    const areaName =
      primary.find((v) => v && !isWardName(v)) ||
      (isUsableSegment ? firstDisplaySegment : null) ||
      primary.find(Boolean) ||
      response.data.display_name ||
      "";

    res.setHeader("Cache-Control", "no-store");
    res.json({ areaName });
  } catch (err) {
    res.status(500).json({ error: "Reverse geocoding failed", details: err.message });
  }
});

// GET /api/geocode/search?q=..
// Powers the search bar's autocomplete — returns up to 5 matching places
// within India for a typed query like "Erla Road, Mumbai".
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const response = await axios.get(`${NOMINATIM_BASE}/search`, {
      headers: HEADERS,
      params: {
        q,
        format: "jsonv2",
        addressdetails: 0,
        limit: 5,
        viewbox: INDIA_VIEWBOX,
        bounded: 1,
        countrycodes: "in",
      },
    });

    const results = response.data.map((r) => ({
      name: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Place search failed", details: err.message });
  }
});

export default router;