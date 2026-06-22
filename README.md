# ShelfLife

ShelfLife is a full-stack web application designed to help users reduce food waste and manage groceries more efficiently.

## Author

James Hicks and Alexandra Descoteaux

## Class Link

[Web Development — Online, Summer 2026 (Prof. John Guerra)](https://johnguerra.co/classes/webDevelopment_online_summer_2026/)

## Project Objective

Help users track pantry items, monitor expiration dates, get recipe ideas from ingredients they already own, and keep meal-prepped food organized so less food is wasted.

## Screenshots

### Pantry dashboard — inventory

![My Shelf inventory table, sorted by spoilage priority](public/assets/pantry-shelf.png)

### Pantry dashboard — insights

![Waste and savings insights charts](public/assets/pantry-insights.png)

### Recipes — suggestions and details

![Recipe suggestions with match meters and a recipe detail panel](public/assets/recipes.png)

### Recipes — shopping list and meal prep

![Smart shopping list and meal-prep tracker](public/assets/shopping-and-meal-prep.png)

## Instructions To Build

1. Install dependencies with `npm install`.
2. Set `MONGODB_URI` in a local `.env` file (it is git-ignored, so no
   credentials are committed).
3. Seed sample data with `npm run seed`.
4. Start the app with `npm start`.
5. Open `http://localhost:3000` in a browser.

## Pages

- Pantry dashboard: `public/index.html` — paginated inventory table, slide-out
  add-item form, meal-prep summary panel, and waste/savings insights charts.
- Recipe planning page: `public/recipes.html` — recipe search and
  recommendations, recipe details, shopping suggestions, and meal-prep tracking.

## Features

- **Pantry management** — add items via a slide-out drawer; edit and remove
  items inline; track quantity, cost, and expiration dates, with the
  soonest-to-expire items flagged first. The table paginates at 25 items per
  page.
- **Recipe search & recommendations** — search the catalog by name, ingredient,
  or tag, filter to recipes you can make right now, and let recommendations
  surface meals that use ingredients about to expire.
- **Recipe cost estimation** — each recipe card shows an estimated cost to cook
  based on the quantity measures and the prices you paid for matched shelf items.
- **Recipe details** — each recipe shows timing, difficulty, tags, an ingredient
  checklist (on hand vs. need to buy), and step-by-step instructions.
- **Smart shopping list** — suggests what to buy to unlock recipes you almost
  have, skipping pantry staples you always keep on hand.
- **Meal-prep tracker** — log batch-cooked food with use-by reminders; a summary
  panel on the dashboard shows freshness status at a glance.

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
