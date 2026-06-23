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
const addRecipeTrigger = document.getElementById("add-recipe-trigger");
const mealPrepQuantityInput = document.getElementById("meal-prep-quantity");
const mealPrepUnitSelect = document.getElementById("meal-prep-unit");

// Units that make sense for batch-cooked food.
const MEAL_UNITS = ["servings", "portions", "containers", "meals"];

let selectedRecipeId = null;
let searchDebounce = null;
let currentPage = 1;
let mealPrepItems = [];
let editingMealPrepId = null;
// The recipe currently shown in the detail panel, kept so the edit form can be
// pre-filled. `editingRecipeId` is the slug being edited, or null when adding.
let currentDetailRecipe = null;
let editingRecipeId = null;

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
  const measures = recipe.measures ?? [];

  return recipe.ingredients
    .map((ingredient, index) => {
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

      const measure = (measures[index] || "").trim();
      const amount = measure
        ? `<span class="ingredient-amount">${escapeHtml(measure)}</span> `
        : "";

      return `
        <li class="ingredient-row ${stateClass}">
          <span>${amount}${escapeHtml(ingredient)}</span>
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

    currentDetailRecipe = recipe;

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
          <div class="recipe-detail-title-row">
            <h3 class="mb-1">${escapeHtml(recipe.name)}</h3>
            <div class="recipe-detail-actions">
              ${
                recipe.matchedIngredients.length
                  ? `<button type="button" class="btn btn-success btn-sm recipe-cook-btn">
                       Cook this
                     </button>`
                  : ""
              }
              <button
                type="button"
                class="btn btn-warning btn-sm recipe-edit-btn"
              >
                Edit
              </button>
            </div>
          </div>
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
                <td class="text-end">
                  <button
                    type="button"
                    class="btn btn-success btn-sm shopping-add-btn"
                    data-item="${escapeHtml(suggestion.item)}"
                  >
                    Add to pantry
                  </button>
                </td>
              </tr>
            `
          )
          .join("")
      : '<tr><td colspan="3" class="text-muted">Your shelf already covers the top recipes. Nice.</td></tr>';
  } catch (error) {
    console.error("Failed to load shopping suggestions:", error);
  }
}

function todayString() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function addSuggestionToPantry(itemName, button) {
  button.disabled = true;
  button.textContent = "Adding…";

  try {
    const response = await fetch("/api/shelf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: itemName,
        category: "Other",
        quantity: 1,
        quantityUnit: "item",
        cost: null,
        storedDate: todayString(),
        expirationDate: null,
      }),
    });

    if (!response.ok) {
      throw new Error("failed to add to pantry");
    }

    // The new shelf item changes what's matched/missing, so refresh the views
    // that depend on the pantry. The item drops off the list once it's covered.
    await Promise.all([loadShoppingSuggestions(), loadRecipes()]);
  } catch (error) {
    console.error("Failed to add suggestion to pantry:", error);
    button.disabled = false;
    button.textContent = "Add to pantry";
  }
}

document
  .getElementById("shopping-suggestions-table")
  .addEventListener("click", (event) => {
    const button = event.target.closest(".shopping-add-btn");
    if (button) {
      addSuggestionToPantry(button.dataset.item, button);
    }
  });

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

function formatMealQuantity(item) {
  if (item.quantity === null || item.quantity === undefined) {
    return '<span class="text-muted">—</span>';
  }
  return `${escapeHtml(item.quantity)} ${escapeHtml(item.quantityUnit || "")}`.trim();
}

function renderUnitOptions(selected) {
  return MEAL_UNITS.map(
    (unit) =>
      `<option value="${unit}"${unit === selected ? " selected" : ""}>${unit}</option>`
  ).join("");
}

