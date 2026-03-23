import express from "express";

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Umlaut-Normalisierung für toleranten Vergleich
// ---------------------------------------------------------------------------
function normalize(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Einfache Ähnlichkeitsbewertung (0 – 1) auf Basis gemeinsamer Bigrams
// ---------------------------------------------------------------------------
function bigrams(s) {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  const setA = bigrams(na);
  const setB = bigrams(nb);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;
  return (2 * intersection) / (setA.size + setB.size);
}

// ---------------------------------------------------------------------------
// Scoring: bewertet einen HERE-Treffer gegen die Eingabe
// ---------------------------------------------------------------------------
function scoreItem(item, input) {
  const addr = item.address || {};

  const streetSim = similarity(addr.street || item.title || "", input.street_heard);
  const cityMatch = normalize(addr.city || "") === normalize(input.city_name) ? 1 : 0;
  const postalMatch = (addr.postalCode || "") === String(input.postal_code) ? 1 : 0;

  // Gewichtung: Straße 60 %, PLZ 25 %, Stadt 15 %
  const score = streetSim * 0.6 + postalMatch * 0.25 + cityMatch * 0.15;

  return {
    street: addr.street || item.title || null,
    city: addr.city || null,
    postalCode: addr.postalCode || null,
    score: Math.round(score * 1000) / 1000,
    streetSimilarity: Math.round(streetSim * 1000) / 1000,
    cityMatch,
    postalMatch,
  };
}

// ---------------------------------------------------------------------------
// POST /api/guess-street
// ---------------------------------------------------------------------------
app.post("/api/guess-street", async (req, res) => {
  try {
    const { postal_code, city_name, street_heard } = req.body || {};

    if (!postal_code || !city_name || !street_heard) {
      return res.status(400).json({
        error: "postal_code, city_name and street_heard are required",
      });
    }

    const apiKey = process.env.HERE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "HERE_API_KEY is missing" });
    }

    // -----------------------------------------------------------------------
    // Structured / Qualified Query – beste Methode bei bekannter Struktur
    // -----------------------------------------------------------------------
    const qq =
      `street=${street_heard};` +
      `city=${city_name};` +
      `postalCode=${postal_code};` +
      `country=DEU`;

    const url =
      `https://geocode.search.hereapi.com/v1/geocode` +
      `?qq=${encodeURIComponent(qq)}` +
      `&types=street` +
      `&limit=10` +
      `&lang=de-DE` +
      `&apiKey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({
        error: "here_api_error",
        status: response.status,
        details: text,
      });
    }

    const data = await response.json();
    const rawItems = Array.isArray(data.items) ? data.items : [];

    // -----------------------------------------------------------------------
    // Bewertung & Sortierung
    // -----------------------------------------------------------------------
    const scored = rawItems
      .map((item) => scoreItem(item, { postal_code, city_name, street_heard }))
      .sort((a, b) => b.score - a.score);

    const topItems = scored.slice(0, 5);
    const best = topItems[0] || null;

    const matched = best !== null && best.score >= 0.4;
    const bestStreet = matched ? best.street : null;

    // Deduplizierte Vorschlagsliste (nur Straßennamen)
    const suggestions = topItems
      .map((s) => s.street)
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .slice(0, 5);

    // Confidence aus dem Score ableiten
    const confidence = best ? Math.round(best.score * 100) / 100 : 0;

    return res.json({
      matched,
      best_street: bestStreet,
      confidence,
      suggestions,
      debug_query: qq,
      debug_count: rawItems.length,
      debug_items: topItems,
    });
  } catch (error) {
    return res.status(500).json({
      error: "internal_error",
      details: String(error),
    });
  }
});

// ---------------------------------------------------------------------------
// Server starten
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
