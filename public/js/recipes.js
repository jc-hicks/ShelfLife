// Client-side rendering for the recipe page: a searchable, filterable list of
// recipes scored against the shelf, a detail panel, the shopping list, and the
// meal-prep tracker. All data comes from /api/recipes.

const recipeListEl = document.getElementById("recipe-list");
const recipeCountEl = document.getElementById("recipe-count");
const recipeDetailEl = document.getElementById("recipe-detail");
const searchInput = document.getElementById("recipe-search-input");
const tagSelect = document.getElementById("recipe-tag-select");
const readyToggle = document.getElementById("recipe-ready-toggle");
const clearFiltersBtn = document.getElementById("recipe-clear-filters-btn");
const paginationEl = document.getElementById("recipe-pagination");
const mealPrepForm = document.getElementById("meal-prep-form");
const mealPrepRecipeSelect = document.getElementById("meal-prep-recipe");
const addRecipeForm = document.getElementById("add-recipe-form");
const addRecipeModalEl = document.getElementById("add-recipe-modal");

let selectedRecipeId = null;
let searchDebounce = null;
let currentPage = 1;

function escapeHtml(text) {
  if (text === null || text === undefined) {
    return "";
  }
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Imported recipes don't carry timing, servings, or difficulty, so build the
// meta line only from the fields that are actually present.
function buildMetaParts(recipe) {
  const parts = [];
  const total =
    (Number(recipe.prepTimeMinutes) || 0) +
    (Number(recipe.cookTimeMinutes) || 0);

  if (total > 0) {
    parts.push(`${total} min`);
  }
  if (recipe.servings) {
    parts.push(`${recipe.servings} serving${recipe.servings === 1 ? "" : "s"}`);
  }
  if (recipe.difficulty) {
    parts.push(escapeHtml(recipe.difficulty));
  }

  return parts;
}

// The detail panel can show a bit more than a card: prep and cook split out,
// and a meal-prep note.
function buildDetailMetaParts(recipe) {
  const parts = [];

  if (recipe.prepTimeMinutes && recipe.cookTimeMinutes) {
    parts.push(
      `${recipe.prepTimeMinutes} min prep`,
      `${recipe.cookTimeMinutes} min cook`
    );
  } else {
    const total =
      (Number(recipe.prepTimeMinutes) || 0) +
      (Number(recipe.cookTimeMinutes) || 0);
    if (total > 0) {
      parts.push(`${total} min`);
    }
  }

  if (recipe.servings) {
    parts.push(`${recipe.servings} serving${recipe.servings === 1 ? "" : "s"}`);
  }
  if (recipe.difficulty) {
    parts.push(escapeHtml(recipe.difficulty));
  }
  if (typeof recipe.mealPrepFriendly === "boolean") {
    parts.push(recipe.mealPrepFriendly ? "Great for meal prep" : "Best fresh");
  }
  if (recipe.costPerServing !== null && recipe.costPerServing !== undefined) {
    parts.push(`~$${recipe.costPerServing.toFixed(2)}/serving`);
  } else if (
    recipe.estimatedCost !== null &&
    recipe.estimatedCost !== undefined
  ) {
    parts.push(`~$${recipe.estimatedCost.toFixed(2)} estimated`);
  }

  return parts;
}

function renderTagChips(tags = []) {
  if (!tags.length) {
    return "";
  }
  return `
    <div class="recipe-tags">
      ${tags
        .map((tag) => `<span class="recipe-tag">${escapeHtml(tag)}</span>`)
        .join("")}
    </div>
  `;
}

function renderStatusBadge(recipe) {
  if (recipe.canMakeNow) {
    return '<span class="recipe-status recipe-status-ready">Ready to cook</span>';
  }
  if (recipe.expiringIngredients.length > 0) {
    return '<span class="recipe-status recipe-status-expiring">Uses expiring</span>';
  }
  return "";
}

function renderMatchMeter(recipe) {
  const variant = recipe.canMakeNow ? "full" : "partial";
  return `
    <div class="recipe-match" title="${recipe.matchPercent}% of ingredients on hand">
      <div class="recipe-match-track">
        <span
          class="recipe-match-fill recipe-match-fill-${variant}"
          style="width: ${recipe.matchPercent}%"
        ></span>
      </div>
      <span class="recipe-match-label">${recipe.matchPercent}% on hand</span>
    </div>
  `;
}

function renderCostBadge(recipe) {
  if (recipe.costPerServing !== null && recipe.costPerServing !== undefined) {
    return `<span class="recipe-cost-badge">~$${recipe.costPerServing.toFixed(2)}/serving</span>`;
  }
  if (recipe.estimatedCost !== null && recipe.estimatedCost !== undefined) {
    return `<span class="recipe-cost-badge">~$${recipe.estimatedCost.toFixed(2)} total</span>`;
  }
  return "";
}

function renderRecipeCard(recipe) {
  const isActive = recipe.id === selectedRecipeId;
  const costBadge = renderCostBadge(recipe);

  return `
    <article
      class="recipe-card${isActive ? " is-active" : ""}"
      data-recipe-id="${escapeHtml(recipe.id)}"
    >
      <div class="recipe-card-head">
        <h3 class="recipe-card-title">${escapeHtml(recipe.name)}</h3>
        ${renderStatusBadge(recipe)}
      </div>
      ${
        buildMetaParts(recipe).length
          ? `<p class="recipe-meta">${buildMetaParts(recipe).join(" · ")}${costBadge ? ` · ${costBadge}` : ""}</p>`
          : costBadge
            ? `<p class="recipe-meta">${costBadge}</p>`
            : ""
      }
      ${renderTagChips(recipe.tags)}
      <p class="recipe-reason">${escapeHtml(recipe.reason)}</p>
      ${renderMatchMeter(recipe)}
      <button
        type="button"
        class="btn btn-primary btn-sm view-recipe-btn"
        data-recipe-id="${escapeHtml(recipe.id)}"
      >
        View recipe
      </button>
    </article>
  `;
}

function buildQueryString() {
  const params = new URLSearchParams();
  const search = searchInput.value.trim();
  const tag = tagSelect.value;

  if (search) {
    params.set("search", search);
  }
  if (tag) {
    params.set("tag", tag);
  }
  if (readyToggle.checked) {
    params.set("ready", "true");
  }
  params.set("page", currentPage);

  const query = params.toString();
  return query ? `?${query}` : "";
}

// Page numbers to show: first, last, and a window around the current page,
// with "…" gaps where pages are skipped.
function pageWindow(page, totalPages) {
  const wanted = new Set([1, totalPages, page, page - 1, page + 1]);
  const pages = [...wanted]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);

  const out = [];
  let previous = 0;
  for (const value of pages) {
    if (value - previous > 1) {
      out.push("…");
    }
    out.push(value);
    previous = value;
  }
  return out;
}

