const API_BASE = window.ITINERARY_API_BASE || 'http://localhost:3210';

const els = {
  tabs: document.querySelectorAll('.tab'),
  sections: {
    home: document.getElementById('home'),
    planForm: document.getElementById('planForm'),
    results: document.getElementById('results'),
    tripsList: document.getElementById('tripsList'),
    atlas: document.getElementById('atlas'),
  },
  magicDestination: document.getElementById('magicDestination'),
  magicBtn: document.getElementById('magicBtn'),
  magicBtnLabel: document.getElementById('magicBtnLabel'),
  magicError: document.getElementById('magicError'),
  dashCards: document.querySelectorAll('.dash-card'),
  destination: document.getElementById('destination'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  interests: document.getElementById('interests'),
  pace: document.getElementById('pace'),
  mode: document.getElementById('mode'),
  planBtn: document.getElementById('planBtn'),
  planBtnLabel: document.getElementById('planBtnLabel'),
  formError: document.getElementById('formError'),
  backBtn: document.getElementById('backBtn'),
  resultsTitle: document.getElementById('resultsTitle'),
  days: document.getElementById('days'),
  map: document.getElementById('map'),
  providerBadge: document.getElementById('providerBadge'),
  saveTripBtn: document.getElementById('saveTripBtn'),
  travelersField: document.getElementById('travelersField'),
  travelers: document.getElementById('travelers'),
  saveStatus: document.getElementById('saveStatus'),
  tripsListItems: document.getElementById('tripsListItems'),
  tripsEmpty: document.getElementById('tripsEmpty'),
  atlasStats: document.getElementById('atlasStats'),
};

let map, markersLayer;
let atlasMap, atlasMarkersLayer, atlasInitialized = false;
let currentPlan = null;      // the plan currently shown in #results
let currentTripId = null;    // set if the shown plan is an already-saved trip
let resultsReturnView = 'planForm';

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function showView(name) {
  for (const [key, el] of Object.entries(els.sections)) {
    el.hidden = key !== name;
  }
  els.tabs.forEach((t) => t.classList.toggle('on', t.dataset.view === name));
}

function setLoading(isLoading) {
  els.planBtn.disabled = isLoading;
  els.planBtnLabel.innerHTML = isLoading
    ? '<span class="spinner"></span>Generating…'
    : 'Generate itinerary';
}

function showError(msg) {
  els.formError.textContent = msg;
  els.formError.hidden = !msg;
}

function showSaveStatus(msg, isError = false) {
  els.saveStatus.textContent = msg;
  els.saveStatus.hidden = !msg;
  els.saveStatus.classList.toggle('error', isError);
}

async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error();
    els.providerBadge.textContent = 'server: connected';
  } catch {
    els.providerBadge.textContent = 'server: offline';
    els.providerBadge.style.color = 'var(--err)';
  }
}

function renderPlan(plan) {
  els.resultsTitle.textContent = plan.destination || 'Your trip';
  els.days.innerHTML = '';
  markersLayer.clearLayers();

  const allPoints = [];

  (plan.days || []).forEach((day, i) => {
    const card = document.createElement('div');
    card.className = 'day-card';

    const h3 = document.createElement('h3');
    h3.textContent = `Day ${i + 1}${day.date ? ` — ${day.date}` : ''}`;
    card.appendChild(h3);

    if (day.theme) {
      const theme = document.createElement('div');
      theme.className = 'day-theme';
      theme.textContent = day.theme;
      card.appendChild(theme);
    }

    (day.stops || []).forEach((stop) => {
      const row = document.createElement('div');
      row.className = 'stop';

      const time = document.createElement('div');
      time.className = 'stop-time';
      time.textContent = stop.suggestedTime || '';
      row.appendChild(time);

      const body = document.createElement('div');
      body.className = 'stop-body';
      const name = document.createElement('div');
      name.className = 'stop-name';
      name.textContent = stop.name;
      body.appendChild(name);
      if (stop.description) {
        const desc = document.createElement('div');
        desc.className = 'stop-desc';
        desc.textContent = stop.description;
        body.appendChild(desc);
      }
      if (stop.geocodeError) {
        const warn = document.createElement('div');
        warn.className = 'stop-warn';
        warn.textContent = `Couldn't locate this stop on the map: ${stop.geocodeError}`;
        body.appendChild(warn);
      }
      row.appendChild(body);
      card.appendChild(row);

      if (stop.lat != null && stop.lon != null) {
        allPoints.push([stop.lat, stop.lon]);
        L.marker([stop.lat, stop.lon]).addTo(markersLayer).bindPopup(`<b>${stop.name}</b><br>${stop.suggestedTime || ''}`);
      }
    });

    if (day.travel) {
      const travel = document.createElement('div');
      travel.className = 'day-travel';
      const km = (day.travel.totalDistanceMeters / 1000).toFixed(1);
      const mins = Math.round(day.travel.totalDurationSeconds / 60);
      travel.textContent = `~${km} km · ~${mins} min getting between today's stops`;
      card.appendChild(travel);
    } else if (day.travelError) {
      const travel = document.createElement('div');
      travel.className = 'day-travel';
      travel.textContent = `Route unavailable: ${day.travelError}`;
      card.appendChild(travel);
    }

    els.days.appendChild(card);
  });

  showView('results');
  // fitBounds needs the map container to already be visible/sized.
  requestAnimationFrame(() => {
    map.invalidateSize();
    if (allPoints.length) map.fitBounds(allPoints, { padding: [30, 30] });
  });
}

