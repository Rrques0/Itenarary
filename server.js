const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const cache = new NodeCache({ stdTTL: 1800 }); // 30min cache

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,ne;q=0.8',
};

function resolveUrl(base, rel) {
  try { return new URL(rel, base).href; } catch { return rel; }
}
function clean(s) { return s ? s.replace(/\s+/g, ' ').trim() : ''; }

// ─── FLIGHT SEARCH ───────────────────────────────────────────────────────────
app.post('/api/flights', async (req, res) => {
  const { from, to, date, budget } = req.body;
  const key = `flights:${from}:${to}:${date}`;
  if (cache.has(key)) return res.json(cache.get(key));

  // Build search links for multiple providers
  const dateStr = date || new Date().toISOString().slice(0,10);
  const d = dateStr.replace(/-/g,'');

  const providers = [
    {
      name: 'Google Flights',
      url: `https://www.google.com/travel/flights/search?tfs=CBwQAhoeEgoyMDI1LTA1LTAxagcIARIDSkZLcgcIARIDSkZL`,
      searchUrl: `https://www.google.com/travel/flights?q=flights+from+${encodeURIComponent(from)}+to+${encodeURIComponent(to)}+on+${dateStr}`,
      logo: '✈️',
      tip: 'Best for price comparison & alerts',
      tipNe: 'मूल्य तुलना र सूचनाको लागि उत्तम',
    },
    {
      name: 'Skyscanner',
      searchUrl: `https://www.skyscanner.com/transport/flights/${from.slice(0,3).toLowerCase()}/${to.slice(0,3).toLowerCase()}/${d.slice(2)}/`,
      logo: '🔍',
      tip: 'Flexible dates = cheaper tickets',
      tipNe: 'लचिलो मिति = सस्तो टिकट',
    },
    {
      name: 'Kayak',
      searchUrl: `https://www.kayak.com/flights/${encodeURIComponent(from)}-${encodeURIComponent(to)}/${dateStr}?sort=price_a`,
      logo: '🛶',
      tip: 'Set price alerts for drops',
      tipNe: 'मूल्य घटाउन सतर्कता राख्नुहोस्',
    },
    {
      name: 'Momondo',
      searchUrl: `https://www.momondo.com/flight-search/${encodeURIComponent(from)}-${encodeURIComponent(to)}/${dateStr}`,
      logo: '🌍',
      tip: 'Finds hidden cheap routes',
      tipNe: 'लुकेका सस्ता मार्गहरू फेला पार्छ',
    },
    {
      name: 'Skiplagged',
      searchUrl: `https://skiplagged.com/flights/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${dateStr}`,
      logo: '💡',
      tip: 'Hidden-city tickets — huge savings',
      tipNe: 'लुकेको-शहर टिकट — ठूलो बचत',
    },
    {
      name: 'Secret Flying',
      searchUrl: `https://www.secretflying.com/`,
      logo: '🤫',
      tip: 'Error fares & flash deals',
      tipNe: 'त्रुटि भाडा र फ्ल्यास सौदाहरू',
    },
  ];

  // Budget hacks based on price
  const budgetHacks = budget <= 600 ? [
    { en: 'Book Tuesday/Wednesday — typically 20-30% cheaper', ne: 'मंगलबार/बुधबार बुक गर्नुहोस् — सामान्यतः २०-३०% सस्तो' },
    { en: 'Use incognito mode — prices can rise after repeated searches', ne: 'इन्कोग्निटो मोड प्रयोग गर्नुहोस् — बारम्बार खोजेपछि मूल्य बढ्न सक्छ' },
    { en: 'Check nearby airports — sometimes 50% cheaper', ne: 'नजिकका विमानस्थलहरू जाँच्नुहोस् — कहिलेकाहीं ५०% सस्तो' },
    { en: 'Set price alert on Google Flights — wait for a drop', ne: 'Google Flights मा मूल्य सतर्कता सेट गर्नुहोस् — घटाउनको लागि पर्खनुहोस्' },
    { en: 'One-way tickets can beat round-trip on budget carriers', ne: 'एकतर्फी टिकट बजेट वाहकहरूमा राउन्ड-ट्रिप भन्दा सस्तो हुन सक्छ' },
  ] : [
    { en: 'Business class deals on Google Flights "Explore" tab', ne: 'Google Flights "Explore" ट्याबमा व्यापार वर्ग सौदाहरू' },
    { en: 'Use points — credit card miles can cut cost 60-80%', ne: 'पोइन्टहरू प्रयोग गर्नुहोस् — क्रेडिट कार्ड माइलले ६०-८०% लागत घटाउन सक्छ' },
  ];

  const result = { providers, budgetHacks, from, to, date: dateStr };
  cache.set(key, result);
  res.json(result);
});

