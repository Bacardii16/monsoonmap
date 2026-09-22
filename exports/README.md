# Google Earth export

This folder gives you a Google Earth view of live MonsoonMap reports.

## Quick one-time export
Download a snapshot at any time:
```
GET /api/export/kml
```
e.g. http://localhost:5000/api/export/kml — import the downloaded file into Google Earth as "Map features".

## Live auto-refreshing view (recommended)
Google Earth can only load data from a URL it can reach over the open
internet — it cannot reach `localhost` on your machine, full stop, no
matter how the KML is written. That's the #1 reason a "live" export looks
static or shows no photos: the link (and/or the photo URLs) still point at
`localhost`.

1. Make your backend reachable from the internet:
   ```
   npx ngrok http 5000
   ```
2. Set `PUBLIC_BASE_URL` in `backend/.env` to the printed ngrok `https://…`
   URL (or your deployed backend's URL in production). This makes both the
   network link and the photo links in report balloons resolve correctly.
3. Download the wrapper file from the running backend instead of hand-editing
   the old static one — it always bakes in the current `PUBLIC_BASE_URL`:
   ```
   GET /api/export/kml-networklink
   ```
   e.g. http://localhost:5000/api/export/kml-networklink (open this in a
   browser to download it, or `curl` it).
4. Import the downloaded file into Google Earth once, as "Map features".
   Google Earth re-fetches `/api/export/kml` every 5 minutes on its own —
   no need to re-export or re-import after that. If `PUBLIC_BASE_URL` was
   still `localhost` when you generated it, the file's own description
   field will contain a warning saying so.

The `monsoonmap_live.kml` file checked into this folder is a legacy,
hand-edited example kept for reference — prefer generating a fresh one from
`/api/export/kml-networklink` above so it always matches your current
`PUBLIC_BASE_URL`.

Note: Google Earth can only *display* this data — it can't submit new
reports back into MonsoonMap. New reports still go through the app's
own report form (POST /api/reports).
