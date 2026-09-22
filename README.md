# MonsoonMap

A crowdsourced waterlogging map for Mumbai. Built for the "Full Stack
Development and Design Principles in UI/UX" college project.

## Problem
During heavy monsoon rain, Google Maps shows travel time but not whether a
road is actually flooded. Commuters get stuck with no way to check road
conditions before leaving home.

## Solution
A live, color-coded map where people report and check road conditions in
real time:
- **Waterlogging** — location, water level (clear → minor → difficult →
  impassable), and an optional photo, submitted in under 10 seconds.
  Auto-expires after 6 hours since flood conditions change fast.
- **Potholes / road damage** — same flow, its own severity scale (small →
  medium → large → hazardous), rendered as a distinct circular marker on
  the map. Persists for 90 days since road damage doesn't disappear like
  floodwater does. Comes preloaded with a handful of known Mumbai
  pothole hotspots (see `backend/seed/potholes.js`) so the map isn't empty
  before anyone's submitted a report — these are illustrative placeholders,
  not a verified survey, so replace or edit them with real data when you
  have it.

## Project structure
```
monsoonmap/
├── backend/     Node.js + Express + MongoDB REST API
└── frontend/    React + Vite + Google Maps client
```

## Running it locally

**Backend** (Terminal 1):
```
cd backend
npm install
cp .env.example .env
npm run dev
npm run seed:potholes   # optional: preload known pothole hotspots
```

**Frontend** (Terminal 2):
```
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173`.

See `backend/README.md` for full API documentation and design notes, and
`exports/README.md` for exporting live reports (waterlogging + potholes) to
Google Earth as an auto-refreshing KML.

## Design system
- **Color**: cool rain-washed palette (`#F4F6F5` background, `#146C6A` brand
  teal) with a 4-step severity scale per report type (waterlogging:
  clear → minor → difficult → impassable in blue/green/red; potholes:
  small → medium → large → hazardous in brown tones) that always pairs
  color with a text label for accessibility.
- **Type**: Newsreader (serif) for headline/title moments, Inter for all UI
  and body text.
- **Layout**: mobile-first, map-dominant, with a bottom-sheet report form —
  built around the real use case of checking conditions on your phone before
  leaving the house.
