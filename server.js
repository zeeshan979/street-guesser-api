import express from "express";

const app = express();
app.use(express.json());

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

    const query = `${street_heard}, ${postal_code} ${city_name}, Germany`;

    const url =
      `https://autocomplete.search.hereapi.com/v1/autocomplete` +
      `?q=${encodeURIComponent(query)}` +
      `&in=countryCode:DEU` +
      `&limit=5` +
      `&apiKey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    const data = await response.json();

    const items = Array.isArray(data.items) ? data.items : [];

    const scored = items.map((item) => {
      const address = item.address || {};
      const street = address.street || item.title || "";
      const postal = address.postalCode || "";
      const city =
        address.city || address.district || address.county || "";

      let score = 0;

      if (postal === postal_code) score += 5;

      const cityA = String(city).toLowerCase();
      const cityB = String(city_name).toLowerCase();
      if (cityA.includes(cityB) || cityB.includes(cityA)) score += 5;

      const heard = String(street_heard).toLowerCase();
      const streetLc = String(street).toLowerCase();
      if (streetLc.includes(heard)) score += 3;

      return {
        street,
        postal,
        city,
        score
      };
    }).sort((a, b) => b.score - a.score);

    const suggestions = scored
      .map((x) => x.street)
      .filter(Boolean)
      .slice(0, 3);

    const best = scored[0];

    if (!best || !best.street) {
      return res.json({
        matched: false,
        best_street: null,
        confidence: 0,
        suggestions: []
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