// ─── TRAIN SEARCH ────────────────────────────────────────────────────────────
app.post('/api/trains', async (req, res) => {
  const { from, to, date, country } = req.body;
  const key = `trains:${from}:${to}:${country}`;
  if (cache.has(key)) return res.json(cache.get(key));

  const providers = [
    { name: 'Rome2Rio', url: `https://www.rome2rio.com/s/${encodeURIComponent(from)}/${encodeURIComponent(to)}`, logo: '🗺️', tip: 'Best multi-modal route finder', tipNe: 'बहु-मोडल मार्ग खोजकर्ता' },
    { name: 'Trainline', url: `https://www.thetrainline.com/`, logo: '🚂', tip: 'Europe & UK trains', tipNe: 'युरोप र UK रेलहरू' },
    { name: 'Omio', url: `https://www.omio.com/`, logo: '🚆', tip: 'Trains + buses across 37 countries', tipNe: '३७ देशमा रेल + बस' },
    { name: 'Seat61', url: `https://www.seat61.com/`, logo: '🎫', tip: 'Expert train travel guides worldwide', tipNe: 'विश्वव्यापी ट्रेन यात्रा विशेषज्ञ मार्गदर्शिका' },
    { name: 'Nepal Railway', url: `https://www.railway.gov.np/`, logo: '🇳🇵', tip: 'Nepal rail — Janakpur line', tipNe: 'नेपाल रेल — जनकपुर लाइन' },
    { name: 'IndianRail (IRCTC)', url: `https://www.irctc.co.in/nget/train-search`, logo: '🇮🇳', tip: 'India trains — often used Nepal border routes', tipNe: 'भारत रेल — नेपाल सिमाना मार्गहरूमा प्रयोग' },
  ];

  const busOptions = [
    { name: 'Greenline Bus (Nepal)', url: 'https://greenlinenepal.com/', logo: '🚌', tip: 'Kathmandu ↔ Pokhara + India border', tipNe: 'काठमाडौं ↔ पोखरा + भारत सीमा' },
    { name: 'Busbud', url: `https://www.busbud.com/en/bus-${encodeURIComponent(from)}-${encodeURIComponent(to)}`, logo: '🚍', tip: 'Global bus search', tipNe: 'विश्वव्यापी बस खोज' },
  ];

  const result = { providers, busOptions, from, to };
  cache.set(key, result);
  res.json(result);
});

