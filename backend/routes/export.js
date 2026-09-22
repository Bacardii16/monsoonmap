import express from "express";
import Report from "../models/Report.js";

const router = express.Router();

// KML icon colors per severity, in KML's aabbggrr order (matches frontend
// severity palettes). Waterlogging uses circle pins in blue/green/red;
// potholes use a different icon shape (paddle/target) in brown tones so
// the two report types are visually distinct in Google Earth.
const WATER_STYLES = {
  clear: { color: "ff98d53e", icon: "http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png" },
  minor: { color: "ff66d1ff", icon: "http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png" },
  difficult: { color: "ff4a9eff", icon: "http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png" },
  impassable: { color: "ff5c5cff", icon: "http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png" },
};

const POTHOLE_STYLES = {
  small: { color: "ff6ba6c9", icon: "http://maps.google.com/mapfiles/kml/shapes/target.png" },
  medium: { color: "ff2f70b5", icon: "http://maps.google.com/mapfiles/kml/shapes/target.png" },
  large: { color: "ff13458b", icon: "http://maps.google.com/mapfiles/kml/shapes/target.png" },
  hazardous: { color: "ff0c2c5c", icon: "http://maps.google.com/mapfiles/kml/shapes/target.png" },
};

const ALL_STYLES = { ...WATER_STYLES, ...POTHOLE_STYLES };

const SEVERITY_LABELS = {
  clear: "Clear",
  minor: "Minor waterlogging",
  difficult: "Difficult to pass",
  impassable: "Impassable",
  small: "Small pothole",
  medium: "Medium pothole",
  large: "Large pothole",
  hazardous: "Hazardous pothole",
};

// Escapes text that goes outside a CDATA block (placemark <name>)
function escapeXml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Resolves the public base URL used to build absolute photo links and the
// network-link target. Google Earth fetches these over the open internet,
// so this MUST be a URL reachable from outside your machine — a plain
// "http://localhost:5000" will silently fail to load (both the refreshed
// data and any photos), even though everything works fine in a browser on
// the same machine. Set PUBLIC_BASE_URL in .env to your ngrok URL while
// developing, or your deployed backend's URL in production.
function resolveBaseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
}

function buildKmlDocument(reports, baseUrl) {
  const styles = Object.entries(ALL_STYLES)
    .map(
      ([key, { color, icon }]) => `
    <Style id="${key}">
      <IconStyle>
        <color>${color}</color>
        <Icon><href>${icon}</href></Icon>
      </IconStyle>
    </Style>`
    )
    .join("");

  const placemarks = reports
    .map((r) => {
      const name = escapeXml(r.location.areaName || "Unnamed location");
      const photoBlock = r.photoUrl
        ? `<img src="${baseUrl}${r.photoUrl}" width="260" style="border-radius:6px;" /><br/><br/>`
        : `<i>No photo submitted with this report</i><br/><br/>`;
      const notesBlock = r.notes ? `<b>Notes:</b> ${escapeXml(r.notes)}<br/>` : "";
      const sourceBlock =
        r.source === "seed" ? `<i>Preloaded reference marker — verify before relying on it</i><br/>` : "";

      return `
    <Placemark>
      <name>${name}</name>
      <styleUrl>#${r.severity}</styleUrl>
      <description><![CDATA[
        <div style="font-family: sans-serif; max-width: 260px;">
          ${photoBlock}
          <b>Type:</b> ${r.type === "pothole" ? "Pothole / road damage" : "Waterlogging"}<br/>
          <b>Severity:</b> ${SEVERITY_LABELS[r.severity] || r.severity}<br/>
          ${notesBlock}
          <b>Upvotes:</b> ${r.upvotes}<br/>
          <b>Reported:</b> ${r.createdAt.toISOString()}<br/>
          ${sourceBlock}
        </div>
      ]]></description>
      <Point><coordinates>${r.location.lng},${r.location.lat},0</coordinates></Point>
    </Placemark>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>MonsoonMap — Live Reports</name>
    <description>Crowdsourced waterlogging and pothole reports for Mumbai, generated ${new Date().toISOString()}</description>
    ${styles}
    ${placemarks}
  </Document>
</kml>`;
}

// GET /api/export/kml — all active reports (waterlogging + potholes) as a
// one-time KML download for Google Earth. Optional ?type=waterlogging or
// ?type=pothole to export just one kind.
router.get("/kml", async (req, res) => {
  try {
    const { type } = req.query;
    const query = type ? { type } : {};
    const reports = await Report.find(query).sort({ createdAt: -1 }).limit(500);
    const baseUrl = resolveBaseUrl(req);
    const kml = buildKmlDocument(reports, baseUrl);

    res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
    res.setHeader("Content-Disposition", "attachment; filename=monsoonmap.kml");
    res.setHeader("Cache-Control", "no-store");
    res.send(kml);
  } catch (err) {
    res.status(500).json({ error: "Failed to generate KML export", details: err.message });
  }
});

// GET /api/export/kml-networklink — a small NetworkLink wrapper KML that
// points at /api/export/kml using whatever base URL this server currently
// resolves to. Import THIS file into Google Earth once; Google Earth then
// re-fetches /api/export/kml on its own every 5 minutes, so new reports
// and photos keep appearing without re-importing anything.
//
// This still requires PUBLIC_BASE_URL (or the request host) to be
// reachable from the open internet — Google Earth cannot reach
// "localhost" on your machine no matter what this file says. Run
// `npx ngrok http 5000` during development and set PUBLIC_BASE_URL to the
// printed https URL, or use your deployed backend's URL in production.
router.get("/kml-networklink", (req, res) => {
  const baseUrl = resolveBaseUrl(req);
  const isLocal = /localhost|127\.0\.0\.1/.test(baseUrl);

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <NetworkLink>
    <name>MonsoonMap — Live Reports</name>
    <description>Auto-refreshes from the MonsoonMap backend every 5 minutes. Import this once into Google Earth.${
      isLocal
        ? " WARNING: this was generated with a localhost base URL, which Google Earth cannot reach. Set PUBLIC_BASE_URL to a public URL (e.g. an ngrok tunnel or your deployed backend) and regenerate this file."
        : ""
    }</description>
    <Link>
      <href>${baseUrl}/api/export/kml</href>
      <refreshMode>onInterval</refreshMode>
      <refreshInterval>300</refreshInterval>
    </Link>
  </NetworkLink>
</kml>`;

  res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
  res.setHeader("Content-Disposition", "attachment; filename=monsoonmap_live.kml");
  res.setHeader("Cache-Control", "no-store");
  res.send(kml);
});

export default router;