// A meal-prep row in its normal (read) state.
function renderMealPrepRow(item) {
  return `
    <tr data-id="${item._id}">
      <td>${escapeHtml(item.name)}</td>
      <td>${formatMealQuantity(item)}</td>
      <td class="text-muted">${escapeHtml(item.preparedDate || "")}</td>
      ${renderUseByCell(item.expirationDate)}
      <td class="text-end">
        <button
          type="button"
          class="btn btn-warning btn-sm meal-prep-edit-btn"
          data-id="${item._id}"
        >
          Edit
        </button>
        <button
          type="button"
          class="btn btn-danger btn-sm meal-prep-delete-btn"
          data-id="${item._id}"
        >
          Delete
        </button>
      </td>
    </tr>
  `;
}

// A meal-prep row swapped into inline-edit inputs.
function renderMealPrepEditRow(item) {
  return `
    <tr data-id="${item._id}" class="meal-prep-editing">
      <td>
        <input
          type="text"
          class="form-control form-control-sm meal-prep-edit-name"
          value="${escapeHtml(item.name)}"
        />
      </td>
      <td>
        <div class="input-group input-group-sm meal-prep-edit-qty-group">
          <input
            type="number"
            class="form-control meal-prep-edit-quantity"
            value="${item.quantity ?? ""}"
            min="0"
            step="any"
          />
          <select class="form-select meal-prep-edit-unit" aria-label="Quantity unit">
            ${renderUnitOptions(item.quantityUnit || MEAL_UNITS[0])}
          </select>
        </div>
      </td>
      <td>
        <input
          type="date"
          class="form-control form-control-sm meal-prep-edit-prepared"
          value="${item.preparedDate || ""}"
        />
      </td>
      <td>
        <input
          type="date"
          class="form-control form-control-sm meal-prep-edit-expiration"
          value="${item.expirationDate || ""}"
        />
      </td>
      <td class="text-end">
        <button
          type="button"
          class="btn btn-success btn-sm meal-prep-save-btn"
          data-id="${item._id}"
        >
          Save
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm meal-prep-cancel-btn"
        >
          Cancel
        </button>
      </td>
    </tr>
  `;
}

function renderMealPrepTable() {
  const tableBody = document.getElementById("meal-prep-table");

  if (!mealPrepItems.length) {
    tableBody.innerHTML =
      '<tr><td colspan="5" class="text-muted">No meal-prepped foods tracked yet.</td></tr>';
    return;
  }

  tableBody.innerHTML = mealPrepItems
    .map((item) =>
      item._id === editingMealPrepId
        ? renderMealPrepEditRow(item)
        : renderMealPrepRow(item)
    )
    .join("");
}

async function loadMealPrep() {
  try {
    const response = await fetch("/api/recipes/meal-prep");
    mealPrepItems = await response.json();
    renderMealPrepTable();
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
        quantity: mealPrepQuantityInput.value,
        quantityUnit: mealPrepUnitSelect.value,
        preparedDate: document.getElementById("meal-prep-date").value,
        expirationDate: document.getElementById("meal-prep-expiration").value,
        recipeId,
      }),
    });

    if (!response.ok) {
      throw new Error("failed to add meal prep item");
    }

    mealPrepForm.reset();
    mealPrepUnitSelect.value = MEAL_UNITS[0];
    await loadMealPrep();
  } catch (error) {
    console.error("Failed to submit meal prep form:", error);
  }
});

