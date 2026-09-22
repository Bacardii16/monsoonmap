// Fallback list for the search bar's "fly to a place" feature — used only
// if the backend's Nominatim geocoding proxy is unreachable or returns no
// results (see backend/routes/geocode.js for the real, live search).
//
// Coordinates below are approximate and meant for demo/fallback purposes
// only — not verified precise geocodes.
const places = [
  { name: "Erla Road, Vile Parle", lat: 19.1003, lng: 72.8396 },
  { name: "Andheri Station", lat: 19.1197, lng: 72.8464 },
  { name: "Bandra Kurla Complex", lat: 19.0662, lng: 72.8698 },
  { name: "Juhu Beach", lat: 19.0989, lng: 72.8265 },
  { name: "Colaba Causeway", lat: 18.9151, lng: 72.8258 },
  { name: "Worli Sea Face", lat: 19.0176, lng: 72.8168 },
  { name: "Marine Drive", lat: 18.9432, lng: 72.8235 },
  { name: "Dharavi", lat: 19.038, lng: 72.8538 },
  { name: "Hindmata", lat: 19.0176, lng: 72.8562 },
  { name: "Milan Subway", lat: 19.0596, lng: 72.8295 },
  { name: "Powai", lat: 19.1197, lng: 72.905 },
  { name: "Dadar TT", lat: 19.033, lng: 72.857 },
];

export default places;
