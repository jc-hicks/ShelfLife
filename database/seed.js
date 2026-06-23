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

// ---------- Shelf item generator --------------------------------------------

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function randomIntInRange(min, max) {
  return Math.round(randomInRange(min, max));
}

// Each entry defines a pantry ingredient. Names use the same token patterns as
// recipe-data.js so the recipe matcher finds matches on the shelf.
// expirationRange: [min, max] days from today — negative values = already expired.
const ingredientPool = [
  // Produce — short to medium shelf life
  {
    name: "Baby spinach",
    category: "Produce",
    units: ["bag", "oz"],
    costRange: [2.49, 4.99],
    qtyRange: [1, 2],
    expirationRange: [-2, 10],
  },
  {
    name: "Bananas",
    category: "Produce",
    units: ["item"],
    costRange: [0.79, 2.49],
    qtyRange: [3, 8],
    expirationRange: [-1, 7],
  },
  {
    name: "Carrots",
    category: "Produce",
    units: ["lb", "bag"],
    costRange: [1.49, 3.49],
    qtyRange: [1, 3],
    expirationRange: [3, 20],
  },
  {
    name: "Roma tomatoes",
    category: "Produce",
    units: ["item"],
    costRange: [1.99, 4.49],
    qtyRange: [3, 8],
    expirationRange: [-2, 10],
  },
  {
    name: "Bell peppers",
    category: "Produce",
    units: ["item"],
    costRange: [2.49, 4.99],
    qtyRange: [2, 5],
    expirationRange: [1, 12],
  },
  {
    name: "Yellow onion",
    category: "Produce",
    units: ["item", "lb"],
    costRange: [0.99, 2.99],
    qtyRange: [2, 5],
    expirationRange: [10, 35],
  },
  {
    name: "Green onion",
    category: "Produce",
    units: ["bunch"],
    costRange: [0.79, 1.49],
    qtyRange: [1, 2],
    expirationRange: [-1, 7],
  },
  {
    name: "Garlic",
    category: "Produce",
    units: ["head"],
    costRange: [0.59, 1.49],
    qtyRange: [1, 3],
    expirationRange: [15, 60],
  },
  {
    name: "Lemons",
    category: "Produce",
    units: ["item"],
    costRange: [0.79, 2.49],
    qtyRange: [2, 6],
    expirationRange: [5, 21],
  },
  {
    name: "Russet potatoes",
    category: "Produce",
    units: ["lb", "bag"],
    costRange: [2.99, 5.99],
    qtyRange: [1, 5],
    expirationRange: [10, 45],
  },
  {
    name: "Avocado",
    category: "Produce",
    units: ["item"],
    costRange: [0.99, 2.49],
    qtyRange: [1, 4],
    expirationRange: [-1, 6],
  },
  {
    name: "Broccoli",
    category: "Produce",
    units: ["head", "lb"],
    costRange: [1.49, 3.49],
    qtyRange: [1, 2],
    expirationRange: [2, 10],
  },
  {
    name: "Zucchini",
    category: "Produce",
    units: ["item"],
    costRange: [0.79, 2.49],
    qtyRange: [2, 4],
    expirationRange: [3, 12],
  },
  {
    name: "Celery",
    category: "Produce",
    units: ["bunch", "stalk"],
    costRange: [1.49, 2.99],
    qtyRange: [1, 3],
    expirationRange: [5, 18],
  },
  {
    name: "Mushrooms",
    category: "Produce",
    units: ["oz", "lb"],
    costRange: [2.49, 5.99],
    qtyRange: [8, 16],
    expirationRange: [-1, 8],
  },
  {
    name: "Ginger",
    category: "Produce",
    units: ["oz"],
    costRange: [0.79, 1.99],
    qtyRange: [2, 6],
    expirationRange: [10, 30],
  },
  {
    name: "Cabbage",
    category: "Produce",
    units: ["head"],
    costRange: [1.29, 2.99],
    qtyRange: [1, 2],
    expirationRange: [7, 28],
  },
  {
    name: "Asparagus",
    category: "Produce",
    units: ["bunch", "lb"],
    costRange: [2.99, 5.99],
    qtyRange: [1, 2],
    expirationRange: [1, 7],
  },
  {
    name: "Kale",
    category: "Produce",
    units: ["bunch", "bag"],
    costRange: [1.99, 3.99],
    qtyRange: [1, 2],
    expirationRange: [3, 12],
  },
  {
    name: "Cucumber",
    category: "Produce",
    units: ["item"],
    costRange: [0.79, 1.99],
    qtyRange: [1, 3],
    expirationRange: [3, 12],
  },
  {
    name: "Sweet potato",
    category: "Produce",
    units: ["lb", "item"],
    costRange: [1.49, 3.99],
    qtyRange: [2, 5],
    expirationRange: [14, 45],
  },
  {
    name: "Scallions",
    category: "Produce",
    units: ["bunch"],
    costRange: [0.79, 1.49],
    qtyRange: [1, 2],
    expirationRange: [-1, 7],
  },

  // Dairy & Eggs
  {
    name: "Large eggs",
    category: "Dairy & Eggs",
    units: ["item"],
    costRange: [2.99, 6.49],
    qtyRange: [6, 18],
    expirationRange: [7, 35],
  },
  {
    name: "Whole milk",
    category: "Dairy & Eggs",
    units: ["gallon", "quart"],
    costRange: [2.99, 5.49],
    qtyRange: [1, 2],
    expirationRange: [-2, 12],
  },
  {
    name: "Butter",
    category: "Dairy & Eggs",
    units: ["package"],
    costRange: [3.49, 5.99],
    qtyRange: [1, 2],
    expirationRange: [14, 60],
  },
  {
    name: "Cheddar cheese",
    category: "Dairy & Eggs",
    units: ["oz", "lb"],
    costRange: [3.49, 6.99],
    qtyRange: [8, 16],
    expirationRange: [7, 30],
  },
  {
    name: "Greek yogurt",
    category: "Dairy & Eggs",
    units: ["container", "oz"],
    costRange: [3.49, 6.99],
    qtyRange: [1, 4],
    expirationRange: [3, 21],
  },
  {
    name: "Parmesan cheese",
    category: "Dairy & Eggs",
    units: ["oz"],
    costRange: [3.99, 7.99],
    qtyRange: [4, 8],
    expirationRange: [30, 90],
  },
  {
    name: "Heavy cream",
    category: "Dairy & Eggs",
    units: ["cup", "pint"],
    costRange: [2.49, 4.99],
    qtyRange: [1, 2],
    expirationRange: [3, 21],
  },
  {
    name: "Sour cream",
    category: "Dairy & Eggs",
    units: ["container"],
    costRange: [1.99, 3.99],
    qtyRange: [1, 2],
    expirationRange: [5, 21],
  },

  // Meat & Seafood — short shelf life drives urgency scores up
  {
    name: "Chicken breast",
    category: "Meat & Seafood",
    units: ["lb"],
    costRange: [5.99, 12.99],
    qtyRange: [1, 3],
    expirationRange: [-1, 5],
  },
  {
    name: "Salmon fillet",
    category: "Meat & Seafood",
    units: ["fillet", "lb"],
    costRange: [8.99, 16.99],
    qtyRange: [1, 3],
    expirationRange: [-2, 4],
  },
  {
    name: "Sliced ham",
    category: "Meat & Seafood",
    units: ["oz", "package"],
    costRange: [3.99, 7.99],
    qtyRange: [8, 16],
    expirationRange: [2, 10],
  },
  {
    name: "Ground beef",
    category: "Meat & Seafood",
    units: ["lb"],
    costRange: [5.99, 11.99],
    qtyRange: [1, 2],
    expirationRange: [-2, 4],
  },
  {
    name: "Ground pork",
    category: "Meat & Seafood",
    units: ["lb"],
    costRange: [4.99, 8.99],
    qtyRange: [1, 2],
    expirationRange: [-1, 4],
  },
  {
    name: "Bacon",
    category: "Meat & Seafood",
    units: ["package"],
    costRange: [4.99, 9.99],
    qtyRange: [1, 2],
    expirationRange: [3, 14],
  },
  {
    name: "Ground turkey",
    category: "Meat & Seafood",
    units: ["lb"],
    costRange: [4.99, 8.99],
    qtyRange: [1, 2],
    expirationRange: [-1, 5],
  },
  {
    name: "Lamb mince",
    category: "Meat & Seafood",
    units: ["lb"],
    costRange: [7.99, 14.99],
    qtyRange: [1, 2],
    expirationRange: [-1, 4],
  },
  {
    name: "Chicken thighs",
    category: "Meat & Seafood",
    units: ["lb", "package"],
    costRange: [4.99, 9.99],
    qtyRange: [1, 3],
    expirationRange: [-1, 5],
  },
  {
    name: "Shrimp",
    category: "Meat & Seafood",
    units: ["lb"],
    costRange: [8.99, 16.99],
    qtyRange: [1, 2],
    expirationRange: [-2, 4],
  },

  // Grains & Bakery
  {
    name: "Spaghetti",
    category: "Pantry & Canned",
    units: ["box"],
    costRange: [1.49, 3.49],
    qtyRange: [1, 3],
    expirationRange: [120, 730],
  },
  {
    name: "White rice",
    category: "Pantry & Canned",
    units: ["bag", "lb"],
    costRange: [3.99, 8.99],
    qtyRange: [1, 5],
    expirationRange: [180, 730],
  },
  {
    name: "Sourdough loaf",
    category: "Grains & Bakery",
    units: ["item"],
    costRange: [3.99, 6.99],
    qtyRange: [1, 2],
    expirationRange: [2, 8],
  },
  {
    name: "Plain bagels",
    category: "Grains & Bakery",
    units: ["item"],
    costRange: [2.99, 4.99],
    qtyRange: [4, 8],
    expirationRange: [3, 10],
  },
  {
    name: "Flour tortillas",
    category: "Grains & Bakery",
    units: ["item", "package"],
    costRange: [2.49, 4.49],
    qtyRange: [8, 12],
    expirationRange: [10, 30],
  },
  {
    name: "Rolled oats",
    category: "Grains & Bakery",
    units: ["container", "bag"],
    costRange: [2.99, 5.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Breadcrumbs",
    category: "Grains & Bakery",
    units: ["container"],
    costRange: [1.99, 3.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Egg roll wrappers",
    category: "Grains & Bakery",
    units: ["package"],
    costRange: [2.99, 4.99],
    qtyRange: [1, 2],
    expirationRange: [7, 30],
  },
  {
    name: "Pita bread",
    category: "Grains & Bakery",
    units: ["package"],
    costRange: [2.49, 3.99],
    qtyRange: [1, 2],
    expirationRange: [3, 10],
  },
  {
    name: "Whole wheat bread",
    category: "Grains & Bakery",
    units: ["item"],
    costRange: [2.99, 4.99],
    qtyRange: [1, 2],
    expirationRange: [5, 12],
  },

  // Pantry & Canned — long shelf life
  {
    name: "Olive oil",
    category: "Pantry & Canned",
    units: ["bottle"],
    costRange: [5.99, 12.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Canned black beans",
    category: "Pantry & Canned",
    units: ["can"],
    costRange: [0.99, 2.49],
    qtyRange: [2, 6],
    expirationRange: [180, 730],
  },
  {
    name: "Chickpeas",
    category: "Pantry & Canned",
    units: ["can"],
    costRange: [0.99, 2.49],
    qtyRange: [2, 5],
    expirationRange: [180, 730],
  },
  {
    name: "Kidney beans",
    category: "Pantry & Canned",
    units: ["can"],
    costRange: [0.99, 2.49],
    qtyRange: [2, 5],
    expirationRange: [180, 730],
  },
  {
    name: "Tomato puree",
    category: "Pantry & Canned",
    units: ["can", "jar"],
    costRange: [1.49, 3.49],
    qtyRange: [1, 4],
    expirationRange: [90, 730],
  },
  {
    name: "Coconut milk",
    category: "Pantry & Canned",
    units: ["can"],
    costRange: [1.49, 3.49],
    qtyRange: [1, 4],
    expirationRange: [90, 730],
  },
  {
    name: "All purpose flour",
    category: "Pantry & Canned",
    units: ["bag", "lb"],
    costRange: [2.49, 5.99],
    qtyRange: [2, 10],
    expirationRange: [90, 365],
  },
  {
    name: "Granulated sugar",
    category: "Pantry & Canned",
    units: ["bag", "lb"],
    costRange: [1.99, 4.99],
    qtyRange: [2, 10],
    expirationRange: [180, 730],
  },
  {
    name: "Paprika",
    category: "Pantry & Canned",
    units: ["oz"],
    costRange: [1.99, 4.99],
    qtyRange: [2, 4],
    expirationRange: [180, 730],
  },
  {
    name: "Cumin",
    category: "Pantry & Canned",
    units: ["oz"],
    costRange: [1.99, 4.49],
    qtyRange: [2, 4],
    expirationRange: [180, 730],
  },
  {
    name: "Turmeric",
    category: "Pantry & Canned",
    units: ["oz"],
    costRange: [2.49, 5.99],
    qtyRange: [2, 4],
    expirationRange: [180, 730],
  },
  {
    name: "Red pepper paste",
    category: "Pantry & Canned",
    units: ["jar"],
    costRange: [2.99, 5.99],
    qtyRange: [1, 2],
    expirationRange: [60, 365],
  },
  {
    name: "Sunflower oil",
    category: "Pantry & Canned",
    units: ["bottle"],
    costRange: [3.99, 7.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Rice vinegar",
    category: "Pantry & Canned",
    units: ["bottle"],
    costRange: [2.49, 4.99],
    qtyRange: [1, 2],
    expirationRange: [180, 730],
  },
  {
    name: "Lentils",
    category: "Pantry & Canned",
    units: ["bag", "lb"],
    costRange: [1.99, 4.49],
    qtyRange: [1, 3],
    expirationRange: [180, 730],
  },
  {
    name: "Peanut butter",
    category: "Pantry & Canned",
    units: ["jar"],
    costRange: [3.49, 6.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Canned corn",
    category: "Pantry & Canned",
    units: ["can"],
    costRange: [0.79, 1.99],
    qtyRange: [2, 6],
    expirationRange: [180, 730],
  },
  {
    name: "Canned tuna",
    category: "Pantry & Canned",
    units: ["can"],
    costRange: [0.99, 2.99],
    qtyRange: [2, 6],
    expirationRange: [180, 730],
  },
  {
    name: "Pasta sauce",
    category: "Pantry & Canned",
    units: ["jar"],
    costRange: [2.49, 5.99],
    qtyRange: [1, 3],
    expirationRange: [90, 730],
  },
  {
    name: "Chicken broth",
    category: "Pantry & Canned",
    units: ["carton", "can"],
    costRange: [1.99, 4.99],
    qtyRange: [1, 4],
    expirationRange: [90, 730],
  },
  {
    name: "Vanilla extract",
    category: "Pantry & Canned",
    units: ["oz"],
    costRange: [3.99, 8.99],
    qtyRange: [1, 2],
    expirationRange: [180, 730],
  },
  {
    name: "Baking powder",
    category: "Pantry & Canned",
    units: ["oz"],
    costRange: [1.99, 3.99],
    qtyRange: [1, 2],
    expirationRange: [180, 365],
  },
  {
    name: "Curry powder",
    category: "Pantry & Canned",
    units: ["oz"],
    costRange: [2.49, 5.99],
    qtyRange: [2, 4],
    expirationRange: [180, 730],
  },

  // Frozen — very long shelf life
  {
    name: "Frozen blueberries",
    category: "Frozen",
    units: ["bag"],
    costRange: [3.49, 6.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Frozen peas",
    category: "Frozen",
    units: ["bag"],
    costRange: [1.99, 3.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Frozen corn",
    category: "Frozen",
    units: ["bag"],
    costRange: [1.99, 3.49],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Frozen broccoli",
    category: "Frozen",
    units: ["bag"],
    costRange: [1.99, 3.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Frozen edamame",
    category: "Frozen",
    units: ["bag"],
    costRange: [2.49, 4.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Frozen spinach",
    category: "Frozen",
    units: ["bag"],
    costRange: [1.99, 3.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },

  // Beverages
  {
    name: "Orange juice",
    category: "Beverages",
    units: ["carton", "bottle"],
    costRange: [2.99, 5.99],
    qtyRange: [1, 2],
    expirationRange: [-2, 14],
  },
  {
    name: "Almond milk",
    category: "Beverages",
    units: ["carton"],
    costRange: [2.99, 4.99],
    qtyRange: [1, 2],
    expirationRange: [5, 21],
  },
  {
    name: "Coconut water",
    category: "Beverages",
    units: ["carton", "bottle"],
    costRange: [1.99, 3.99],
    qtyRange: [1, 4],
    expirationRange: [7, 60],
  },

  // Condiments & Sauces
  {
    name: "Ketchup",
    category: "Condiments & Sauces",
    units: ["bottle"],
    costRange: [1.99, 3.99],
    qtyRange: [1, 2],
    expirationRange: [60, 365],
  },
  {
    name: "Soy sauce",
    category: "Condiments & Sauces",
    units: ["bottle"],
    costRange: [2.49, 4.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Worcestershire sauce",
    category: "Condiments & Sauces",
    units: ["bottle"],
    costRange: [2.49, 4.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Duck sauce",
    category: "Condiments & Sauces",
    units: ["bottle", "jar"],
    costRange: [1.99, 3.99],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Hot sauce",
    category: "Condiments & Sauces",
    units: ["bottle"],
    costRange: [2.49, 5.99],
    qtyRange: [1, 2],
    expirationRange: [90, 730],
  },
  {
    name: "Maple syrup",
    category: "Condiments & Sauces",
    units: ["bottle"],
    costRange: [4.99, 10.99],
    qtyRange: [1, 2],
    expirationRange: [180, 730],
  },
  {
    name: "Honey",
    category: "Condiments & Sauces",
    units: ["jar"],
    costRange: [3.99, 8.99],
    qtyRange: [1, 2],
    expirationRange: [365, 730],
  },
  {
    name: "Dijon mustard",
    category: "Condiments & Sauces",
    units: ["jar"],
    costRange: [1.99, 4.49],
    qtyRange: [1, 2],
    expirationRange: [90, 365],
  },
  {
    name: "Apple cider vinegar",
    category: "Condiments & Sauces",
    units: ["bottle"],
    costRange: [2.49, 5.99],
    qtyRange: [1, 2],
    expirationRange: [180, 730],
  },
];

// Completed recipes and meal-prepped dishes stored in the fridge.
// These cycle until the meal-prep target is met.
const mealPrepPool = [
  {
    name: "Spinach Cheddar Omelet",
    costRange: [4, 7],
    servingsRange: [1, 2],
    expirationRange: [2, 5],
  },
  {
    name: "Ham and Cheese Breakfast Casserole",
    costRange: [10, 18],
    servingsRange: [2, 6],
    expirationRange: [3, 5],
  },
  {
    name: "Creamy Spinach Pasta",
    costRange: [8, 14],
    servingsRange: [2, 4],
    expirationRange: [2, 4],
  },
  {
    name: "Ham and Spinach Frittata",
    costRange: [9, 15],
    servingsRange: [2, 4],
    expirationRange: [3, 5],
  },
  {
    name: "Chicken Fried Rice",
    costRange: [10, 18],
    servingsRange: [2, 4],
    expirationRange: [3, 5],
  },
  {
    name: "Smoky Black Bean Soup",
    costRange: [6, 12],
    servingsRange: [2, 4],
    expirationRange: [4, 6],
  },
  {
    name: "Sheet-Pan Chicken and Vegetables",
    costRange: [12, 20],
    servingsRange: [2, 4],
    expirationRange: [3, 5],
  },
  {
    name: "Fresh Tomato Pasta",
    costRange: [7, 12],
    servingsRange: [2, 3],
    expirationRange: [2, 4],
  },
  {
    name: "Chicken Noodle Soup",
    costRange: [10, 16],
    servingsRange: [2, 4],
    expirationRange: [4, 6],
  },
  {
    name: "Veggie Egg Muffins",
    costRange: [5, 9],
    servingsRange: [3, 6],
    expirationRange: [3, 4],
  },
  {
    name: "Black Bean Stuffed Peppers",
    costRange: [8, 14],
    servingsRange: [2, 4],
    expirationRange: [3, 5],
  },
  {
    name: "Salmon Rice Bowl",
    costRange: [14, 22],
    servingsRange: [1, 2],
    expirationRange: [2, 4],
  },
  {
    name: "Carrot Soup",
    costRange: [5, 10],
    servingsRange: [2, 4],
    expirationRange: [4, 6],
  },
  {
    name: "Garden Vegetable Stir-Fry",
    costRange: [6, 11],
    servingsRange: [2, 3],
    expirationRange: [2, 4],
  },
  {
    name: "Banana Oat Pancakes",
    costRange: [4, 8],
    servingsRange: [2, 4],
    expirationRange: [2, 4],
  },
  {
    name: "Spaghetti Aglio e Olio",
    costRange: [5, 9],
    servingsRange: [1, 2],
    expirationRange: [2, 4],
  },
  {
    name: "Garlic Butter Salmon",
    costRange: [14, 24],
    servingsRange: [1, 2],
    expirationRange: [2, 3],
  },
  {
    name: "Loaded Baked Potatoes",
    costRange: [7, 13],
    servingsRange: [2, 4],
    expirationRange: [3, 5],
  },
  {
    name: "Black Bean Quesadillas",
    costRange: [5, 10],
    servingsRange: [1, 2],
    expirationRange: [1, 3],
  },
  {
    name: "Classic French Toast",
    costRange: [4, 8],
    servingsRange: [2, 3],
    expirationRange: [1, 3],
  },
];

function generateShelfItems() {
  const items = [];
  const TARGET_INGREDIENTS = 950;
  const TARGET_MEAL_PREP = 50;

  for (let i = 0; i < TARGET_INGREDIENTS; i++) {
    const ing = ingredientPool[i % ingredientPool.length];
    const daysAgo = randomIntInRange(1, 40);
    const expiresInDays = randomIntInRange(...ing.expirationRange);
    const cost = parseFloat(randomInRange(...ing.costRange).toFixed(2));
    const qty = randomIntInRange(...ing.qtyRange);

    items.push({
      name: ing.name,
      category: ing.category,
      quantity: qty,
      quantityUnit: pickRandom(ing.units),
      cost,
      storedDate: dateOffset(-daysAgo),
      expirationDate: dateOffset(expiresInDays),
    });
  }

  for (let i = 0; i < TARGET_MEAL_PREP; i++) {
    const meal = mealPrepPool[i % mealPrepPool.length];
    const daysAgo = randomIntInRange(0, 2);
    const expiresInDays = randomIntInRange(...meal.expirationRange);
    const cost = parseFloat(randomInRange(...meal.costRange).toFixed(2));
    const qty = randomIntInRange(...meal.servingsRange);

    items.push({
      name: meal.name,
      category: "Other",
      quantity: qty,
      quantityUnit: "serving",
      cost,
      storedDate: dateOffset(-daysAgo),
      expirationDate: dateOffset(expiresInDays),
    });
  }

  return items;
}

const shelfItems = generateShelfItems();

// ---------- History records -------------------------------------------------

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
  // Cleared so the recipe route re-seeds the sample meal-prep items (with
  // quantities) on next load.
  await db.collection("mealPrep").deleteMany({});
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
