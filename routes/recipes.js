import express from "express";
import { ObjectId } from "mongodb";

import { db } from "../database/db.js";

const router = express.Router();

const shelfCollection = db.collection("shelf");
const recipeCollection = db.collection("recipes");
const ingredientCollection = db.collection("ingredients");
const mealPrepCollection = db.collection("mealPrep");

// The catalog is large (hundreds of imported recipes), so the list endpoint is
// paginated. Page size is capped so a single request can't pull everything.
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

// Days of runway that still count an ingredient as "expiring soon" on the
// shelf — recipes that use these float to the top of the recommendations.
const EXPIRING_SOON_DAYS = 5;

// Seasonings we assume are always in the kitchen. They never count toward a
// recipe's match score, its missing list, or the shopping suggestions.
const STAPLE_INGREDIENTS = new Set(["salt", "pepper", "water", "oil", "sugar"]);

const defaultMealPrepItems = [
  {
    name: "Chicken Alfredo",
    preparedDate: "2026-06-15",
    expirationDate: "2026-06-18",
    recipeId: "creamy-spinach-pasta",
  },
  {
    name: "Pasta Salad",
    preparedDate: "2026-06-14",
    expirationDate: "2026-06-17",
    recipeId: null,
  },
  {
    name: "Turkey Sandwich",
    preparedDate: "2026-06-16",
    expirationDate: "2026-06-18",
    recipeId: null,
  },
];

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Trim every entry in a list and drop the blanks. Returns [] for non-arrays.
function cleanList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

// Break a food name into comparable tokens: lowercased, punctuation dropped,
// and a trailing "s" trimmed from longer words so "eggs" lines up with "egg".
function tokenize(value) {
  return normalizeName(value)
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map((token) =>
      token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token
    );
}

// A recipe ingredient matches a shelf item when one name's tokens are wholly
// contained in the other's — so "Spinach" matches "Baby spinach" and "Eggs"
// matches "Large eggs", without "Cheddar cheese" matching "Cottage cheese".
function namesMatch(ingredient, shelfName) {
  const ingredientTokens = tokenize(ingredient);
  const shelfTokens = tokenize(shelfName);

  if (!ingredientTokens.length || !shelfTokens.length) {
    return false;
  }

  const shelfSet = new Set(shelfTokens);
  const ingredientSet = new Set(ingredientTokens);

  return (
    ingredientTokens.every((token) => shelfSet.has(token)) ||
    shelfTokens.every((token) => ingredientSet.has(token))
  );
}

function isStaple(ingredient) {
  const tokens = tokenize(ingredient);
  return (
    tokens.length > 0 && tokens.every((token) => STAPLE_INGREDIENTS.has(token))
  );
}

function getDaysUntil(expirationDate) {
  if (!expirationDate) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = String(expirationDate).split("-").map(Number);
  const target = new Date(year, month - 1, day);

  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function isExpiringSoon(expirationDate) {
  const daysRemaining = getDaysUntil(expirationDate);
  return (
    daysRemaining !== null &&
    daysRemaining >= 0 &&
    daysRemaining <= EXPIRING_SOON_DAYS
  );
}

// Cost at stake per remaining day for a shelf item — the same metric the
// pantry dashboard uses to rank what to use first. An expensive item expiring
// tomorrow scores far higher than a cheap one with a week left. Items that are
// already expired return 0: they aren't safe to cook, so a recipe shouldn't be
// recommended for "rescuing" them.
function getCostLostPerDay(shelfItem) {
  const daysLeft = getDaysUntil(shelfItem.expirationDate);
  if (daysLeft === null || daysLeft <= 0) {
    return 0;
  }

  const cost = Number(shelfItem.cost);
  const value = Number.isNaN(cost) ? 0 : cost;
  return value / daysLeft;
}

// ---------- Cost-to-cook estimation ----------------------------------------

// Conversion tables to a common base unit.
// Volume → millilitres, Weight → grams.
const ML_PER = {
  tsp: 4.93,
  teaspoon: 4.93,
  teaspoons: 4.93,
  tbsp: 14.79,
  tablespoon: 14.79,
  tablespoons: 14.79,
  cup: 236.6,
  cups: 236.6,
  "fl oz": 29.57,
  floz: 29.57,
  ml: 1,
  milliliter: 1,
  millilitre: 1,
  milliliters: 1,
  millilitres: 1,
  l: 1000,
  liter: 1000,
  litre: 1000,
  liters: 1000,
  litres: 1000,
  pint: 473.2,
  pints: 473.2,
  quart: 946.4,
  quarts: 946.4,
  gallon: 3785,
  gallons: 3785,
};

const G_PER = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  pound: 453.6,
  pounds: 453.6,
};

