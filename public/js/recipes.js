async function loadRecipeRecommendations() {
  try {
    const response = await fetch("/api/recipes/recommendations");
    const recommendations = await response.json();
    const recipeList = document.getElementById("recipe-list");
    const recipeCount = document.getElementById("recipe-count");

    recipeList.innerHTML = recommendations.length
      ? recommendations
          .map(
            (recipe) => `
        <div class="recipe-card">
          <h4>${recipe.name}</h4>
          <p>${recipe.reason}</p>
          <p><strong>${recipe.cookTimeMinutes} min</strong> | ${recipe.servings} servings</p>
          <button class="btn btn-sm btn-primary view-recipe-btn" data-recipe-id="${recipe.id}">
            View Details
          </button>
        </div>
        `,
          )
          .join("")
      : '<div class="text-muted">Add more pantry items to get recipe recommendations.</div>';

    if (recommendations.length > 0) {
      await loadRecipeDetail(recommendations[0].id);
    }
  } catch (error) {
    console.error("Failed to load recipe recommendations:", error);
  }
}

async function loadRecipeDetail(recipeId) {
  try {
    const response = await fetch(`/api/recipes/${recipeId}`);
    const recipe = await response.json();
    const detail = document.getElementById("recipe-detail");

    if (!response.ok) {
      throw new Error(recipe.error || "Failed to load recipe detail");
    }

    detail.innerHTML = `
      <div>
        <h3>${recipe.name}</h3>
        <p><strong>${recipe.cookTimeMinutes} min</strong> | ${recipe.servings} servings | ${recipe.mealPrepFriendly ? "Good for meal prep" : "Best same day"}</p>
        
        <h5>Ingredients on hand:</h5>
        <ul>
          ${recipe.matchedIngredients.map((ingredient) => `<li>${ingredient}</li>`).join("")}
        </ul>
        
        <h5>Still needed:</h5>
        <ul>
          ${recipe.missingIngredients.length
            ? recipe.missingIngredients.map((ingredient) => `<li>${ingredient}</li>`).join("")
            : '<li class="text-muted">Nothing missing.</li>'}
        </ul>
        
        <h5>Instructions:</h5>
        <ol>
          ${recipe.instructions.map((step) => `<li>${step}</li>`).join("")}
        </ol>
      </div>
    `;
  } catch (error) {
    console.error("Failed to load recipe detail:", error);
  }
}

async function loadShoppingSuggestions() {
  try {
    const response = await fetch("/api/recipes/shopping-suggestions");
    const suggestions = await response.json();
    const tableBody = document.getElementById("shopping-suggestions-table");

    tableBody.innerHTML = suggestions.length
      ? suggestions
          .map(
            (suggestion, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${suggestion.item}</td>
          <td>${suggestion.reason}</td>
        </tr>
        `,
          )
          .join("")
      : '<tr><td colspan="3" class="text-muted">No shopping suggestions yet.</td></tr>';
  } catch (error) {
    console.error("Failed to load shopping suggestions:", error);
  }
}

async function loadMealPrep() {
  try {
    const response = await fetch("/api/recipes/meal-prep");
    const mealPrepItems = await response.json();
    const tableBody = document.getElementById("meal-prep-table");

    tableBody.innerHTML = mealPrepItems.length
      ? mealPrepItems
          .map(
            (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${item.name}</td>
          <td>${item.expirationDate}</td>
          <td>
            <button class="btn btn-outline-danger btn-sm meal-prep-delete-btn" data-id="${item._id}">
              Delete
            </button>
          </td>
        </tr>
        `,
          )
          .join("")
      : '<tr><td colspan="4" class="text-muted">No meal-prepped foods tracked yet.</td></tr>';
  } catch (error) {
    console.error("Failed to load meal prep items:", error);
  }
}

const mealPrepForm = document.getElementById("meal-prep-form");

mealPrepForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("meal-prep-name").value;
  const preparedDate = document.getElementById("meal-prep-date").value;
  const expirationDate = document.getElementById("meal-prep-expiration").value;

  try {
    const response = await fetch("/api/recipes/meal-prep", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        preparedDate,
        expirationDate,
      }),
    });

    if (!response.ok) {
      throw new Error("failed to add meal prep item");
    }

    mealPrepForm.reset();
    await loadMealPrep();
  } catch (error) {
    console.error("Failed to submit meal prep form:", error);
  }
});

document.addEventListener("click", async (event) => {
  if (!event.target.classList.contains("view-recipe-btn")) {
    if (!event.target.classList.contains("meal-prep-delete-btn")) {
      return;
    }
  }

  const id = event.target.dataset.recipeId || event.target.dataset.id;

  if (event.target.classList.contains("view-recipe-btn")) {
    await loadRecipeDetail(id);
    return;
  }

  if (!confirm("Delete this meal-prepped item?")) {
    return;
  }

  await fetch(`/api/recipes/meal-prep/${id}`, {
    method: "DELETE",
  });

  await loadMealPrep();
});

loadRecipeRecommendations();
loadShoppingSuggestions();
loadMealPrep();