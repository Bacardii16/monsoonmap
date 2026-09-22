# MonsoonMap — Backend

REST API for MonsoonMap, a crowdsourced waterlogging map for Mumbai.

## Tech stack
- Node.js + Express
- MongoDB + Mongoose
- Multer (photo uploads)

## Setup

1. Install dependencies:
   npm install

2. Copy the environment file and edit if needed:
   cp .env.example .env

   By default it expects a local MongoDB running at mongodb://127.0.0.1:27017/monsoonmap.
   If you don't have MongoDB installed locally, the easiest option is a free
   MongoDB Atlas cluster (mongodb.com/cloud/atlas/register) — paste its
   connection string into MONGO_URI in .env.

3. Run the server:
   npm run dev

   The API will start on http://localhost:5000.

## API Endpoints

| Method | Endpoint                    | Description                                    |
|--------|------------------------------|-------------------------------------------------|
| GET    | /api/reports                 | Get active reports (optional ?type= filter)      |
| GET    | /api/reports/:id             | Get a single report                              |
| POST   | /api/reports                 | Submit a new report (multipart/form)             |
| PATCH  | /api/reports/:id/upvote      | Confirm a report is still accurate               |
| DELETE | /api/reports/:id             | Delete a report                                  |
| GET    | /api/geocode/reverse         | Turn coordinates into an area name               |
| GET    | /api/geocode/search          | Search for a place/road within Mumbai            |
| GET    | /api/export/kml              | One-time KML snapshot of reports (Google Earth)  |
| GET    | /api/export/kml-networklink  | Auto-refreshing KML wrapper for Google Earth     |

### GET /api/geocode/reverse — query params
- lat, lng (numbers, required)

### GET /api/geocode/search — query params
- q (string, required) — e.g. "Erla Road"

Both geocoding endpoints proxy OpenStreetMap's free Nominatim service — no
API key or billing account needed. Nominatim's usage policy requires a
descriptive User-Agent and caps requests to roughly 1/second, which is why
these calls are proxied through the backend rather than called directly
from the browser (the search bar also debounces requests client-side to
stay well within that limit).

### GET /api/reports — query params
- type (string, optional): waterlogging | pothole — omit to get both

### POST /api/reports — body fields
- lat (number, required)
- lng (number, required)
- type (string, optional, default "waterlogging"): waterlogging | pothole
- severity (string, required) — depends on type:
  - waterlogging: clear | minor | difficult | impassable
  - pothole: small | medium | large | hazardous
- areaName (string, optional)
- photo (file, optional)

### GET /api/export/kml, /api/export/kml-networklink — query params
- type (string, optional, /api/export/kml only): waterlogging | pothole —
  omit to export both

See `../exports/README.md` for the full Google Earth setup, including why
a "live" export requires a publicly reachable URL (ngrok or a deployed
backend) rather than localhost.

## Preloading pothole hotspots
```
npm run seed:potholes
```
Inserts (or updates, if re-run) a small set of known Mumbai pothole/road-
damage locations as `type: "pothole"`, `source: "seed"` reports, so the map
has useful pothole markers on it from day one. Edit
`backend/seed/potholes.js` to add, remove, or correct locations — the
coordinates and severities shipped there are illustrative placeholders, not
a verified survey.

## Notes on design decisions
- Waterlogging reports auto-expire after 6 hours using a MongoDB TTL index,
  since flood conditions change quickly and stale reports would mislead
  users. Pothole reports use the same TTL mechanism but with a 90-day
  window instead, since road damage persists far longer than floodwater.
- Anonymous reporting is used for the MVP to keep the reporting flow fast.
  A reportedBy field exists on the schema so auth can be added later without
  a schema change.
- Photos are stored locally in /uploads for simplicity. In a production
  build this would move to cloud storage (e.g. S3 or Cloudinary).
