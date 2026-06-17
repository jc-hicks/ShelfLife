import express from "express";
import { ObjectId } from "mongodb";

import { db } from "../database/db.js";

const router = express.Router();

const shelfCollection = db.collection("shelf");
const mealPrepCollection = db.collection("mealPrep");

const recipeCatalog = [
  {
    id: "spinach-cheddar-omelet",
    name: "Spinach Cheddar Omelet",
    cookTimeMinutes: 15,
    servings: 1,
    ingredients: [
      "Eggs",
      "Spinach",
      "Cheddar Cheese",
      "Butter",
      "Salt",
      "Pepper",
    ],
    instructions: [
      "Whisk the eggs with salt and pepper.",
      "Saute the spinach in butter until wilted.",
      "Pour in the eggs, add cheddar, and fold the omelet once set.",
    ],
    mealPrepFriendly: true,
  },
  {
    id: "ham-cheese-breakfast-casserole",
    name: "Ham and Cheese Breakfast Casserole",
    cookTimeMinutes: 35,
    servings: 4,
    ingredients: [
      "Ham",
      "Eggs",
      "Cheddar Cheese",
      "Milk",
      "Bread",
      "Green Onion",
    ],
    instructions: [
      "Whisk the eggs and milk together.",
      "Layer the ham, bread, and cheese in a baking dish.",
      "Pour over the egg mixture and bake until the center is set.",
    ],
    mealPrepFriendly: true,
  },
  {
    id: "creamy-spinach-pasta",
    name: "Creamy Spinach Pasta",
    cookTimeMinutes: 25,
    servings: 3,
    ingredients: [
      "Spinach",
      "Milk",
      "Cheddar Cheese",
      "Pasta",
      "Garlic",
      "Olive Oil",
    ],
    instructions: [
      "Cook the pasta until al dente.",
      "Saute the garlic and spinach in olive oil.",
      "Stir in milk and cheddar to make a quick sauce, then toss with pasta.",
    ],
    mealPrepFriendly: false,
  },
  {
    id: "ham-spinach-frittata",
    name: "Ham and Spinach Frittata",
    cookTimeMinutes: 28,
    servings: 4,
    ingredients: ["Ham", "Spinach", "Eggs", "Cheddar Cheese", "Milk", "Onion"],
    instructions: [
      "Cook the onion and ham in an oven-safe skillet.",
      "Add spinach, then pour in the egg and milk mixture.",
      "Top with cheddar and bake until puffed and golden.",
    ],
    mealPrepFriendly: true,
  },
  {
    id: "loaded-scramble",
    name: "Loaded Pantry Scramble",
    cookTimeMinutes: 12,
    servings: 2,
    ingredients: ["Eggs", "Milk", "Ham", "Spinach", "Cheddar Cheese", "Bread"],
    instructions: [
      "Whisk eggs with a splash of milk.",
      "Cook the ham and spinach in a skillet, then add the eggs.",
      "Finish with cheddar and serve with toasted bread.",
    ],
    mealPrepFriendly: false,
  },
];

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

const recipeLookup = new Map(
  recipeCatalog.map((recipe) => [recipe.id, recipe])
);

function normalizeName(value) {
  return value.trim().toLowerCase();
}

function getDaysUntil(expirationDate) {
  const today = new Date();
  const target = new Date(expirationDate);
  const diffInMs = target.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0);
  return Math.round(diffInMs / (1000 * 60 * 60 * 24));
}

function isExpiringSoon(expirationDate) {
  const daysRemaining = getDaysUntil(expirationDate);
  return daysRemaining >= 0 && daysRemaining <= 5;
}

function formatRecipe(recipe, shelfItems) {
  const shelfLookup = new Map(
    shelfItems.map((item) => [normalizeName(item.name), item])
  );

  const matchedIngredients = recipe.ingredients.filter((ingredient) =>
    shelfLookup.has(normalizeName(ingredient))
  );

  const expiringIngredients = matchedIngredients.filter((ingredient) => {
    const shelfItem = shelfLookup.get(normalizeName(ingredient));
    return shelfItem ? isExpiringSoon(shelfItem.expirationDate) : false;
  });

  const missingIngredients = recipe.ingredients.filter(
    (ingredient) => !shelfLookup.has(normalizeName(ingredient))
  );

  const score =
    matchedIngredients.length * 3 +
    expiringIngredients.length * 2 -
    missingIngredients.length;

  return {
    ...recipe,
    matchedIngredients,
    expiringIngredients,
    missingIngredients,
    score,
    reason:
      expiringIngredients.length > 0
        ? `Uses ${expiringIngredients.join(", ")} before they expire.`
        : `Uses ${matchedIngredients.length} pantry ingredients you already own.`,
  };
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
      reason: `Needed for ${suggestion.recipes.join(", ")}.`,
    }));
}

async function ensureMealPrepSeeded() {
  const existingCount = await mealPrepCollection.countDocuments();

  if (existingCount > 0) {
    return;
  }

  await mealPrepCollection.insertMany(defaultMealPrepItems);
}

router.get("/recommendations", async (req, res) => {
  try {
    const shelfItems = await shelfCollection.find({}).toArray();
    const recommendations = recipeCatalog
      .map((recipe) => formatRecipe(recipe, shelfItems))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.cookTimeMinutes - right.cookTimeMinutes
      )
      .slice(0, 4);

    res.json(recommendations);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch recipe recommendations",
    });
  }
});

router.get("/shopping-suggestions", async (req, res) => {
  try {
    const shelfItems = await shelfCollection.find({}).toArray();
    const recommendations = recipeCatalog
      .map((recipe) => formatRecipe(recipe, shelfItems))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.cookTimeMinutes - right.cookTimeMinutes
      )
      .slice(0, 3);

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
    const recipe = recipeLookup.get(req.params.id);

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
