import express from "express";

const app = express();
app.use(express.json());

app.post("/api/guess-street", (req, res) => {
  const { postal_code, city_name, street_heard } = req.body || {};

  if (!postal_code || !city_name || !street_heard) {
    return res.status(400).json({
      error: "postal_code, city_name and street_heard are required"
    });
  }

  const normalised = String(street_heard).trim().toLowerCase();

  const streetsByLocation = {
    "63322_roedermark": [
      "Ober-Rodener Straße",
      "Dieburger Straße",
      "Frankfurter Straße",
      "Mainzer Straße",
      "Borsigstraße",
      "Senefelderstraße",
      "Albert-Einstein-Straße",
      "Paul-Ehrlich-Straße",
      "Gartenstraße",
      "Bahnhofstraße"
    ],
    "64291_darmstadt": [
      "Arheilger Straße",
      "Frankfurter Landstraße",
      "Messeler Straße",
      "Im Elsee",
      "Bartningstraße",
      "Röntgenstraße",
      "Jägertorstraße",
      "Waldstraße",
      "Maulbeerallee",
      "Mittelstraße"
    ]
  };

  const locationKey = `${postal_code}_${city_name}`
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

  const knownStreets = streetsByLocation[locationKey] || [];

  const suggestions = knownStreets.filter((street) =>
    street.toLowerCase().includes(normalised)
  );

  const matched = suggestions.length > 0;
  const best_street = matched ? suggestions[0] : null;
  const confidence = matched ? 0.9 : 0.0;

  return res.json({
    matched,
    best_street,
    confidence,
    suggestions
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
