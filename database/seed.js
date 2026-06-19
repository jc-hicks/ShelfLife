import { readFile } from "node:fs/promises";

import { db } from "./db.js";
import { recipeCatalog } from "./recipe-data.js";

// Load a committed dataset file (see database/fetch-dataset.js). Returns an
// empty array if it hasn't been generated yet, so seeding still works with just
// the curated catalog.
async function loadDataset(fileName) {
  try {
    const url = new URL(`./dataset/${fileName}`, import.meta.url);
    return JSON.parse(await readFile(url, "utf8"));
  } catch {
    console.warn(
      `Dataset file ${fileName} not found — run "npm run fetch:dataset" to import it.`
    );
    return [];
  }
}

// Dates are generated relative to "today" so the shelf always has a realistic
// mix of fresh, expiring-soon, and expired items regardless of when this runs.
const today = new Date();
today.setHours(0, 0, 0, 0);

function pad(value) {
  return String(value).padStart(2, "0");
}

// Returns a YYYY-MM-DD string offset from today (negative = past).
function dateOffset(days) {
  const date = new Date(today);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Returns a Date offset from today, for history removal timestamps.
function timestampDaysAgo(days) {
  const date = new Date(today);
  date.setDate(date.getDate() - days);
  date.setHours(9, 0, 0, 0);
  return date;
}

const shelfItems = [
  // Produce — a couple expiring soon
  {
    name: "Baby spinach",
    category: "Produce",
    quantity: 1,
    quantityUnit: "bag",
    cost: 3.49,
    storedDate: dateOffset(-3),
    expirationDate: dateOffset(2),
  },
  {
    name: "Bananas",
    category: "Produce",
    quantity: 6,
    quantityUnit: "item",
    cost: 1.8,
    storedDate: dateOffset(-2),
    expirationDate: dateOffset(4),
  },
  {
    name: "Carrots",
    category: "Produce",
    quantity: 2,
    quantityUnit: "lb",
    cost: 2.25,
    storedDate: dateOffset(-4),
    expirationDate: dateOffset(13),
  },
  {
    name: "Roma tomatoes",
    category: "Produce",
    quantity: 5,
    quantityUnit: "item",
    cost: 2.99,
    storedDate: dateOffset(-3),
    expirationDate: dateOffset(2),
  },
  {
    name: "Bell peppers",
    category: "Produce",
    quantity: 3,
    quantityUnit: "item",
    cost: 3.5,
    storedDate: dateOffset(-3),
    expirationDate: dateOffset(7),
  },
  {
    name: "Yellow onion",
    category: "Produce",
    quantity: 3,
    quantityUnit: "item",
    cost: 1.5,
    storedDate: dateOffset(-6),
    expirationDate: dateOffset(25),
  },
  {
    name: "Green onion",
    category: "Produce",
    quantity: 1,
    quantityUnit: "bunch",
    cost: 0.99,
    storedDate: dateOffset(-2),
    expirationDate: dateOffset(4),
  },
  {
    name: "Garlic",
    category: "Produce",
    quantity: 1,
    quantityUnit: "head",
    cost: 0.79,
    storedDate: dateOffset(-10),
    expirationDate: dateOffset(40),
  },
  {
    name: "Lemons",
    category: "Produce",
    quantity: 3,
    quantityUnit: "item",
    cost: 1.5,
    storedDate: dateOffset(-4),
    expirationDate: dateOffset(14),
  },
  {
    name: "Russet potatoes",
    category: "Produce",
    quantity: 5,
    quantityUnit: "lb",
    cost: 3.99,
    storedDate: dateOffset(-8),
    expirationDate: dateOffset(30),
  },
  // Dairy & Eggs
  {
    name: "Whole milk",
    category: "Dairy & Eggs",
    quantity: 1,
    quantityUnit: "gallon",
    cost: 4.29,
    storedDate: dateOffset(-5),
    expirationDate: dateOffset(3),
  },
  {
    name: "Greek yogurt",
    category: "Dairy & Eggs",
    quantity: 4,
    quantityUnit: "container",
    cost: 5.0,
    storedDate: dateOffset(-2),
    expirationDate: dateOffset(10),
  },
  {
    name: "Large eggs",
    category: "Dairy & Eggs",
    quantity: 12,
    quantityUnit: "item",
    cost: 3.99,
    storedDate: dateOffset(-6),
    expirationDate: dateOffset(21),
  },
  {
    name: "Cheddar cheese",
    category: "Dairy & Eggs",
    quantity: 8,
    quantityUnit: "oz",
    cost: 4.49,
    storedDate: dateOffset(-7),
    expirationDate: dateOffset(18),
  },
  {
    name: "Butter",
    category: "Dairy & Eggs",
    quantity: 1,
    quantityUnit: "package",
    cost: 4.29,
    storedDate: dateOffset(-9),
    expirationDate: dateOffset(35),
  },
  // Meat & Seafood — one expiring tomorrow, one already expired
  {
    name: "Chicken breast",
    category: "Meat & Seafood",
    quantity: 1.5,
    quantityUnit: "lb",
    cost: 8.49,
    storedDate: dateOffset(-2),
    expirationDate: dateOffset(1),
  },
  {
    name: "Salmon fillet",
    category: "Meat & Seafood",
    quantity: 2,
    quantityUnit: "fillet",
    cost: 12.99,
    storedDate: dateOffset(-5),
    expirationDate: dateOffset(-1),
  },
  {
    name: "Sliced ham",
    category: "Meat & Seafood",
    quantity: 8,
    quantityUnit: "oz",
    cost: 5.49,
    storedDate: dateOffset(-4),
    expirationDate: dateOffset(2),
  },
  // Grains & Bakery
  {
    name: "Sourdough loaf",
    category: "Grains & Bakery",
    quantity: 1,
    quantityUnit: "item",
    cost: 4.5,
    storedDate: dateOffset(-1),
    expirationDate: dateOffset(5),
  },
  {
    name: "Plain bagels",
    category: "Grains & Bakery",
    quantity: 6,
    quantityUnit: "item",
    cost: 3.29,
    storedDate: dateOffset(-2),
    expirationDate: dateOffset(8),
  },
  {
    name: "Flour tortillas",
    category: "Grains & Bakery",
    quantity: 10,
    quantityUnit: "item",
    cost: 2.99,
    storedDate: dateOffset(-5),
    expirationDate: dateOffset(20),
  },
  {
    name: "Rolled oats",
    category: "Grains & Bakery",
    quantity: 1,
    quantityUnit: "container",
    cost: 3.79,
    storedDate: dateOffset(-30),
    expirationDate: dateOffset(300),
  },
  // Pantry & Canned — long shelf life
  {
    name: "Canned black beans",
    category: "Pantry & Canned",
    quantity: 3,
    quantityUnit: "can",
    cost: 2.7,
    storedDate: dateOffset(-20),
    expirationDate: dateOffset(540),
  },
  {
    name: "Spaghetti",
    category: "Pantry & Canned",
    quantity: 2,
    quantityUnit: "box",
    cost: 2.5,
    storedDate: dateOffset(-30),
    expirationDate: dateOffset(400),
  },
  {
    name: "White rice",
    category: "Pantry & Canned",
    quantity: 1,
    quantityUnit: "bag",
    cost: 6.49,
    storedDate: dateOffset(-45),
    expirationDate: dateOffset(500),
  },
  {
    name: "Olive oil",
    category: "Pantry & Canned",
    quantity: 1,
    quantityUnit: "bottle",
    cost: 8.99,
    storedDate: dateOffset(-40),
    expirationDate: dateOffset(300),
  },
  // Frozen
  {
    name: "Frozen peas",
    category: "Frozen",
    quantity: 1,
    quantityUnit: "bag",
    cost: 2.19,
    storedDate: dateOffset(-15),
    expirationDate: dateOffset(220),
  },
  {
    name: "Frozen blueberries",
    category: "Frozen",
    quantity: 1,
    quantityUnit: "bag",
    cost: 4.49,
    storedDate: dateOffset(-20),
    expirationDate: dateOffset(180),
  },
  // Beverages
  {
    name: "Orange juice",
    category: "Beverages",
    quantity: 1,
    quantityUnit: "carton",
    cost: 3.75,
    storedDate: dateOffset(-3),
    expirationDate: dateOffset(6),
  },
  // Condiments & Sauces
  {
    name: "Ketchup",
    category: "Condiments & Sauces",
    quantity: 1,
    quantityUnit: "bottle",
    cost: 2.99,
    storedDate: dateOffset(-25),
    expirationDate: dateOffset(150),
  },
];

// Each history entry mirrors what the DELETE route writes. Waste rates are
// deliberately uneven across categories so the waste map is interesting:
// Produce and Meat are wasteful, Pantry/Frozen rarely are.
const removed = [
  // Produce — high waste rate, several thrown out
  {
    name: "Romaine lettuce",
    category: "Produce",
    cost: 2.99,
    outcome: "wasted",
    daysAgo: 3,
  },
  {
    name: "Strawberries",
    category: "Produce",
    cost: 4.49,
    outcome: "wasted",
    daysAgo: 6,
  },
  {
    name: "Roma tomatoes",
    category: "Produce",
    cost: 3.2,
    outcome: "wasted",
    daysAgo: 11,
  },
  {
    name: "Apples",
    category: "Produce",
    cost: 4.0,
    outcome: "saved",
    daysAgo: 8,
  },
  {
    name: "Bell peppers",
    category: "Produce",
    cost: 3.5,
    outcome: "saved",
    daysAgo: 14,
  },

  // Meat & Seafood — fewer items but expensive losses
  {
    name: "Ground beef",
    category: "Meat & Seafood",
    cost: 9.99,
    outcome: "wasted",
    daysAgo: 5,
  },
  {
    name: "Shrimp",
    category: "Meat & Seafood",
    cost: 13.5,
    outcome: "wasted",
    daysAgo: 18,
  },
  {
    name: "Pork chops",
    category: "Meat & Seafood",
    cost: 7.25,
    outcome: "saved",
    daysAgo: 9,
  },

  // Dairy & Eggs — moderate
  {
    name: "Sour cream",
    category: "Dairy & Eggs",
    cost: 2.49,
    outcome: "wasted",
    daysAgo: 7,
  },
  {
    name: "Cheddar cheese",
    category: "Dairy & Eggs",
    cost: 5.99,
    outcome: "saved",
    daysAgo: 4,
  },
  {
    name: "Butter",
    category: "Dairy & Eggs",
    cost: 4.29,
    outcome: "saved",
    daysAgo: 12,
  },
  {
    name: "Cottage cheese",
    category: "Dairy & Eggs",
    cost: 3.19,
    outcome: "saved",
    daysAgo: 20,
  },

  // Grains & Bakery — moderate
  {
    name: "Hamburger buns",
    category: "Grains & Bakery",
    cost: 2.99,
    outcome: "wasted",
    daysAgo: 10,
  },
  {
    name: "Tortillas",
    category: "Grains & Bakery",
    cost: 3.49,
    outcome: "saved",
    daysAgo: 6,
  },
  {
    name: "White rice",
    category: "Grains & Bakery",
    cost: 5.5,
    outcome: "saved",
    daysAgo: 22,
  },

  // Pantry & Canned — used in time, no waste
  {
    name: "Canned corn",
    category: "Pantry & Canned",
    cost: 1.29,
    outcome: "saved",
    daysAgo: 15,
  },
  {
    name: "Peanut butter",
    category: "Pantry & Canned",
    cost: 4.99,
    outcome: "saved",
    daysAgo: 25,
  },

  // Frozen — no waste
  {
    name: "Frozen blueberries",
    category: "Frozen",
    cost: 4.49,
    outcome: "saved",
    daysAgo: 17,
  },

  // Beverages — one lapsed
  {
    name: "Almond milk",
    category: "Beverages",
    cost: 3.29,
    outcome: "wasted",
    daysAgo: 13,
  },
  {
    name: "Iced tea",
    category: "Beverages",
    cost: 2.79,
    outcome: "saved",
    daysAgo: 19,
  },

  // Used well before expiry — neutral, excluded from savings/loss and the
  // waste map. Spread across categories to show normal early consumption.
  {
    name: "Russet potatoes",
    category: "Produce",
    cost: 3.99,
    outcome: "used",
    daysAgo: 5,
  },
  {
    name: "Pasta sauce",
    category: "Pantry & Canned",
    cost: 3.49,
    outcome: "used",
    daysAgo: 9,
  },
  {
    name: "Frozen pizza",
    category: "Frozen",
    cost: 6.49,
    outcome: "used",
    daysAgo: 12,
  },
  {
    name: "String cheese",
    category: "Dairy & Eggs",
    cost: 4.79,
    outcome: "used",
    daysAgo: 16,
  },
  {
    name: "Sparkling water",
    category: "Beverages",
    cost: 4.99,
    outcome: "used",
    daysAgo: 21,
  },
];

function buildHistoryRecord(entry) {
  // Expiration relative to removal reflects the outcome:
  //   wasted — already lapsed a couple days before removal
  //   saved  — removed within the at-risk window (a few days before expiry)
  //   used   — removed well before expiry (weeks of runway left)
  let expirationDate;
  if (entry.outcome === "wasted") {
    expirationDate = dateOffset(-(entry.daysAgo + 2));
  } else if (entry.outcome === "saved") {
    expirationDate = dateOffset(-(entry.daysAgo - 5));
  } else {
    expirationDate = dateOffset(-entry.daysAgo + 21);
  }

  return {
    name: entry.name,
    storedDate: dateOffset(-(entry.daysAgo + 14)),
    expirationDate,
    quantity: 1,
    quantityUnit: "item",
    cost: entry.cost,
    category: entry.category,
    value: entry.cost,
    outcome: entry.outcome,
    removedDate: timestampDaysAgo(entry.daysAgo),
  };
}

async function seed() {
  const shelfCollection = db.collection("shelf");
  const historyCollection = db.collection("history");
  const recipeCollection = db.collection("recipes");
  const ingredientCollection = db.collection("ingredients");

  const [importedRecipes, importedIngredients] = await Promise.all([
    loadDataset("recipes.json"),
    loadDataset("ingredients.json"),
  ]);

  // The hand-written catalog comes first so its pantry-matched recipes rank
  // ahead of the broader imported set on the recipe page.
  const allRecipes = [...recipeCatalog, ...importedRecipes];

  const clearedShelf = await shelfCollection.deleteMany({});
  const clearedHistory = await historyCollection.deleteMany({});
  const clearedRecipes = await recipeCollection.deleteMany({});
  const clearedIngredients = await ingredientCollection.deleteMany({});
  console.log(
    `Cleared ${clearedShelf.deletedCount} shelf, ${clearedHistory.deletedCount} history, ${clearedRecipes.deletedCount} recipe, and ${clearedIngredients.deletedCount} ingredient records.`
  );

  const shelfResult = await shelfCollection.insertMany(shelfItems);
  const historyResult = await historyCollection.insertMany(
    removed.map(buildHistoryRecord)
  );
  const recipeResult = await recipeCollection.insertMany(allRecipes);
  const ingredientResult = importedIngredients.length
    ? await ingredientCollection.insertMany(importedIngredients)
    : { insertedCount: 0 };

  const total =
    shelfResult.insertedCount +
    historyResult.insertedCount +
    recipeResult.insertedCount +
    ingredientResult.insertedCount;

  console.log(
    `Inserted ${shelfResult.insertedCount} shelf items, ${historyResult.insertedCount} history records, ${recipeResult.insertedCount} recipes, and ${ingredientResult.insertedCount} ingredients.`
  );
  console.log(`Total records across all collections: ${total}.`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  });