// ─── FOOD SCRAPER ────────────────────────────────────────────────────────────
app.post('/api/food', async (req, res) => {
  const { location, budget } = req.body;
  const key = `food:${location}:${budget}`;
  if (cache.has(key)) return res.json(cache.get(key));

  // Curated Nepali food database + search links
  const nepaliDishes = [
    { name: 'Dal Bhat', ne: 'दाल भात', desc: 'The national dish — lentil soup with rice, veggies, pickles', ne_desc: 'राष्ट्रिय खाना — दाल, भात, तरकारी, अचार', type: 'meal', budget: 'low', emoji: '🍛', tips: 'Unlimited refills in Nepal — "dal bhat power, 24 hour"', tipNe: 'नेपालमा असीमित रिफिल — "दाल भात पावर, २४ घण्टा"' },
    { name: 'Momo', ne: 'मम:', desc: 'Steamed or fried dumplings — Nepal\'s street food king', ne_desc: 'भाफमा पकाएको वा भुटेको पकौडा — नेपालको स्ट्रिट फुड किंग', type: 'snack', budget: 'low', emoji: '🥟', tips: 'Look for tiny local shops — best quality, cheapest price', tipNe: 'साना स्थानीय पसलहरू खोज्नुहोस् — उत्तम गुणस्तर, सस्तो मूल्य' },
    { name: 'Newari Khaja Set', ne: 'नेवारी खाजा सेट', desc: 'Beaten rice, buffalo meat, eggs, beans, homemade liquor set', ne_desc: 'चिउरा, भैंसीको मासु, अण्डा, सिमी, रक्सी सेट', type: 'cultural', budget: 'low', emoji: '🥘', tips: 'Try in Patan or Bhaktapur for authentic experience', tipNe: 'प्रामाणिक अनुभवको लागि पाटन वा भक्तपुरमा जानुहोस्' },
    { name: 'Thakali Khana', ne: 'थकाली खाना', desc: 'Mustang region specialty — rich ghee-based set meal', ne_desc: 'मुस्ताङ क्षेत्रको विशेषता — घ्यूमा आधारित सेट खाना', type: 'meal', budget: 'mid', emoji: '🍲', tips: 'More expensive but an incredible cultural experience', tipNe: 'महँगो तर अविश्वसनीय सांस्कृतिक अनुभव' },
    { name: 'Sel Roti', ne: 'सेल रोटी', desc: 'Crispy rice donut — festival & street food', ne_desc: 'कुरकुरे चामलको रोटी — उत्सव र स्ट्रिट फुड', type: 'snack', budget: 'low', emoji: '🍩', tips: 'Best during Dashain/Tihar festivals', tipNe: 'दशैं/तिहार उत्सवमा उत्तम' },
    { name: 'Dhido', ne: 'ढिंडो', desc: 'Traditional buckwheat/millet porridge — hearty mountain food', ne_desc: 'परम्परागत फापर/कोदोको ढिंडो — पहाडी खाना', type: 'meal', budget: 'low', emoji: '🫕', tips: 'Order with gundruk (fermented greens) for the full experience', tipNe: 'पूर्ण अनुभवको लागि गुन्द्रुकसहित अर्डर गर्नुहोस्' },
    { name: 'Chiya', ne: 'चिया', desc: 'Nepali milk tea — spiced, sweet, essential', ne_desc: 'नेपाली दूध चिया — मसालेदार, मीठो, आवश्यक', type: 'drink', budget: 'low', emoji: '☕', tips: 'Cost: 10-30 NPR ($0.08-$0.22) — the cheapest joy in Nepal', tipNe: 'मूल्य: १०-३० रुपैयाँ — नेपालमा सबैभन्दा सस्तो आनन्द' },
    { name: 'Tongba', ne: 'तोङबा', desc: 'Limbu millet beer in a bamboo vessel — Eastern Nepal specialty', ne_desc: 'बाँसको भाँडामा लिम्बू कोदो बियर — पूर्वी नेपालको विशेषता', type: 'drink', budget: 'mid', emoji: '🍺', tips: 'Found in Ilam, Taplejung, and Kathmandu hill bars', tipNe: 'इलाम, ताप्लेजुङ र काठमाडौं हिल बारहरूमा पाइन्छ' },
    { name: 'Yomari', ne: 'योमरी', desc: 'Sweet rice flour dumpling with molasses filling — Newari delicacy', ne_desc: 'गुडको भरिएको चामलको पिठोको पकौडा — नेवारी स्वादिलो', type: 'dessert', budget: 'low', emoji: '🍡', tips: 'Seasonal — made during Yomari Punhi festival (Nov/Dec)', tipNe: 'मौसमी — योमरी पुन्ही उत्सवमा बनाइन्छ (नोभेम्बर/डिसेम्बर)' },
    { name: 'Kwati', ne: 'क्वाँटी', desc: 'Nine-bean soup — nutritious, warming, festival dish', ne_desc: 'नौ प्रकारका सिमीको झोल — पौष्टिक, तातो, उत्सव खाना', type: 'meal', budget: 'low', emoji: '🫘', tips: 'Made during Janai Purnima festival', tipNe: 'जनै पूर्णिमा उत्सवमा बनाइन्छ' },
  ];

  const searchLinks = [
    { name: 'Yelp', url: `https://www.yelp.com/search?find_desc=nepali+restaurant&find_loc=${encodeURIComponent(location)}`, logo: '⭐' },
    { name: 'Google Maps', url: `https://maps.google.com/?q=nepali+restaurant+near+${encodeURIComponent(location)}`, logo: '📍' },
    { name: 'TripAdvisor', url: `https://www.tripadvisor.com/Search?q=nepali+food+${encodeURIComponent(location)}`, logo: '🦉' },
    { name: 'HappyCow (Veg)', url: `https://www.happycow.net/searchmap?s=${encodeURIComponent(location)}&vegan=true&vegetarian=true`, logo: '🥦' },
    { name: 'Zomato', url: `https://www.zomato.com/search?q=nepali+${encodeURIComponent(location)}`, logo: '🍽️' },
  ];

  const budgetMealPlan = {
    low: { daily: '$5-15', ne: 'प्रति दिन $५-१५', plan: ['Chiya + Sel Roti breakfast ($1)', 'Dal Bhat lunch ($3-5)', 'Momo dinner ($2-4)', 'Chiya anytime ($0.15)'] },
    mid: { daily: '$15-40', ne: 'प्रति दिन $१५-४०', plan: ['Hotel breakfast + Newari Khaja ($8)', 'Thakali Khana set ($10-15)', 'Restaurant dinner + Tongba ($15-20)'] },
    high: { daily: '$40-100+', ne: 'प्रति दिन $४०-१००+', plan: ['Dwarika\'s Hotel breakfast ($20)', 'Fine dining Nepali tasting menu ($40)', 'Rooftop dinner with mountain view ($40+)'] },
  };

  const tier = budget <= 20 ? 'low' : budget <= 60 ? 'mid' : 'high';
  const result = { nepaliDishes, searchLinks, budgetMealPlan, activeTier: tier, location };
  cache.set(key, result);
  res.json(result);
});