function renderPagination(page, totalPages) {
  if (totalPages <= 1) {
    paginationEl.innerHTML = "";
    return;
  }

  const pageItem = (label, target, { disabled = false, active = false }) => `
    <li class="page-item${disabled ? " disabled" : ""}${active ? " active" : ""}">
      <button
        type="button"
        class="page-link"
        ${target === null ? "disabled" : `data-page="${target}"`}
        ${disabled ? "disabled" : ""}
        ${active ? 'aria-current="page"' : ""}
      >${label}</button>
    </li>
  `;

  const numbers = pageWindow(page, totalPages)
    .map((value) =>
      value === "…"
        ? pageItem("…", null, { disabled: true })
        : pageItem(value, value, { active: value === page })
    )
    .join("");

  paginationEl.innerHTML = `
    <ul class="pagination pagination-sm mb-0">
      ${pageItem("‹", page - 1, { disabled: page <= 1 })}
      ${numbers}
      ${pageItem("›", page + 1, { disabled: page >= totalPages })}
    </ul>
  `;
}

async function loadRecipes() {
  try {
    const response = await fetch(`/api/recipes${buildQueryString()}`);
    const { total, page, totalPages, recipes } = await response.json();

    // The server clamps the page to the available range; mirror that so the
    // pagination control highlights the page we actually landed on.
    currentPage = page;

    recipeCountEl.textContent = `${total} recipe${total === 1 ? "" : "s"}`;

    if (!recipes.length) {
      recipeListEl.innerHTML =
        '<p class="text-muted mb-0">No recipes match your filters. Try clearing them.</p>';
      paginationEl.innerHTML = "";
      return;
    }

    // Default the detail panel to the top recipe only on the very first load;
    // after that the selection persists across pages and filters.
    if (!selectedRecipeId) {
      selectedRecipeId = recipes[0].id;
    }

    recipeListEl.innerHTML = recipes.map(renderRecipeCard).join("");
    recipeListEl.scrollTop = 0;
    renderPagination(page, totalPages);

    await loadRecipeDetail(selectedRecipeId);
  } catch (error) {
    console.error("Failed to load recipes:", error);
    recipeListEl.innerHTML =
      '<p class="text-danger mb-0">Could not load recipes.</p>';
  }
}

