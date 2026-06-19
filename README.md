# ShelfLife

ShelfLife is a full-stack web application designed to help users reduce food waste and manage groceries more efficiently.

## Author

James Hicks and Alexandra Descoteaux

## Project Objective

Help users track pantry items, monitor expiration dates, get recipe ideas from ingredients they already own, and keep meal-prepped food organized so less food is wasted.

## Screenshot

## Instructions To Build

1. Install dependencies with `npm install`.
2. Set `MONGODB_URI` in a local `.env` file (it is git-ignored, so no
   credentials are committed).
3. Seed sample data with `npm run seed`.
4. Start the app with `npm start`.
5. Open `http://localhost:3000` in a browser.

## Pages

- Pantry dashboard: `public/index.html` — inventory table, add-item form, and
  waste/savings insights charts.
- Recipe planning page: `public/recipes.html` — recipe search and
  recommendations, recipe details, shopping suggestions, and meal-prep tracking.

## Features

- **Pantry management** — add, edit, and remove items; track quantity, cost, and
  expiration dates, with the soonest-to-expire items flagged first.
- **Recipe search & recommendations** — search the catalog by name, ingredient,
  or tag, filter to recipes you can make right now, and let recommendations
  surface meals that use ingredients about to expire.
- **Recipe details** — each recipe shows timing, difficulty, tags, an ingredient
  checklist (on hand vs. need to buy), and step-by-step instructions.
- **Smart shopping list** — suggests what to buy to unlock recipes you almost
  have, skipping pantry staples you always keep on hand.
- **Meal-prep tracker** — log batch-cooked food with use-by reminders.

## Data Collections

The app reads and writes five MongoDB collections (1,000+ seeded records in
total):

- `shelf` — current pantry inventory.
- `history` — items removed from the shelf, used for waste/savings insights.
- `recipes` — a hand-written catalog (`database/recipe-data.js`) plus a large
  imported set of real recipes.
- `ingredients` — an ingredient reference list that powers search autocomplete.
- `mealPrep` — tracked meal-prepped foods.

The imported recipes and ingredients come from the free
[TheMealDB](https://www.themealdb.com) API. They are fetched once and committed
to `database/dataset/` so seeding needs no network access:

```bash
npm run fetch:dataset   # refresh database/dataset/*.json from TheMealDB
npm run seed            # load all collections into MongoDB
```

## Notes

- The backend is Node + Express using ES modules (no CommonJS `require`).
- The frontend uses vanilla JavaScript and client-side rendering.
