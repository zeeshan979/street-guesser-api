import express from "express";

const app = express();
app.use(express.json());

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .trim();
}

app.post("/api/guess-street", async (req, res) => {
  try {
    const { postal_code, city_name, street_heard } = req.body || {};

    if (!postal_code || !city_name || !street_heard) {
      return res.status(400).json({
        error: "postal_code, city_name and street_heard are required"
      });
    }

    const apiKey = process.env.HERE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "HERE_API_KEY is missing"
      });
    }

    const heardNorm = norm(street_heard);
    const cityNorm = norm(city_name);
    const postalNorm = String(postal_code).trim();

    const query = `${street_heard}, ${postal_code} ${city_name}, Germany`;

    const url =
      `https://autosuggest.search.hereapi.com/v1/autosuggest` +
      `?q=${encodeURIComponent(query)}` +
      `&in=countryCode:DEU` +
      `&limit=8` +
      `&lang=de-DE` +
      `&apiKey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    const data = await response.json();

    const items = Array.isArray(data.items) ? data.items : [];

    const scored = items.map((item) => {
      const address = item.address || {};

      const street =
        address.street ||
        item.title ||
        address.label ||
        "";

      const postal = address.postalCode || "";
      const city =
        address.city ||
        address.district ||
        address.county ||
        address.state ||
        "";

      const streetNorm = norm(street);
      const cityCandidateNorm = norm(city);

      let score = 0;

      if (postal === postalNorm) score += 4;

      if (
        cityCandidateNorm.includes(cityNorm) ||
        cityNorm.includes(cityCandidateNorm)
      ) {
        score += 3;
      }

      if (streetNorm.includes(heardNorm)) score += 4;

      return {
        title: item.title || "",
        street,
        postal,
        city,
        score
      };
    }).sort((a, b) => b.score - a.score);

    const suggestions = scored
      .map((x) => x.street || x.title)
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .slice(0, 5);

    const best = scored[0];

    return res.json({
      matched: !!(best && best.score >= 4),
      best_street: best && best.score >= 4 ? best.street : null,
      confidence: best ? best.score : 0,
      suggestions,
      debug_query: query,
      debug_count: items.length,
      debug_items: scored.slice(0, 5)
    });
  } catch (error) {
    return res.status(500).json({
      error: "internal_error",
      details: String(error)
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