// Reset to the first page and reload — used whenever a filter changes.
function reloadFromFirstPage() {
  currentPage = 1;
  loadRecipes();
}

function renderIngredientList(recipe) {
  const need = new Set(recipe.missingIngredients);
  const have = new Set(recipe.matchedIngredients);

  return recipe.ingredients
    .map((ingredient) => {
      let stateClass = "ingredient-staple";
      let note = "pantry staple";

      if (have.has(ingredient)) {
        stateClass = "ingredient-have";
        note = recipe.expiringIngredients.includes(ingredient)
          ? "on hand · expiring"
          : "on hand";
      } else if (need.has(ingredient)) {
        stateClass = "ingredient-need";
        note = "need to buy";
      }

      return `
        <li class="ingredient-row ${stateClass}">
          <span>${escapeHtml(ingredient)}</span>
          <span class="ingredient-note">${note}</span>
        </li>
      `;
    })
    .join("");
}

async function loadRecipeDetail(recipeId) {
  try {
    const response = await fetch(`/api/recipes/${recipeId}`);
    const recipe = await response.json();

    if (!response.ok) {
      throw new Error(recipe.error || "Failed to load recipe detail");
    }

    const atRiskNote =
      recipe.valueAtRisk > 0
        ? ` That's about $${recipe.valueAtRisk.toFixed(2)} of food saved.`
        : "";
    const expiringCallout = recipe.expiringIngredients.length
      ? `<p class="recipe-expiring-callout">
           Cook this soon — it uses
           <strong>${recipe.expiringIngredients
             .map(escapeHtml)
             .join(", ")}</strong>
           before ${recipe.expiringIngredients.length === 1 ? "it expires" : "they expire"}.${atRiskNote}
         </p>`
      : "";

    const notesBlock = recipe.notes
      ? `<p class="recipe-note">Tip: ${escapeHtml(recipe.notes)}</p>`
      : "";

    const metaParts = buildDetailMetaParts(recipe);
    const metaBlock = metaParts.length
      ? `<p class="recipe-meta mb-2">${metaParts.join(" · ")}</p>`
      : "";

    const imageBlock = recipe.image
      ? `<img
           class="recipe-detail-image"
           src="${escapeHtml(recipe.image)}"
           alt="${escapeHtml(recipe.name)}"
           loading="lazy"
         />`
      : "";

    const sourceBlock = recipe.source
      ? `<p class="recipe-source">Recipe from ${escapeHtml(recipe.source)}</p>`
      : "";

    const steps =
      recipe.instructions && recipe.instructions.length
        ? recipe.instructions
            .map((step) => `<li>${escapeHtml(step)}</li>`)
            .join("")
        : '<li class="text-muted">No steps provided for this recipe.</li>';

    recipeDetailEl.classList.remove("recipe-detail-empty", "text-muted");
    recipeDetailEl.innerHTML = `
      <div class="recipe-detail">
        <div class="recipe-detail-head">
          ${imageBlock}
          <h3 class="mb-1">${escapeHtml(recipe.name)}</h3>
          ${metaBlock}
          ${renderTagChips(recipe.tags)}
          ${renderMatchMeter(recipe)}
        </div>

        ${expiringCallout}

        <h4 class="recipe-detail-subhead">Ingredients</h4>
        <ul class="ingredient-list">
          ${renderIngredientList(recipe)}
        </ul>

        <h4 class="recipe-detail-subhead">Steps</h4>
        <ol class="recipe-steps">
          ${steps}
        </ol>

        ${notesBlock}
        ${sourceBlock}
      </div>
    `;
  } catch (error) {
    console.error("Failed to load recipe detail:", error);
  }
}

