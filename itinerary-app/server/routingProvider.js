// Routing/geocoding abstraction.
//
// Two implementations share the same interface:
//   geocode(query)               -> [{ name, lat, lon }]
//   route(points, mode)          -> { legs: [{ from, to, distanceMeters, durationSeconds, mode }], totalDurationSeconds, totalDistanceMeters }
//
// OsmRoutingProvider works out of the box with free public services (Nominatim + OSRM demo).
// OtpRoutingProvider talks to a self-hosted OpenTripPlanner instance's GraphQL API and is used
// automatically once OTP_BASE_URL is set — no other code changes needed to switch.

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OSRM_BASE = 'https://router.project-osrm.org';
const USER_AGENT = 'itinerary-app/1.0 (personal family project)';

class OsmRoutingProvider {
  async geocode(query) {
    const url = `${NOMINATIM_BASE}/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Nominatim geocode failed: ${res.status}`);
    const data = await res.json();
    return data.map((d) => ({
      name: d.display_name,
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
    }));
  }

  async route(points, mode = 'walking') {
    if (points.length < 2) throw new Error('route() needs at least 2 points');
    const profile = { walking: 'foot', driving: 'car', cycling: 'bike', transit: 'foot' }[mode] || 'foot';
    const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
    const url = `${OSRM_BASE}/route/v1/${profile}/${coords}?overview=false&steps=false`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`OSRM route failed: ${res.status}`);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error(`OSRM: ${data.code || 'no route'}`);
    const route = data.routes[0];
    const legs = route.legs.map((leg, i) => ({
      from: points[i].name || `${points[i].lat},${points[i].lon}`,
      to: points[i + 1].name || `${points[i + 1].lat},${points[i + 1].lon}`,
      distanceMeters: leg.distance,
      durationSeconds: leg.duration,
      mode,
    }));
    return {
      legs,
      totalDurationSeconds: route.duration,
      totalDistanceMeters: route.distance,
    };
  }
}

class OtpRoutingProvider {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async geocode(query) {
    // OTP's own geocoder endpoint (requires a geocoder backend configured, e.g. Photon/Pelias).
    // Falls back to Nominatim if OTP's geocoder isn't set up, since OTP doesn't mandate one.
    const url = `${this.baseUrl}/otp/geocode?query=${encodeURIComponent(query)}&autocomplete=false`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`OTP geocode failed: ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) throw new Error('empty');
      return data.map((d) => ({ name: d.description, lat: d.lat, lon: d.lng }));
    } catch {
      return new OsmRoutingProvider().geocode(query);
    }
  }

  async route(points, mode = 'transit') {
    if (points.length < 2) throw new Error('route() needs at least 2 points');
    const otpModeMap = { walking: 'WALK', driving: 'CAR', cycling: 'BICYCLE', transit: 'TRANSIT,WALK' };
    const legsOut = [];
    let totalDuration = 0;
    let totalDistance = 0;

    // OTP plans one origin->destination pair per call; chain legs for multi-stop itineraries.
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      const query = `
        query Plan($from: InputCoordinates!, $to: InputCoordinates!, $modes: [TransportMode!]) {
          plan(from: $from, to: $to, transportModes: $modes) {
            itineraries {
              duration
              legs { mode distance duration from { name } to { name } }
            }
          }
        }
      `;
      const modes = otpModeMap[mode].split(',').map((m) => ({ mode: m }));
      const variables = {
        from: { lat: from.lat, lon: from.lon },
        to: { lat: to.lat, lon: to.lon },
        modes,
      };
      const res = await fetch(`${this.baseUrl}/otp/routers/default/index/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new Error(`OTP plan failed: ${res.status}`);
      const { data, errors } = await res.json();
      if (errors?.length) throw new Error(`OTP: ${errors[0].message}`);
      const itin = data?.plan?.itineraries?.[0];
      if (!itin) throw new Error('OTP returned no itinerary for this leg');
      totalDuration += itin.duration;
      for (const leg of itin.legs) {
        totalDistance += leg.distance;
        legsOut.push({
          from: leg.from.name,
          to: leg.to.name,
          distanceMeters: leg.distance,
          durationSeconds: leg.duration,
          mode: leg.mode,
        });
      }
    }
    return { legs: legsOut, totalDurationSeconds: totalDuration, totalDistanceMeters: totalDistance };
  }
}

export function getRoutingProvider() {
  const otpUrl = process.env.OTP_BASE_URL;
  if (otpUrl) {
    console.log(`[routing] Using OpenTripPlanner at ${otpUrl}`);
    return new OtpRoutingProvider(otpUrl);
  }
  console.log('[routing] OTP_BASE_URL not set — using free OSM/OSRM fallback (set OTP_BASE_URL to switch to a self-hosted OpenTripPlanner instance)');
  return new OsmRoutingProvider();
}