// ─── EVENTS SCRAPER ──────────────────────────────────────────────────────────
app.post('/api/events', async (req, res) => {
  const { location, month } = req.body;
  const key = `events:${location}:${month}`;
  if (cache.has(key)) return res.json(cache.get(key));

  // Nepal festival calendar
  const festivals = [
    { name: 'Dashain', ne: 'दशैं', month: 10, desc: 'Biggest Hindu festival — 15 days of family, blessings, kites', ne_desc: 'सबैभन्दा ठूलो हिन्दू उत्सव — परिवार, आशीर्वाद, चंगा', free: true, type: 'cultural' },
    { name: 'Tihar', ne: 'तिहार', month: 11, desc: 'Festival of Lights — dogs, cows, brothers worshipped over 5 days', ne_desc: 'दीपावली — ५ दिनमा कुकुर, गाई, भाइ पूजा', free: true, type: 'cultural' },
    { name: 'Holi', ne: 'होली', month: 3, desc: 'Festival of Colors — streets erupt in powder and water balloons', ne_desc: 'रंगको उत्सव — सडकहरू रंग र पानी बलुनले भरिन्छन्', free: true, type: 'cultural' },
    { name: 'Indra Jatra', ne: 'इन्द्र जात्रा', month: 9, desc: 'Kathmandu ancient festival — Living Goddess Kumari procession', ne_desc: 'काठमाडौंको प्राचीन उत्सव — कुमारी जुलुस', free: true, type: 'cultural' },
    { name: 'Buddha Jayanti', ne: 'बुद्ध जयन्ती', month: 5, desc: 'Birth of Buddha — Lumbini pilgrimage, lanterns, ceremonies', ne_desc: 'बुद्धको जन्म — लुम्बिनी तीर्थ, बत्ती, समारोह', free: true, type: 'spiritual' },
    { name: 'Teej', ne: 'तीज', month: 8, desc: 'Women\'s festival — fasting, red saris, singing & dancing', ne_desc: 'महिलाको उत्सव — व्रत, रातो साडी, गीत र नृत्य', free: true, type: 'cultural' },
    { name: 'Losar', ne: 'लोसार', month: 2, desc: 'Tibetan/Sherpa New Year — Boudhanath stupa celebrations', ne_desc: 'तिब्बती/शेर्पा नयाँ वर्ष — बौद्धनाथ स्तुप उत्सव', free: true, type: 'cultural' },
    { name: 'Maha Shivaratri', ne: 'महाशिवरात्री', month: 2, desc: 'Pashupatinath temple mass gathering — sadhus, fire, devotion', ne_desc: 'पशुपतिनाथ मन्दिर — साधु, आगो, भक्ति', free: true, type: 'spiritual' },
    { name: 'Everest Marathon', ne: 'एभरेस्ट म्याराथन', month: 5, desc: 'World\'s highest marathon from EBC to Namche Bazar', ne_desc: 'विश्वको उच्चतम म्याराथन', free: false, type: 'adventure' },
    { name: 'Mountain Film Festival', ne: 'माउन्टेन फिल्म फेस्टिभल', month: 11, desc: 'Kathmandu international mountain cinema event', ne_desc: 'काठमाडौं अन्तर्राष्ट्रिय पहाड सिनेमा', free: false, type: 'arts' },
  ];

  const searchLinks = [
    { name: 'Eventbrite', url: `https://www.eventbrite.com/d/${encodeURIComponent(location)}/events/`, logo: '🎟️' },
    { name: 'Visit Nepal (official)', url: 'https://www.welcomenepal.com/events/', logo: '🇳🇵' },
    { name: 'Facebook Events', url: `https://www.facebook.com/events/search/?q=${encodeURIComponent(location)}`, logo: '📅' },
    { name: 'Meetup', url: `https://www.meetup.com/find/?location=${encodeURIComponent(location)}`, logo: '🤝' },
    { name: 'TripAdvisor Experiences', url: `https://www.tripadvisor.com/Attractions-g293890-Activities-Nepal.html`, logo: '🎯' },
    { name: 'Klook', url: `https://www.klook.com/en-US/search/?query=${encodeURIComponent(location)}`, logo: '🎪' },
  ];

  const result = { festivals, searchLinks, location };
  cache.set(key, result);
  res.json(result);
});