function openPlan(plan, { tripId = null, travelers = [], returnView = 'planForm' } = {}) {
  currentPlan = plan;
  currentTripId = tripId;
  resultsReturnView = returnView;
  els.travelers.value = travelers.join(', ');
  showSaveStatus('');
  // Already-saved trips don't need the save form again.
  els.travelersField.hidden = !!tripId;
  els.saveTripBtn.hidden = !!tripId;
  renderPlan(plan);
}

function defaultDateRange(days = 3) {
  const start = new Date();
  start.setDate(start.getDate() + 14);
  const end = new Date(start);
  end.setDate(end.getDate() + (days - 1));
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function requestItinerary(params, { returnView, onError, onStart, onDone }) {
  onStart?.();
  try {
    const res = await fetch(`${API_BASE}/api/itinerary/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    openPlan(data, { returnView });
  } catch (err) {
    onError?.(err.message || String(err));
  } finally {
    onDone?.();
  }
}

async function generateItinerary() {
  const destination = els.destination.value.trim();
  if (!destination) {
    showError('Enter a destination first.');
    return;
  }
  showError('');
  setLoading(true);
  await requestItinerary(
    {
      destination,
      startDate: els.startDate.value,
      endDate: els.endDate.value,
      interests: els.interests.value.trim(),
      pace: els.pace.value,
      mode: els.mode.value,
    },
    { returnView: 'planForm', onError: showError, onDone: () => setLoading(false) },
  );
}

function setMagicLoading(isLoading) {
  els.magicBtn.disabled = isLoading;
  els.magicBtnLabel.innerHTML = isLoading
    ? '<span class="spinner"></span>Working the magic…'
    : '✨ Surprise me with an itinerary';
}

function showMagicError(msg) {
  els.magicError.textContent = msg;
  els.magicError.hidden = !msg;
}

async function generateMagicItinerary() {
  const destination = els.magicDestination.value.trim();
  if (!destination) {
    showMagicError('Type a destination first.');
    return;
  }
  showMagicError('');
  const { startDate, endDate } = defaultDateRange();
  await requestItinerary(
    { destination, startDate, endDate, interests: 'food, sightseeing, culture', pace: 'moderate', mode: 'walking' },
    { returnView: 'home', onError: showMagicError, onStart: () => setMagicLoading(true), onDone: () => setMagicLoading(false) },
  );
}

async function saveCurrentTrip() {
  if (!currentPlan) return;
  const travelers = els.travelers.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  els.saveTripBtn.disabled = true;
  showSaveStatus('Saving…');
  try {
    const res = await fetch(`${API_BASE}/api/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: currentPlan, travelers }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
    currentTripId = data.id;
    showSaveStatus('Saved — visible in "My Trips" for the whole family.');
  } catch (err) {
    showSaveStatus(err.message || String(err), true);
  } finally {
    els.saveTripBtn.disabled = false;
  }
}

// --- My Trips ---

async function loadTripsList() {
  els.tripsListItems.innerHTML = '';
  try {
    const res = await fetch(`${API_BASE}/api/trips`);
    const trips = await res.json();
    if (!res.ok) throw new Error(trips.error || 'Failed to load trips');
    els.tripsEmpty.hidden = trips.length > 0;
    trips.forEach((trip) => els.tripsListItems.appendChild(renderTripCard(trip)));
  } catch (err) {
    els.tripsEmpty.hidden = false;
    els.tripsEmpty.textContent = `Couldn't load trips: ${err.message || err}`;
  }
}

function renderTripCard(trip) {
  const card = document.createElement('div');
  card.className = 'trip-card';

  const body = document.createElement('div');
  body.className = 'trip-card-body';

  const dest = document.createElement('div');
  dest.className = 'trip-card-dest';
  dest.textContent = trip.destination;
  body.appendChild(dest);

  const meta = document.createElement('div');
  meta.className = 'trip-card-meta';
  const dateStr = trip.startDate && trip.endDate ? `${trip.startDate} – ${trip.endDate}` : 'No dates set';
  meta.textContent = `${trip.dayCount} day${trip.dayCount === 1 ? '' : 's'} · ${dateStr}`;
  body.appendChild(meta);

  if (trip.travelers?.length) {
    const travelers = document.createElement('div');
    travelers.className = 'trip-card-travelers';
    travelers.textContent = `With: ${trip.travelers.join(', ')}`;
    body.appendChild(travelers);
  }

  card.appendChild(body);

  const del = document.createElement('button');
  del.className = 'trip-card-delete';
  del.textContent = '✕';
  del.title = 'Delete trip';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete the trip to ${trip.destination}?`)) return;
    await fetch(`${API_BASE}/api/trips/${trip.id}`, { method: 'DELETE' });
    loadTripsList();
  });
  card.appendChild(del);

  card.addEventListener('click', async () => {
    const res = await fetch(`${API_BASE}/api/trips/${trip.id}`);
    const data = await res.json();
    if (!res.ok) return;
    openPlan(data.plan, { tripId: data.id, travelers: data.travelers || [], returnView: 'tripsList' });
  });

  return card;
}

// --- Atlas ---

async function loadAtlas() {
  try {
    const res = await fetch(`${API_BASE}/api/atlas`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load atlas');

    els.atlasStats.innerHTML = '';
    const stats = [
      { num: data.tripCount, label: 'Trips' },
      { num: data.destinations.length, label: 'Destinations' },
      { num: data.places.length, label: 'Places' },
    ];
    stats.forEach((s) => {
      const el = document.createElement('div');
      el.className = 'atlas-stat';
      el.innerHTML = `<div class="atlas-stat-num">${s.num}</div><div class="atlas-stat-label">${s.label}</div>`;
      els.atlasStats.appendChild(el);
    });

    if (!atlasInitialized) {
      atlasMap = L.map('atlasMap', { zoomControl: true }).setView([20, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(atlasMap);
      atlasMarkersLayer = L.layerGroup().addTo(atlasMap);
      atlasInitialized = true;
    }
    requestAnimationFrame(() => atlasMap.invalidateSize());

    atlasMarkersLayer.clearLayers();
    const points = [];
    data.places.forEach((p) => {
      points.push([p.lat, p.lon]);
      L.marker([p.lat, p.lon]).addTo(atlasMarkersLayer).bindPopup(`<b>${p.name}</b><br>${p.destination}`);
    });
    if (points.length) atlasMap.fitBounds(points, { padding: [30, 30] });
  } catch (err) {
    els.atlasStats.innerHTML = `<p class="empty-state">Couldn't load atlas: ${err.message || err}</p>`;
  }
}

// --- Nav ---

els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    showView(view);
    if (view === 'tripsList') loadTripsList();
    if (view === 'atlas') loadAtlas();
  });
});

els.dashCards.forEach((card) => {
  card.addEventListener('click', () => {
    const view = card.dataset.view;
    showView(view);
    if (view === 'tripsList') loadTripsList();
    if (view === 'atlas') loadAtlas();
  });
});

els.planBtn.addEventListener('click', generateItinerary);
els.magicBtn.addEventListener('click', generateMagicItinerary);
els.magicDestination.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') generateMagicItinerary();
});
els.saveTripBtn.addEventListener('click', saveCurrentTrip);
els.backBtn.addEventListener('click', () => {
  showView(resultsReturnView);
  if (resultsReturnView === 'tripsList') loadTripsList();
});

initMap();
checkHealth();
showView('home');
