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

    const query = `${street_heard} ${postal_code} ${city_name} Germany`;

    const url =
      `https://autocomplete.search.hereapi.com/v1/autocomplete` +
      `?q=${encodeURIComponent(query)}` +
      `&in=countryCode:DEU` +
      `&limit=8` +
      `&apiKey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    const data = await response.json();

    const items = Array.isArray(data.items) ? data.items : [];

    const scored = items.map((item) => {
      const address = item.address || {};

      const streetCandidate =
        address.street ||
        item.title ||
        address.label ||
        "";

      const postalCandidate = address.postalCode || "";
      const cityCandidate =
        address.city ||
        address.district ||
        address.county ||
        address.state ||
        "";

      const streetNorm = norm(streetCandidate);
      const cityCandidateNorm = norm(cityCandidate);

      let score = 0;

      if (postalCandidate === postalNorm) score += 4;

      if (
        cityCandidateNorm.includes(cityNorm) ||
        cityNorm.includes(cityCandidateNorm)
      ) {
        score += 3;
      }

      if (streetNorm.includes(heardNorm)) score += 4;

      return {
        raw: item,
        street: streetCandidate,
        postal: postalCandidate,
        city: cityCandidate,
        score
      };
    }).sort((a, b) => b.score - a.score);

    const suggestions = scored
      .map((x) => x.street)
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .slice(0, 3);

    const best = scored[0];

    if (!best || !best.street || best.score < 4) {
      return res.json({
        matched: false,
        best_street: null,
        confidence: 0,
        suggestions
      });
    }

    return res.json({
      matched: true,
      best_street: best.street,
      confidence: best.score >= 8 ? 0.95 : 0.75,
      suggestions
    });
  } catch (error) {
    return res.status(500).json({
      error: "internal_error"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