// Parse a free-text measure string (e.g. "1/2 cup", "3", "2 tbsp", "800g")
// into { quantity: number, unit: string } or null if unparseable.
function parseMeasure(raw) {
  if (!raw) {
    return null;
  }

  const str = String(raw).trim().toLowerCase();

  // Collapse multiple spaces, normalise common abbreviations
  const normalised = str
    .replace(/\s+/g, " ")
    .replace(/tablespoons?/, "tbsp")
    .replace(/teaspoons?/, "tsp");

  // Match optional mixed number + fraction then optional unit
  // e.g. "1 1/2 cup", "3/4 tsp", "100g", "2", "800 g"
  const match = normalised.match(/^(\d+)?\s*(\d+\/\d+)?\s*([a-z\s]+)?$/);
  if (!match) {
    return null;
  }

  const whole = match[1] ? Number(match[1]) : 0;
  let fraction = 0;
  if (match[2]) {
    const [num, den] = match[2].split("/").map(Number);
    fraction = num / den;
  }

  const quantity = whole + fraction;
  if (!quantity) {
    return null;
  }

  const unit = (match[3] || "").trim();
  return { quantity, unit };
}

// Convert a parsed measure to a base unit (ml for volume, g for weight,
// empty string for counts). Returns null if the unit is unrecognised.
function toBase(parsed) {
  if (!parsed) {
    return null;
  }

  const { quantity, unit } = parsed;
  const u = unit.replace(/\s+/g, "").toLowerCase();

  if (ML_PER[u] !== undefined || ML_PER[unit] !== undefined) {
    return { value: quantity * (ML_PER[u] ?? ML_PER[unit]), type: "volume" };
  }

  if (G_PER[u] !== undefined || G_PER[unit] !== undefined) {
    return { value: quantity * (G_PER[u] ?? G_PER[unit]), type: "weight" };
  }

  // Treat empty unit or count-style words as items
  const COUNT_UNITS = new Set([
    "",
    "item",
    "items",
    "piece",
    "pieces",
    "slice",
    "slices",
    "clove",
    "cloves",
    "fillet",
    "fillets",
    "head",
    "heads",
    "bunch",
    "bunches",
    "stalk",
    "stalks",
    "ear",
    "ears",
    "sprig",
    "sprigs",
  ]);
  if (COUNT_UNITS.has(u) || /^\d+$/.test(u)) {
    return { value: quantity, type: "count" };
  }

  return null;
}

// Estimate the cost of one ingredient for a single recipe use.
// Returns a number or null when the units are incompatible or missing.
function estimateIngredientCost(recipeIndex, recipe, shelfItem) {
  const measureStr = (recipe.measures || [])[recipeIndex];
  if (!measureStr || !shelfItem.cost || !shelfItem.quantity) {
    return null;
  }

  const recipeBase = toBase(parseMeasure(measureStr));
  const shelfBase = toBase({
    quantity: shelfItem.quantity,
    unit: shelfItem.quantityUnit || "",
  });

  if (!recipeBase || !shelfBase) {
    return null;
  }

  if (recipeBase.type !== shelfBase.type || shelfBase.value === 0) {
    return null;
  }

  const fraction = recipeBase.value / shelfBase.value;
  return Math.round(Number(shelfItem.cost) * fraction * 100) / 100;
}

