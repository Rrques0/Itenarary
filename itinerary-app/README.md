# Itinerary App

A trip itinerary planner: describe a destination and trip style, get a day-by-day plan with real
locations plotted on a map and travel times between stops.

Lives alongside the existing `index.html` (CHROMATIC, a music player UI) at the repo root —
this is a separate, unrelated project in its own `itinerary-app/` folder.

## How it's built

- **Frontend** (`index.html`, `app.js`, `styles.css`) — plain HTML/CSS/JS, no framework, using
  [Leaflet](https://leafletjs.com/) for the map. Matches the dependency-light style of the rest of
  the repo.
- **Backend** (`server/`) — small Express API with three jobs:
  1. **AI itinerary generation** (`aiAgent.js`) — asks a local [Ollama](https://ollama.com) model
     for a structured day-by-day plan, then enriches it with real coordinates and travel times.
     This is a lighter version of what
     [nirbar1985/ai-travel-agent](https://github.com/nirbar1985/ai-travel-agent) does (an LLM
     proposing a plan, then tools grounding it in real data) — but running against your own local
     model instead of the OpenAI API, and without the flight/hotel scraping (SerpAPI) or email
     sending (SendGrid) pieces, which need paid API keys and weren't in scope here. **Deliberately
     kept on local Ollama rather than the Claude API** — no per-request cost, no key to manage, data
     never leaves the house. Swapping to Claude later for better reasoning/live booking data (see
     anuraag2601/ai-travel-planner's Claude+Amadeus pattern) is a contained change to `aiAgent.js`.
  2. **Routing/geocoding** (`routingProvider.js`) — an abstraction with two implementations:
     - `OsmRoutingProvider` — free public Nominatim (geocoding) + OSRM (routing). Works with zero
       setup. This is what's active by default.
     - `OtpRoutingProvider` — talks to a self-hosted [OpenTripPlanner](https://www.opentripplanner.org/)
       instance's GraphQL API for real multi-modal transit routing. **Not active by default** —
       OTP needs region-specific OpenStreetMap + GTFS transit data and its own server, which is a
       separate infrastructure project. The code is written and ready: set `OTP_BASE_URL` in
       `server/.env` and the app switches to it automatically, no other changes needed.
  3. **Trip persistence + family sharing** (`store.js`) — a JSON-file store (no database) holding
     saved trips. There's no login: anyone who can reach the server (your home network, or your
     WireGuard/Tailscale VPN) sees and can save/delete trips — the network boundary *is* the
     privacy boundary, same idea as AdventureLog's household-shared model, minus the auth screen.
     Two views built on top of this, both AdventureLog-inspired:
     - **My Trips** — every trip anyone in the family has saved, with who's coming on each one.
     - **Atlas** — every place from every saved trip, plotted on one map — "everywhere we've
       planned to go," not just the current trip.

## Hosting

Runs on the Proxmox homelab, not a cloud PaaS (Railway, etc.) — deliberately. The AI layer depends
on local Ollama, which a remote host can't reach; hosting elsewhere means paying for cloud LLM
inference instead, which defeats the point. It also sits naturally alongside the other family
services already running there, on the same network/VPN access already set up for those.

## Running it

```bash
cd server
cp .env.example .env
npm install
npm start
```

Then open `index.html` in a browser (or serve it with any static file server). It talks to the
API at `http://localhost:3210` by default — override with `window.ITINERARY_API_BASE` before
`app.js` loads if you're hosting the API elsewhere.

### AI generation requires Ollama running locally
```bash
ollama pull llama3.1   # or whatever instruction-following model you prefer
ollama serve           # if not already running as a service
```
Set `OLLAMA_MODEL` in `server/.env` to match whatever you've pulled.

### Switching to OpenTripPlanner later
Once you have an OTP instance running for a specific region (needs an OSM extract + GTFS feed for
that area, plus a graph build — see [OTP's docs](https://docs.opentripplanner.org/)):
```
# server/.env
OTP_BASE_URL=http://your-otp-host:8080
```
That's it — `routingProvider.js` picks it up automatically.

### Data lives in `server/data/trips.json`
Back this file up — it's every trip the family has saved. Git-ignored on purpose (it's family
data, not something that belongs in a public repo).

## API

- `GET /api/health`
- `GET /api/geocode?q=<place>`
- `POST /api/route` — `{ points: [{lat, lon, name?}, ...], mode }`
- `POST /api/itinerary/ai` — `{ destination, startDate?, endDate?, interests?, pace?, mode? }`
- `GET /api/trips` — list saved trips (summaries)
- `GET /api/trips/:id` — full saved trip
- `POST /api/trips` — save a trip — `{ plan, travelers?: string[] }`
- `DELETE /api/trips/:id`
- `GET /api/atlas` — every place from every saved trip, for the Atlas map