// ─── ACCOMMODATION SEARCH ─────────────────────────────────────────────────────
app.post('/api/stays', async (req, res) => {
  const { location, budget, checkin, checkout, guests } = req.body;
  const key = `stays:${location}:${budget}`;
  if (cache.has(key)) return res.json(cache.get(key));

  const providers = [
    { name: 'Booking.com', url: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(location)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests||1}&price=1;${budget*100}`, logo: '🏨', tip: 'Free cancellation filters save you risk', tipNe: 'निःशुल्क रद्दीकरण फिल्टरले जोखिम बचाउँछ' },
    { name: 'Hostelworld', url: `https://www.hostelworld.com/search?search_keywords=${encodeURIComponent(location)}&b_checkin_date=${checkin}&b_checkout_date=${checkout}`, logo: '🛏️', tip: 'Dorms from $4/night — budget king', tipNe: 'डर्म $४/रात देखि — बजेट किंग' },
    { name: 'Airbnb', url: `https://www.airbnb.com/s/${encodeURIComponent(location)}/homes?checkin=${checkin}&checkout=${checkout}`, logo: '🏠', tip: 'Entire apartments = cheaper for families of 4+', tipNe: 'पूरा अपार्टमेन्ट = ४+ परिवारको लागि सस्तो' },
    { name: 'Agoda', url: `https://www.agoda.com/search?city=${encodeURIComponent(location)}&checkIn=${checkin}&checkOut=${checkout}`, logo: '🌏', tip: 'Best deals for Asia & Nepal hotels', tipNe: 'एशिया र नेपाल होटलको लागि उत्तम सौदा' },
    { name: 'Couchsurfing', url: 'https://www.couchsurfing.com/', logo: '🛋️', tip: 'Free stays with locals — cultural immersion', tipNe: 'स्थानीयसँग निःशुल्क बास — सांस्कृतिक विसर्जन' },
    { name: 'WWOOF Nepal', url: 'https://wwoof.net/', logo: '🌱', tip: 'Work on organic farms, stay free', tipNe: 'जैविक फार्ममा काम गर्नुहोस्, निःशुल्क बास' },
  ];

  const teahouses = {
    title: 'Nepal Teahouse Trekking',
    titleNe: 'नेपाल चियाघर ट्रेकिङ',
    desc: 'Along EBC, Annapurna, and Langtang routes — teahouses provide bed + dinner + breakfast for $10-25/night. No booking needed off-season.',
    descNe: 'EBC, अन्नपूर्ण र लाङटाङ मार्गमा — चियाघरहरूले $१०-२५/रात मा ओछ्यान + खाना दिन्छन्।',
  };

  const result = { providers, teahouses, location, budget };
  cache.set(key, result);
  res.json(result);
});

