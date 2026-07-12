// Trip persistence — a simple JSON-file store, not a database.
//
// Why not SQLite: this is a single-household app (a handful of family members,
// dozens of trips at most). A file store has zero native-binary/cross-platform build
// concerns (matters here since dev happens on Windows and it deploys to a Debian LXC
// container) and is trivial to back up — it's literally one file.
//
// There is no per-user auth. Every trip is visible to everyone who can reach this
// server, which in practice means everyone on your home network or connected via
// your VPN (WireGuard/Tailscale) — i.e. your family. That's the actual privacy
// boundary here, same as AdventureLog's "shared with household" model, just without
// a login screen. If you outgrow that later (want a trip visible to only some
// family members), that's a real auth system — a bigger project than this.

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');
const TRIPS_FILE = join(DATA_DIR, 'trips.json');

async function ensureStore() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(TRIPS_FILE)) await writeFile(TRIPS_FILE, '[]', 'utf-8');
}

async function readAll() {
  await ensureStore();
  const raw = await readFile(TRIPS_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeAll(trips) {
  await ensureStore();
  await writeFile(TRIPS_FILE, JSON.stringify(trips, null, 2), 'utf-8');
}

export async function listTrips() {
  const trips = await readAll();
  // Lightweight summaries for the list view — full plan loads on demand.
  return trips
    .map((t) => ({
      id: t.id,
      destination: t.plan.destination,
      startDate: t.plan.startDate || null,
      endDate: t.plan.endDate || null,
      travelers: t.travelers || [],
      savedAt: t.savedAt,
      dayCount: (t.plan.days || []).length,
      coverStop: (t.plan.days || []).flatMap((d) => d.stops || []).find((s) => s.lat != null) || null,
    }))
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

export async function getTrip(id) {
  const trips = await readAll();
  return trips.find((t) => t.id === id) || null;
}

export async function saveTrip({ plan, travelers = [] }) {
  const trips = await readAll();
  const trip = {
    id: randomUUID(),
    plan,
    travelers,
    savedAt: new Date().toISOString(),
  };
  trips.push(trip);
  await writeAll(trips);
  return trip;
}

export async function deleteTrip(id) {
  const trips = await readAll();
  const next = trips.filter((t) => t.id !== id);
  const changed = next.length !== trips.length;
  if (changed) await writeAll(next);
  return changed;
}

// Every stop from every saved trip, for the Atlas view — one map of everywhere
// the family has ever planned to go, AdventureLog-style.
export async function getAtlas() {
  const trips = await readAll();
  const places = [];
  for (const trip of trips) {
    for (const day of trip.plan.days || []) {
      for (const stop of day.stops || []) {
        if (stop.lat != null && stop.lon != null) {
          places.push({
            tripId: trip.id,
            destination: trip.plan.destination,
            name: stop.name,
            lat: stop.lat,
            lon: stop.lon,
          });
        }
      }
    }
  }
  const destinations = [...new Set(trips.map((t) => t.plan.destination))];
  return { places, destinations, tripCount: trips.length };
}
