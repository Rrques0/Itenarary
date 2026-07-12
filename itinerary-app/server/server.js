import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { getRoutingProvider } from './routingProvider.js';
import { planTrip, enrichPlan } from './aiAgent.js';
import { listTrips, getTrip, saveTrip, deleteTrip, getAtlas } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

const routingProvider = getRoutingProvider();

app.get('/api/geocode', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'q query param is required' });
    const results = await routingProvider.geocode(q);
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

app.post('/api/route', async (req, res) => {
  try {
    const { points, mode } = req.body;
    if (!Array.isArray(points) || points.length < 2) {
      return res.status(400).json({ error: 'body needs points: [{lat, lon, name?}, ...] with at least 2 entries' });
    }
    const route = await routingProvider.route(points, mode);
    res.json(route);
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

app.post('/api/itinerary/ai', async (req, res) => {
  try {
    const { destination, startDate, endDate, interests, pace, mode } = req.body;
    const plan = await planTrip({ destination, startDate, endDate, interests, pace });
    await enrichPlan(plan, routingProvider, mode || 'walking');
    res.json(plan);
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

// --- Trips (family-shared, no login — see store.js for what "shared" means here) ---

app.get('/api/trips', async (_req, res) => {
  try {
    res.json(await listTrips());
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get('/api/trips/:id', async (req, res) => {
  try {
    const trip = await getTrip(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post('/api/trips', async (req, res) => {
  try {
    const { plan, travelers } = req.body;
    if (!plan || !plan.destination) {
      return res.status(400).json({ error: 'body needs a plan (the object returned from /api/itinerary/ai)' });
    }
    const trip = await saveTrip({ plan, travelers });
    res.status(201).json(trip);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.delete('/api/trips/:id', async (req, res) => {
  try {
    const found = await deleteTrip(req.params.id);
    if (!found) return res.status(404).json({ error: 'Trip not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Every place from every saved trip — the AdventureLog-style "everywhere we've been/planned" map.
app.get('/api/atlas', async (_req, res) => {
  try {
    res.json(await getAtlas());
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3210;
app.listen(PORT, () => {
  console.log(`Itinerary server listening on http://localhost:${PORT}`);
});