// Pair each non-staple ingredient with the shelf item that satisfies it (if
// any), then derive the matched / expiring / missing breakdown and a score
// that rewards using what you own and, especially, what's about to expire.
function formatRecipe(recipe, shelfItems) {
  const considered = recipe.ingredients.filter(
    (ingredient) => !isStaple(ingredient)
  );

  const matchedIngredients = [];
  const expiringIngredients = [];
  const missingIngredients = [];

  // Cost-weighted urgency, summed across the soon-to-expire ingredients this
  // recipe would use up. Mirrors the dashboard's priority so recipes that
  // rescue expensive, about-to-spoil items rank highest.
  let expiringPriority = 0;
  let valueAtRisk = 0;
  let estimatedCost = 0;
  let costCalculable = false;

  for (const ingredient of considered) {
    const ingredientIndex = recipe.ingredients.indexOf(ingredient);
    const shelfMatch = shelfItems.find((item) =>
      namesMatch(ingredient, item.name)
    );

    if (!shelfMatch) {
      missingIngredients.push(ingredient);
      continue;
    }

    matchedIngredients.push(ingredient);

    const ingredientCost = estimateIngredientCost(
      ingredientIndex,
      recipe,
      shelfMatch
    );
    if (ingredientCost !== null) {
      estimatedCost += ingredientCost;
      costCalculable = true;
    }

    if (isExpiringSoon(shelfMatch.expirationDate)) {
      expiringIngredients.push(ingredient);
      expiringPriority += getCostLostPerDay(shelfMatch);

      const cost = Number(shelfMatch.cost);
      valueAtRisk += Number.isNaN(cost) ? 0 : cost;
    }
  }

  const matchPercent = considered.length
    ? Math.round((matchedIngredients.length / considered.length) * 100)
    : 0;

  valueAtRisk = Math.round(valueAtRisk * 100) / 100;

  const score =
    matchedIngredients.length * 3 +
    expiringIngredients.length * 2 -
    missingIngredients.length;

  let reason;
  if (expiringIngredients.length > 0) {
    const atRiskNote =
      valueAtRisk > 0 ? ` (about $${valueAtRisk.toFixed(2)} at risk)` : "";
    reason = `Uses ${expiringIngredients.join(", ")} before ${
      expiringIngredients.length === 1 ? "it expires" : "they expire"
    }${atRiskNote}.`;
  } else if (matchedIngredients.length > 0) {
    reason = `Uses ${matchedIngredients.length} ingredient${
      matchedIngredients.length === 1 ? "" : "s"
    } you already have.`;
  } else {
    reason = "A fresh idea for your next shopping trip.";
  }

  estimatedCost = Math.round(estimatedCost * 100) / 100;
  const costPerServing =
    costCalculable && recipe.servings
      ? Math.round((estimatedCost / recipe.servings) * 100) / 100
      : null;

  return {
    ...recipe,
    matchedIngredients,
    expiringIngredients,
    missingIngredients,
    matchPercent,
    canMakeNow: missingIngredients.length === 0,
    expiringPriority,
    valueAtRisk,
    score,
    reason,
    estimatedCost: costCalculable ? estimatedCost : null,
    costPerServing,
  };
}

// Lead with cost-weighted urgency so the recipes that save the most
// soon-to-spoil money come first, then fall back to overall pantry match and a
// quicker cook time as tie-breakers.
function sortByRelevance(recipes) {
  return [...recipes].sort(
    (left, right) =>
      right.expiringPriority - left.expiringPriority ||
      right.score - left.score ||
      (left.cookTimeMinutes ?? 999) - (right.cookTimeMinutes ?? 999)
  );
}

