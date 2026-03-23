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

    const qq =
      `street=${street_heard};` +
      `city=${city_name};` +
      `postalCode=${postal_code};` +
      `country=DEU`;

    const url =
      `https://geocode.search.hereapi.com/v1/geocode` +
      `?qq=${encodeURIComponent(qq)}` +
      `&types=street` +
      `&limit=5` +
      `&lang=de-DE` +
      `&apiKey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    const data = await response.json();

    const items = Array.isArray(data.items) ? data.items : [];

    const suggestions = items
      .map((item) => item.address?.street || item.title || "")
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .slice(0, 5);

    const best = items[0];
    const bestStreet = best?.address?.street || best?.title || null;

    return res.json({
      matched: !!bestStreet,
      best_street: bestStreet,
      confidence: bestStreet ? 0.95 : 0,
      suggestions,
      debug_qq: qq,
      debug_count: items.length
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