// ─── GENERAL SCRAPE (for custom URLs) ────────────────────────────────────────
app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  const key = `scrape:${url}`;
  if (cache.has(key)) return res.json(cache.get(key));

  try {
    const { data: html } = await axios.get(url, { timeout: 12000, headers: HEADERS, maxRedirects: 5 });
    const $ = cheerio.load(html);
    const pageTitle = clean($('title').text());
    const items = [];
    const seen = new Set();

    $('a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      if (!href || href === '#' || href.startsWith('javascript')) return;
      const resolvedHref = resolveUrl(url, href);
      if (seen.has(resolvedHref)) return;
      seen.add(resolvedHref);

      let img = null;
      const $img = $el.find('img').first();
      if ($img.length) img = $img.attr('src') || $img.attr('data-src');
      if (!img) {
        const $pi = $el.closest('article,div,li,section').find('img').first();
        if ($pi.length) img = $pi.attr('src') || $pi.attr('data-src');
      }
      if (img) img = resolveUrl(url, img);

      const title = clean($el.attr('title') || $el.find('h1,h2,h3,h4,strong,.title').first().text() || $el.text()).slice(0,120);
      if (!title || title.length < 3) return;

      const $c = $el.closest('article,.entry,.item,.card,.post,li');
      const desc = $c.length ? clean($c.find('p,.desc,.description,.excerpt').first().text()).slice(0,200) : '';

      items.push({ title, href: resolvedHref, img, desc });
    });

    const result = { pageTitle, items: items.slice(0,50) };
    cache.set(key, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BUDGET CALCULATOR ───────────────────────────────────────────────────────
app.post('/api/budget', async (req, res) => {
  const { total, days, travelers, destination } = req.body;
  const perPersonPerDay = total / travelers / days;

  const breakdown = {
    accommodation: Math.round(perPersonPerDay * 0.30),
    food: Math.round(perPersonPerDay * 0.25),
    transport: Math.round(perPersonPerDay * 0.20),
    activities: Math.round(perPersonPerDay * 0.15),
    emergency: Math.round(perPersonPerDay * 0.10),
  };

  const tips = [];
  if (perPersonPerDay < 30) {
    tips.push({ en: '🏆 Budget traveler mode! Nepal is perfect for you — $25/day is very comfortable', ne: '🏆 बजेट यात्री मोड! नेपाल तपाईंको लागि उत्तम — $२५/दिन धेरै आरामदायक छ' });
    tips.push({ en: '🛏️ Stay in hostels or teahouses ($4-15/night)', ne: '🛏️ होस्टेल वा चियाघरमा बस्नुहोस् ($४-१५/रात)' });
    tips.push({ en: '🍛 Eat dal bhat — cheapest & most filling meal in Nepal', ne: '🍛 दाल भात खानुहोस् — नेपालमा सबैभन्दा सस्तो र भरिलो खाना' });
    tips.push({ en: '🚌 Take local buses — 10x cheaper than tourist coaches', ne: '🚌 स्थानीय बस लिनुहोस् — पर्यटक बसभन्दा १० गुणा सस्तो' });
  } else if (perPersonPerDay < 80) {
    tips.push({ en: '✨ Mid-range comfort — mix of guesthouses and local restaurants', ne: '✨ मध्यम-श्रेणी आराम — गेस्टहाउस र स्थानीय रेस्टुरेन्टको मिश्रण' });
    tips.push({ en: '🏨 3-star hotels run $25-50/night in Kathmandu', ne: '🏨 काठमाडौंमा ३-तारे होटल $२५-५०/रात' });
  } else {
    tips.push({ en: '💎 Luxury tier — Dwarika\'s, Hyatt, and boutique lodges await', ne: '💎 लक्जरी स्तर — ड्वारिका, हायट र बुटिक लज पर्खिरहेका छन्' });
    tips.push({ en: '🚁 Helicopter tours to Everest Base Camp from $1,200', ne: '🚁 एभरेस्ट बेस क्याम्पमा हेलिकप्टर भ्रमण $१,२०० देखि' });
  }

  res.json({ perPersonPerDay: Math.round(perPersonPerDay), breakdown, tips, total, days, travelers });
});

const PORT = process.env.PORT || 3848;
app.listen(PORT, () => console.log(`\n🏔️  Yatra Planner running at http://localhost:${PORT}\n`));