// A lightweight shape for the list view. Full details are fetched per recipe on click.
function toCard(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    prepTimeMinutes: recipe.prepTimeMinutes ?? null,
    cookTimeMinutes: recipe.cookTimeMinutes ?? null,
    servings: recipe.servings ?? null,
    difficulty: recipe.difficulty ?? null,
    tags: recipe.tags ?? [],
    image: recipe.image ?? null,
    reason: recipe.reason,
    matchPercent: recipe.matchPercent,
    canMakeNow: recipe.canMakeNow,
    valueAtRisk: recipe.valueAtRisk,
    expiringIngredients: recipe.expiringIngredients,
    estimatedCost: recipe.estimatedCost ?? null,
    costPerServing: recipe.costPerServing ?? null,
  };
}

// Build the searchable text for a recipe so a single query box can match on
// name, tag, or ingredient.
function matchesSearch(recipe, term) {
  if (!term) {
    return true;
  }

  const haystack = [recipe.name, ...(recipe.tags ?? []), ...recipe.ingredients]
    .join(" ")
    .toLowerCase();

  return haystack.includes(term);
}

function aggregateShoppingSuggestions(recommendations) {
  const suggestionMap = new Map();

  recommendations.forEach((recipe) => {
    recipe.missingIngredients.forEach((ingredient) => {
      const key = normalizeName(ingredient);
      const current = suggestionMap.get(key) ?? {
        item: ingredient,
        quantity: 0,
        recipes: [],
      };

      current.quantity += 1;
      current.recipes.push(recipe.name);
      suggestionMap.set(key, current);
    });
  });

  return [...suggestionMap.values()]
    .sort(
      (left, right) =>
        right.quantity - left.quantity || left.item.localeCompare(right.item)
    )
    .map((suggestion) => ({
      item: suggestion.item,
      quantity: suggestion.quantity,
      recipes: suggestion.recipes,
      reason:
        suggestion.recipes.length === 1
          ? `Needed for ${suggestion.recipes[0]}.`
          : `Needed for ${suggestion.recipes.length} recipes you can almost make.`,
    }));
}

async function loadFormattedRecipes() {
  const [recipes, shelfItems] = await Promise.all([
    recipeCollection.find({}).toArray(),
    shelfCollection.find({}).toArray(),
  ]);

  return recipes.map((recipe) => formatRecipe(recipe, shelfItems));
}

async function ensureMealPrepSeeded() {
  const existingCount = await mealPrepCollection.countDocuments();

  if (existingCount > 0) {
    return;
  }

  await mealPrepCollection.insertMany(defaultMealPrepItems);
}

// Catalog with match data, filtered by an optional search term, tag, or the
// "ready" flag (recipes you can make with nothing missing), then paginated.
// Returns the requested page of lightweight cards plus paging metadata.
router.get("/", async (req, res) => {
  try {
    const term = normalizeName(req.query.search);
    const tag = normalizeName(req.query.tag);
    const readyOnly = req.query.ready === "true";

    let recipes = sortByRelevance(await loadFormattedRecipes());

    if (term) {
      recipes = recipes.filter((recipe) => matchesSearch(recipe, term));
    }

    if (tag) {
      recipes = recipes.filter((recipe) =>
        (recipe.tags ?? []).some((value) => normalizeName(value) === tag)
      );
    }

    if (readyOnly) {
      recipes = recipes.filter((recipe) => recipe.canMakeNow);
    }

    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, toNumberOrNull(req.query.pageSize) ?? DEFAULT_PAGE_SIZE)
    );
    const total = recipes.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(
      totalPages,
      Math.max(1, toNumberOrNull(req.query.page) ?? 1)
    );
    const start = (page - 1) * pageSize;

    res.json({
      total,
      page,
      pageSize,
      totalPages,
      recipes: recipes.slice(start, start + pageSize).map(toCard),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch recipes",
    });
  }
});