async function saveMealPrepEdit(id) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (!row) {
    return;
  }

  const name = row.querySelector(".meal-prep-edit-name").value.trim();
  const preparedDate = row.querySelector(".meal-prep-edit-prepared").value;
  const expirationDate = row.querySelector(".meal-prep-edit-expiration").value;
  if (!name || !preparedDate || !expirationDate) {
    return;
  }

  try {
    const response = await fetch(`/api/recipes/meal-prep/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        quantity: row.querySelector(".meal-prep-edit-quantity").value,
        quantityUnit: row.querySelector(".meal-prep-edit-unit").value,
        preparedDate,
        expirationDate,
      }),
    });

    if (!response.ok) {
      throw new Error("failed to update meal prep item");
    }

    editingMealPrepId = null;
    await loadMealPrep();
  } catch (error) {
    console.error("Failed to update meal prep item:", error);
  }
}

document
  .getElementById("meal-prep-table")
  .addEventListener("click", async (event) => {
    const editBtn = event.target.closest(".meal-prep-edit-btn");
    if (editBtn) {
      editingMealPrepId = editBtn.dataset.id;
      renderMealPrepTable();
      return;
    }

    if (event.target.closest(".meal-prep-cancel-btn")) {
      editingMealPrepId = null;
      renderMealPrepTable();
      return;
    }

    const saveBtn = event.target.closest(".meal-prep-save-btn");
    if (saveBtn) {
      await saveMealPrepEdit(saveBtn.dataset.id);
      return;
    }

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
      if (editingMealPrepId === button.dataset.id) {
        editingMealPrepId = null;
      }
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

// Parse the ingredients textarea. Each non-empty line is "amount | name" or
// just "name"; returns aligned ingredients[] and measures[] arrays.
function parseIngredientLines(value) {
  const ingredients = [];
  const measures = [];

  value.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }
    const sep = line.indexOf("|");
    const measure = sep >= 0 ? line.slice(0, sep).trim() : "";
    const name = sep >= 0 ? line.slice(sep + 1).trim() : line;
    if (!name) {
      return;
    }
    ingredients.push(name);
    measures.push(measure);
  });

  return { ingredients, measures };
}

// Rebuild textarea lines from stored ingredients + measures for editing.
function ingredientsToText(recipe) {
  const measures = recipe.measures ?? [];
  return (recipe.ingredients ?? [])
    .map((name, index) => {
      const measure = (measures[index] || "").trim();
      return measure ? `${measure} | ${name}` : name;
    })
    .join("\n");
}

function setRecipeFormValue(id, value) {
  document.getElementById(id).value = value ?? "";
}

// Switch the shared modal between "add" and "edit" modes. Pass a recipe to
// pre-fill the form for editing, or nothing to start a blank new recipe.
function setRecipeFormMode(recipe) {
  const title = document.getElementById("add-recipe-title");
  // The submit button lives in the modal footer (outside the <form>, linked by
  // the form attribute), so query the modal rather than the form.
  const submit = addRecipeModalEl.querySelector('button[type="submit"]');
  document.getElementById("add-recipe-error").classList.add("d-none");

  if (recipe) {
    editingRecipeId = recipe.id;
    title.textContent = "Edit recipe";
    submit.textContent = "Update recipe";

    setRecipeFormValue("add-recipe-name", recipe.name);
    setRecipeFormValue("add-recipe-tags", (recipe.tags ?? []).join(", "));
    setRecipeFormValue("add-recipe-prep", recipe.prepTimeMinutes);
    setRecipeFormValue("add-recipe-cook", recipe.cookTimeMinutes);
    setRecipeFormValue("add-recipe-servings", recipe.servings);
    setRecipeFormValue("add-recipe-difficulty", recipe.difficulty ?? "");
    setRecipeFormValue("add-recipe-ingredients", ingredientsToText(recipe));
    setRecipeFormValue(
      "add-recipe-instructions",
      (recipe.instructions ?? []).join("\n")
    );
    setRecipeFormValue("add-recipe-notes", recipe.notes ?? "");
    document.getElementById("add-recipe-mealprep").checked = Boolean(
      recipe.mealPrepFriendly
    );
  } else {
    editingRecipeId = null;
    title.textContent = "Add your own recipe";
    submit.textContent = "Save recipe";
    addRecipeForm.reset();
  }
}

addRecipeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const errorEl = document.getElementById("add-recipe-error");
  errorEl.classList.add("d-none");

  const { ingredients, measures } = parseIngredientLines(
    document.getElementById("add-recipe-ingredients").value
  );

  const payload = {
    name: document.getElementById("add-recipe-name").value.trim(),
    tags: splitCommas(document.getElementById("add-recipe-tags").value),
    prepTimeMinutes: document.getElementById("add-recipe-prep").value,
    cookTimeMinutes: document.getElementById("add-recipe-cook").value,
    servings: document.getElementById("add-recipe-servings").value,
    difficulty: document.getElementById("add-recipe-difficulty").value,
    ingredients,
    measures,
    instructions: splitLines(
      document.getElementById("add-recipe-instructions").value
    ),
    notes: document.getElementById("add-recipe-notes").value.trim(),
    mealPrepFriendly: document.getElementById("add-recipe-mealprep").checked,
  };

  const editing = Boolean(editingRecipeId);
  const url = editing ? `/api/recipes/${editingRecipeId}` : "/api/recipes";

  try {
    const response = await fetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const saved = await response.json();

    if (!response.ok) {
      throw new Error(saved.error || "Failed to save recipe");
    }

    if (addRecipeModalEl && window.bootstrap) {
      window.bootstrap.Modal.getOrCreateInstance(addRecipeModalEl).hide();
    }

    // Show the saved recipe. When editing, keep the current filters/page; when
    // adding, clear filters and jump to the top so the new recipe is visible.
    selectedRecipeId = saved.id;
    if (!editing) {
      searchInput.value = "";
      tagSelect.value = "";
      readyToggle.checked = false;
      currentPage = 1;
    }
    setRecipeFormMode(null);
    await Promise.all([loadRecipes(), loadShoppingSuggestions()]);
  } catch (error) {
    console.error("Failed to save recipe:", error);
    errorEl.textContent = error.message;
    errorEl.classList.remove("d-none");
  }
});

// Briefly show a success note at the top of the detail panel.
function flashDetail(message) {
  const note = document.createElement("div");
  note.className = "alert alert-success py-2 px-3 mb-3";
  note.setAttribute("role", "status");
  note.textContent = message;
  recipeDetailEl.prepend(note);
  setTimeout(() => note.remove(), 5000);
}

async function cookRecipe(id) {
  if (
    !confirm("Cook this recipe and use the matching items from your pantry?")
  ) {
    return;
  }

  try {
    const response = await fetch(`/api/recipes/${id}/cook`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Failed to cook recipe");
    }

    // The shelf changed, so refresh everything that depends on it. loadRecipes
    // re-renders the detail panel for the still-selected recipe.
    selectedRecipeId = id;
    await Promise.all([loadRecipes(), loadShoppingSuggestions()]);

    const parts = [];
    if (result.reduced?.length) {
      parts.push(`used some ${result.reduced.join(", ")}`);
    }
    if (result.usedUp?.length) {
      parts.push(`finished off ${result.usedUp.join(", ")}`);
    }
    flashDetail(
      parts.length
        ? `Cooked — ${parts.join(", and ")}. Check your pantry.`
        : "Nothing matching was on your shelf to use."
    );
  } catch (error) {
    console.error("Failed to cook recipe:", error);
  }
}

// "+ Add recipe" starts a blank form; the detail panel's Edit button pre-fills.
addRecipeTrigger.addEventListener("click", () => setRecipeFormMode(null));

recipeDetailEl.addEventListener("click", (event) => {
  if (event.target.closest(".recipe-edit-btn") && currentDetailRecipe) {
    setRecipeFormMode(currentDetailRecipe);
    window.bootstrap.Modal.getOrCreateInstance(addRecipeModalEl).show();
    return;
  }

  if (event.target.closest(".recipe-cook-btn") && currentDetailRecipe) {
    cookRecipe(currentDetailRecipe.id);
  }
});

mealPrepUnitSelect.innerHTML = renderUnitOptions(MEAL_UNITS[0]);

populateFilters();
loadRecipes();
loadShoppingSuggestions();
loadMealPrep();
