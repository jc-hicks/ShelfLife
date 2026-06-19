// One-time importer for the public TheMealDB dataset (https://www.themealdb.com).
// It pulls the full free catalog of meals and ingredients, reshapes them to
// match our recipe schema, and writes them to database/dataset/*.json. Those
// JSON files are committed so `npm run seed` works offline and on the deploy
// server without hitting the network.
//
// Re-run with `npm run fetch:dataset` only when you want to refresh the data.

import { mkdir, writeFile } from "node:fs/promises";

const API = "https://www.themealdb.com/api/json/v1/1";
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// TheMealDB stores the whole method in one blob. Split it back into steps:
// first on line breaks, and if it's a single paragraph, on sentence breaks.
function splitInstructions(text) {
  if (!text) {
    return [];
  }

  let steps = text
    .split(/\r?\n+/)
    .map((step) => step.trim())
    .filter(Boolean);

  if (steps.length <= 1) {
    steps = text
      .split(/(?<=\.)\s+(?=[A-Z])/)
      .map((step) => step.trim())
      .filter(Boolean);
  }

  return steps
    .map((step) =>
      step
        .replace(/^step\s*\d+[:.)]?\s*/i, "")
        .replace(/^\d+[.)]\s*/, "")
        .trim()
    )
    .filter(Boolean);
}

function collectIngredients(meal) {
  const seen = new Set();
  const ingredients = [];

  for (let i = 1; i <= 20; i += 1) {
    const name = (meal[`strIngredient${i}`] || "").trim();
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      ingredients.push(name);
    }
  }

  return ingredients;
}

function collectTags(meal) {
  const tags = [
    meal.strCategory,
    meal.strArea,
    ...(meal.strTags || "").split(","),
  ];
  const seen = new Set();
  const cleaned = [];

  for (const raw of tags) {
    const tag = (raw || "").trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      cleaned.push(tag);
    }
  }

  return cleaned;
}

function toRecipe(meal) {
  return {
    id: `${slugify(meal.strMeal)}-${meal.idMeal}`,
    name: meal.strMeal,
    ingredients: collectIngredients(meal),
    instructions: splitInstructions(meal.strInstructions),
    tags: collectTags(meal),
    image: meal.strMealThumb || null,
    source: "TheMealDB",
    sourceId: meal.idMeal,
  };
}

async function fetchMeals() {
  const byId = new Map();

  for (const letter of LETTERS) {
    const response = await fetch(`${API}/search.php?f=${letter}`);
    const data = await response.json();
    for (const meal of data.meals || []) {
      if (!byId.has(meal.idMeal)) {
        byId.set(meal.idMeal, toRecipe(meal));
      }
    }
    console.log(`  fetched "${letter}" — ${byId.size} unique meals so far`);
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchIngredients() {
  const response = await fetch(`${API}/list.php?i=list`);
  const data = await response.json();

  return (data.meals || [])
    .map((entry) => {
      const description = (entry.strDescription || "").trim();
      return {
        name: entry.strIngredient,
        type: entry.strType || null,
        // Descriptions are full paragraphs; keep a short blurb for reference.
        description: description ? description.slice(0, 240) : null,
      };
    })
    .filter((entry) => entry.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  console.log("Fetching meals from TheMealDB...");
  const recipes = await fetchMeals();

  console.log("Fetching ingredient reference list...");
  const ingredients = await fetchIngredients();

  const dir = new URL("./dataset/", import.meta.url);
  await mkdir(dir, { recursive: true });

  await writeFile(
    new URL("recipes.json", dir),
    `${JSON.stringify(recipes, null, 2)}\n`
  );
  await writeFile(
    new URL("ingredients.json", dir),
    `${JSON.stringify(ingredients, null, 2)}\n`
  );

  console.log(
    `Wrote ${recipes.length} recipes and ${ingredients.length} ingredients to database/dataset/.`
  );
}

main().catch((error) => {
  console.error("Dataset import failed:", error);
  process.exit(1);
});