// Create a recipe entered by the user, stored in the recipes collection
// alongside the curated and imported sets.
router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name ?? "").trim();
    const ingredients = cleanList(req.body.ingredients);
    const instructions = cleanList(req.body.instructions);

    if (!name || !ingredients.length || !instructions.length) {
      return res.status(400).json({
        error:
          "A name, at least one ingredient, and at least one step are required",
      });
    }

    // Derive a unique slug id, since detail lookups key off `id`.
    const base = slugify(name) || "recipe";
    let id = base;
    let suffix = 2;
    while (await recipeCollection.findOne({ id })) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }

    const recipe = {
      id,
      name,
      prepTimeMinutes: toNumberOrNull(req.body.prepTimeMinutes),
      cookTimeMinutes: toNumberOrNull(req.body.cookTimeMinutes),
      servings: toNumberOrNull(req.body.servings),
      difficulty: String(req.body.difficulty ?? "").trim() || null,
      tags: cleanList(req.body.tags),
      ingredients,
      instructions,
      notes: String(req.body.notes ?? "").trim() || null,
      mealPrepFriendly: Boolean(req.body.mealPrepFriendly),
      custom: true,
    };

    await recipeCollection.insertOne(recipe);

    const shelfItems = await shelfCollection.find({}).toArray();
    res.status(201).json(formatRecipe(recipe, shelfItems));
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to create recipe",
    });
  }
});

// Distinct tags across the catalog, for building the filter controls.
router.get("/tags", async (req, res) => {
  try {
    const tags = await recipeCollection.distinct("tags");
    res.json(tags.filter(Boolean).sort((a, b) => a.localeCompare(b)));
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch recipe tags",
    });
  }
});

// Ingredient reference names, used to power autocomplete on the search box.
router.get("/ingredients", async (req, res) => {
  try {
    const names = await ingredientCollection.distinct("name");
    res.json(names.filter(Boolean).sort((a, b) => a.localeCompare(b)));
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch ingredients",
    });
  }
});

router.get("/shopping-suggestions", async (req, res) => {
  try {
    // Only suggest buying for recipes you're close to making: a high
    // pantry match with just a few items short
    const recommendations = sortByRelevance(await loadFormattedRecipes())
      .filter(
        (recipe) =>
          recipe.matchPercent >= 50 &&
          recipe.missingIngredients.length >= 1 &&
          recipe.missingIngredients.length <= 3
      )
      .slice(0, 8);

    res.json(aggregateShoppingSuggestions(recommendations));
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch shopping suggestions",
    });
  }
});

router.get("/meal-prep", async (req, res) => {
  try {
    await ensureMealPrepSeeded();
    const items = await mealPrepCollection
      .find({})
      .sort({ expirationDate: 1 })
      .toArray();

    res.json(items);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch meal-prepped foods",
    });
  }
});

router.post("/meal-prep", async (req, res) => {
  try {
    const { name, preparedDate, expirationDate, recipeId = null } = req.body;

    if (!name || !preparedDate || !expirationDate) {
      return res.status(400).json({
        error: "Name, prepared date, and expiration date are required",
      });
    }

    await ensureMealPrepSeeded();

    const newMealPrepItem = {
      name,
      preparedDate,
      expirationDate,
      recipeId,
    };

    const result = await mealPrepCollection.insertOne(newMealPrepItem);

    res.status(201).json({
      _id: result.insertedId,
      ...newMealPrepItem,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to create meal-prepped food item",
    });
  }
});

router.delete("/meal-prep/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: "Invalid meal-prep item id",
      });
    }

    await ensureMealPrepSeeded();

    const result = await mealPrepCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: "Meal-prepped item not found",
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to delete meal-prepped item",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const recipe = await recipeCollection.findOne({ id: req.params.id });

    if (!recipe) {
      return res.status(404).json({
        error: "Recipe not found",
      });
    }

    const shelfItems = await shelfCollection.find({}).toArray();
    res.json(formatRecipe(recipe, shelfItems));
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch recipe details",
    });
  }
});

export default router;
