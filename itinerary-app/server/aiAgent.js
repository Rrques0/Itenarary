// AI itinerary agent — a lighter-weight take on nirbar1985/ai-travel-agent's approach
// (LLM proposes a structured plan, tools enrich it with real-world data), but:
//   - runs against a local Ollama model instead of the OpenAI API (free, private, no key needed)
//   - "tools" are just the routing provider's geocode/route calls, not a full LangGraph agent loop
//   - no flight/hotel scraping (SerpAPI) or email sending (SendGrid) — out of scope for this app
//
// Swap OLLAMA_MODEL to whatever you have pulled locally (`ollama list`).

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

const SYSTEM_PROMPT = `You are a practical trip-itinerary planner. Given a destination, date range, \
interests, and pace, produce a day-by-day plan. Respond with ONLY valid JSON matching this shape, \
no prose outside the JSON:

{
  "destination": string,
  "days": [
    {
      "date": string,
      "theme": string,
      "stops": [
        { "name": string, "description": string, "suggestedTime": string, "durationMinutes": number }
      ]
    }
  ]
}

Rules:
- Use real, specific, well-known place names for the destination given (neighborhoods, landmarks, \
  museums, parks, restaurants) — not generic placeholders.
- 3-5 stops per day depending on pace ("relaxed" = 3, "moderate" = 4, "packed" = 5).
- Order stops in a sane geographic/logical sequence within each day.
- suggestedTime should be a rough clock time like "09:00".`;

async function ollamaChat(messages) {
  let res;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        format: 'json',
        stream: false,
        options: { temperature: 0.4 },
      }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach Ollama at ${OLLAMA_BASE_URL} (${err.message}). Start it with "ollama serve" and make sure model "${OLLAMA_MODEL}" is pulled.`
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Ollama request failed (${res.status}). Is Ollama running at ${OLLAMA_BASE_URL} with model "${OLLAMA_MODEL}" pulled? ${text}`
    );
  }
  const data = await res.json();
  return data.message?.content;
}

export async function planTrip({ destination, startDate, endDate, interests = '', pace = 'moderate' }) {
  if (!destination) throw new Error('destination is required');

  const userPrompt = `Plan a trip to ${destination}${
    startDate && endDate ? ` from ${startDate} to ${endDate}` : ''
  }. Pace: ${pace}. Interests: ${interests || 'general sightseeing, food, culture'}.`;

  const raw = await ollamaChat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]);

  let plan;
  try {
    plan = JSON.parse(raw);
  } catch {
    throw new Error('Model did not return valid JSON. Try a different OLLAMA_MODEL (needs decent instruction-following, e.g. llama3.1, qwen2.5, mistral).');
  }
  // The model isn't asked to echo these back — attach them directly so callers
  // (persistence, the Atlas view) always have them regardless of what the LLM emits.
  plan.startDate = startDate || null;
  plan.endDate = endDate || null;
  return plan;
}

// Enrich a plan's stops with real coordinates + inter-stop travel times using the routing provider.
// Best-effort: a stop that fails to geocode is left without coordinates rather than failing the whole plan.
export async function enrichPlan(plan, routingProvider, mode = 'walking') {
  for (const day of plan.days || []) {
    for (const stop of day.stops || []) {
      try {
        const query = `${stop.name}, ${plan.destination}`;
        const results = await routingProvider.geocode(query);
        if (results.length) {
          stop.lat = results[0].lat;
          stop.lon = results[0].lon;
          stop.geocodedName = results[0].name;
        }
      } catch (err) {
        stop.geocodeError = String(err.message || err);
      }
    }

    const located = (day.stops || []).filter((s) => s.lat != null && s.lon != null);
    if (located.length >= 2) {
      try {
        const route = await routingProvider.route(
          located.map((s) => ({ lat: s.lat, lon: s.lon, name: s.name })),
          mode
        );
        day.travel = route;
      } catch (err) {
        day.travelError = String(err.message || err);
      }
    }
  }
  return plan;
}