function setSelectedRecipe(recipeId) {
  if (!recipeId || recipeId === selectedRecipeId) {
    if (recipeId) {
      loadRecipeDetail(recipeId);
    }
    return;
  }

  selectedRecipeId = recipeId;
  document.querySelectorAll(".recipe-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.recipeId === recipeId);
  });
  loadRecipeDetail(recipeId);
}

async function loadShoppingSuggestions() {
  try {
    const response = await fetch("/api/recipes/shopping-suggestions");
    const suggestions = await response.json();
    const tableBody = document.getElementById("shopping-suggestions-table");

    tableBody.innerHTML = suggestions.length
      ? suggestions
          .map(
            (suggestion) => `
              <tr>
                <td>${escapeHtml(suggestion.item)}</td>
                <td class="text-muted">${escapeHtml(suggestion.reason)}</td>
              </tr>
            `
          )
          .join("")
      : '<tr><td colspan="2" class="text-muted">Your shelf already covers the top recipes. Nice.</td></tr>';
  } catch (error) {
    console.error("Failed to load shopping suggestions:", error);
  }
}

function daysUntil(dateString) {
  if (!dateString) {
    return null;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateString.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function renderUseByCell(expirationDate) {
  const days = daysUntil(expirationDate);
  if (days === null) {
    return `<td>${escapeHtml(expirationDate || "")}</td>`;
  }

  let label = `${days} days`;
  let variant = "good";
  if (days < 0) {
    label = "Expired";
    variant = "expired";
  } else if (days === 0) {
    label = "Today";
    variant = "urgent";
  } else if (days <= 2) {
    label = days === 1 ? "1 day" : `${days} days`;
    variant = "urgent";
  }

  return `
    <td>
      <span class="meal-prep-pill meal-prep-pill-${variant}">${label}</span>
    </td>
  `;
}

async function loadMealPrep() {
  try {
    const response = await fetch("/api/recipes/meal-prep");
    const items = await response.json();
    const tableBody = document.getElementById("meal-prep-table");

    tableBody.innerHTML = items.length
      ? items
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.name)}</td>
                <td class="text-muted">${escapeHtml(item.preparedDate || "")}</td>
                ${renderUseByCell(item.expirationDate)}
                <td class="text-end">
                  <button
                    type="button"
                    class="btn btn-danger btn-sm meal-prep-delete-btn"
                    data-id="${item._id}"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            `
          )
          .join("")
      : '<tr><td colspan="4" class="text-muted">No meal-prepped foods tracked yet.</td></tr>';
  } catch (error) {
    console.error("Failed to load meal prep items:", error);
  }
}

async function populateFilters() {
  try {
    const [tags, ingredients, listResponse] = await Promise.all([
      fetch("/api/recipes/tags").then((response) => response.json()),
      fetch("/api/recipes/ingredients").then((response) => response.json()),
      fetch("/api/recipes").then((response) => response.json()),
    ]);

    tagSelect.insertAdjacentHTML(
      "beforeend",
      tags
        .map(
          (tag) =>
            `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`
        )
        .join("")
    );

    // Ingredient autocomplete for the search box, backed by the ingredients
    // reference collection.
    const ingredientList = document.getElementById("recipe-ingredient-options");
    if (ingredientList) {
      ingredientList.innerHTML = ingredients
        .map((name) => `<option value="${escapeHtml(name)}"></option>`)
        .join("");
    }

    // The meal-prep dropdown lists the most relevant recipes (the makeable,
    // pantry-matched ones rank first)
    mealPrepRecipeSelect.insertAdjacentHTML(
      "beforeend",
      (listResponse.recipes ?? [])
        .map(
          (recipe) =>
            `<option value="${escapeHtml(recipe.id)}">${escapeHtml(recipe.name)}</option>`
        )
        .join("")
    );
  } catch (error) {
    console.error("Failed to populate filters:", error);
  }
}

recipeListEl.addEventListener("click", (event) => {
  const card = event.target.closest("[data-recipe-id]");
  if (card) {
    setSelectedRecipe(card.dataset.recipeId);
  }
});

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(reloadFromFirstPage, 200);
});

tagSelect.addEventListener("change", reloadFromFirstPage);
readyToggle.addEventListener("change", reloadFromFirstPage);

clearFiltersBtn.addEventListener("click", () => {
  searchInput.value = "";
  tagSelect.value = "";
  readyToggle.checked = false;
  reloadFromFirstPage();
});

paginationEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-page]");
  if (!button) {
    return;
  }
  const page = Number(button.dataset.page);
  if (page && page !== currentPage) {
    currentPage = page;
    loadRecipes();
  }
});

mealPrepForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const recipeId = mealPrepRecipeSelect.value || null;
  const selectedRecipe = recipeId
    ? mealPrepRecipeSelect.options[mealPrepRecipeSelect.selectedIndex].text
    : "";
  const nameField = document.getElementById("meal-prep-name");

  // Borrow the recipe name if the meal field was left blank.
  const name = nameField.value.trim() || selectedRecipe;
  if (!name) {
    nameField.focus();
    return;
  }

  try {
    const response = await fetch("/api/recipes/meal-prep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        preparedDate: document.getElementById("meal-prep-date").value,
        expirationDate: document.getElementById("meal-prep-expiration").value,
        recipeId,
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

document
  .getElementById("meal-prep-table")
  .addEventListener("click", async (event) => {
    const button = event.target.closest(".meal-prep-delete-btn");
    if (!button) {
      return;
    }

    if (!confirm("Delete this meal-prepped item?")) {
      return;
    }

    try {
      await fetch(`/api/recipes/meal-prep/${button.dataset.id}`, {
        method: "DELETE",
      });
      await loadMealPrep();
    } catch (error) {
      console.error("Failed to delete meal prep item:", error);
    }
  });

// Split a textarea or comma-separated field into a trimmed list of entries.
function splitLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitCommas(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

addRecipeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const errorEl = document.getElementById("add-recipe-error");
  errorEl.classList.add("d-none");

  const payload = {
    name: document.getElementById("add-recipe-name").value.trim(),
    tags: splitCommas(document.getElementById("add-recipe-tags").value),
    prepTimeMinutes: document.getElementById("add-recipe-prep").value,
    cookTimeMinutes: document.getElementById("add-recipe-cook").value,
    servings: document.getElementById("add-recipe-servings").value,
    difficulty: document.getElementById("add-recipe-difficulty").value,
    ingredients: splitLines(
      document.getElementById("add-recipe-ingredients").value
    ),
    instructions: splitLines(
      document.getElementById("add-recipe-instructions").value
    ),
    notes: document.getElementById("add-recipe-notes").value.trim(),
    mealPrepFriendly: document.getElementById("add-recipe-mealprep").checked,
  };

  try {
    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const created = await response.json();

    if (!response.ok) {
      throw new Error(created.error || "Failed to save recipe");
    }

    addRecipeForm.reset();
    if (addRecipeModalEl && window.bootstrap) {
      window.bootstrap.Modal.getOrCreateInstance(addRecipeModalEl).hide();
    }

    // Clear filters and jump to the new recipe so the user sees it right away.
    searchInput.value = "";
    tagSelect.value = "";
    readyToggle.checked = false;
    selectedRecipeId = created.id;
    currentPage = 1;
    await Promise.all([loadRecipes(), loadShoppingSuggestions()]);
  } catch (error) {
    console.error("Failed to add recipe:", error);
    errorEl.textContent = error.message;
    errorEl.classList.remove("d-none");
  }
});

populateFilters();
loadRecipes();
loadShoppingSuggestions();
loadMealPrep();
