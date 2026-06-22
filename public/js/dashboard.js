import {
  renderCategoryChart,
  refreshSavingsChart,
  refreshWasteMap,
} from "./insights.js";
import {
  getDaysUntilExpiration,
  getCostLostPerDay,
  applyShelfSort,
  normalizeFilterText,
  filterShelfItems,
} from "./shelf-filters.js";

let editingItemId = null;
let allShelfItems = [];
let shelfSort = { column: null, direction: null };
let shelfPage = 1;
const SHELF_PAGE_SIZE = 25;

const SORT_ARROW_NEUTRAL = "↕";
const SORT_ARROW_ASC = "↑";
const SORT_ARROW_DESC = "↓";

const QUANTITY_UNIT_GROUPS = [
  {
    label: "Weight",
    units: [
      { value: "oz", label: "oz (ounce)" },
      { value: "lb", label: "lb (pound)" },
      { value: "g", label: "g (gram)" },
      { value: "kg", label: "kg (kilogram)" },
    ],
  },
  {
    label: "Volume",
    units: [
      { value: "tsp", label: "tsp (teaspoon)" },
      { value: "tbsp", label: "tbsp (tablespoon)" },
      { value: "cup", label: "cup" },
      { value: "fl oz", label: "fl oz (fluid ounce)" },
      { value: "ml", label: "ml (milliliter)" },
      { value: "L", label: "L (liter)" },
      { value: "pint", label: "pint" },
      { value: "quart", label: "quart" },
      { value: "gallon", label: "gallon" },
    ],
  },
  {
    label: "Count",
    units: [
      { value: "item", label: "item" },
      { value: "piece", label: "piece" },
      { value: "slice", label: "slice" },
      { value: "head", label: "head" },
      { value: "bunch", label: "bunch" },
      { value: "clove", label: "clove" },
      { value: "stalk", label: "stalk" },
      { value: "sprig", label: "sprig" },
      { value: "ear", label: "ear" },
      { value: "fillet", label: "fillet" },
    ],
  },
  {
    label: "Packaging",
    units: [
      { value: "can", label: "can" },
      { value: "bottle", label: "bottle" },
      { value: "jar", label: "jar" },
      { value: "bag", label: "bag" },
      { value: "box", label: "box" },
      { value: "carton", label: "carton" },
      { value: "package", label: "package" },
      { value: "container", label: "container" },
    ],
  },
];

const DEFAULT_QUANTITY_UNIT = "item";

const FOOD_CATEGORIES = [
  "Produce",
  "Dairy & Eggs",
  "Meat & Seafood",
  "Grains & Bakery",
  "Pantry & Canned",
  "Frozen",
  "Beverages",
  "Snacks",
  "Condiments & Sauces",
  "Other",
];

const DEFAULT_CATEGORY = "Uncategorized";

function escapeHtml(text) {
  if (!text) {
    return "";
  }
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderQuantityUnitOptions(selectedUnit = DEFAULT_QUANTITY_UNIT) {
  return QUANTITY_UNIT_GROUPS.map(
    (group) => `
      <optgroup label="${group.label}">
        ${group.units
          .map(
            (unit) => `
              <option value="${unit.value}"${
                unit.value === selectedUnit ? " selected" : ""
              }>
                ${unit.label}
              </option>
            `
          )
          .join("")}
      </optgroup>
    `
  ).join("");
}

function renderCategoryOptions(selected = "") {
  const categories = [...FOOD_CATEGORIES];

  // Preserve a legacy/unknown value so editing an old item doesn't silently
  // re-categorize it.
  if (selected && !categories.includes(selected)) {
    categories.unshift(selected);
  }

  return categories
    .map(
      (category) =>
        `<option value="${escapeHtml(category)}"${
          category === selected ? " selected" : ""
        }>${escapeHtml(category)}</option>`
    )
    .join("");
}

function formatQuantity(food) {
  const quantity = food.quantity;
  const unit = food.quantityUnit || DEFAULT_QUANTITY_UNIT;

  if (quantity === null || quantity === undefined || quantity === "") {
    return "—";
  }

  return `${quantity} ${unit}`;
}

// Short urgency label driven purely by days remaining.
function getPriorityLabel(food) {
  const daysLeft = getDaysUntilExpiration(food.expirationDate);

  if (daysLeft === null) {
    return "—";
  }

  if (daysLeft < 0) {
    return "Expired";
  }

  if (daysLeft === 0) {
    return "Use today";
  }

  return daysLeft === 1 ? "1 day" : `${daysLeft} days`;
}

// Dollar value at stake if the item spoils — used as supporting context.
function getValueAtRisk(food) {
  const cost = Number(food.cost);
  return Number.isNaN(cost) ? 0 : cost;
}

// Plain-text version of the priority cell, for search matching.
function formatPriorityText(food) {
  const label = getPriorityLabel(food);
  const atRisk = getValueAtRisk(food);

  if (label === "—") {
    return label;
  }

  return atRisk > 0 ? `${label} $${atRisk.toFixed(2)} at risk` : label;
}

// Badge + at-risk dollars. Badge color mirrors the row's expiry state so the
// priority reads at a glance, while the cost-weighted sort stays under the hood.
function renderPriorityCell(food) {
  const label = getPriorityLabel(food);

  if (label === "—") {
    return '<span class="text-muted">—</span>';
  }

  const rowClass = getShelfRowClass(food);
  const variant =
    rowClass === "shelf-row-expired"
      ? "expired"
      : rowClass === "shelf-row-urgent"
        ? "urgent"
        : "good";

  const atRisk = getValueAtRisk(food);
  const atRiskHtml =
    atRisk > 0
      ? `<span class="priority-at-risk">$${atRisk.toFixed(2)} at risk</span>`
      : "";

  return `
    <span class="priority-cell">
      <span class="priority-badge priority-badge-${variant}">${escapeHtml(label)}</span>
      ${atRiskHtml}
    </span>
  `;
}

function getShelfRowClass(food) {
  const daysLeft = getDaysUntilExpiration(food.expirationDate);

  if (daysLeft === null) {
    return "";
  }

  if (daysLeft < 0) {
    return "shelf-row-expired";
  }

  if (daysLeft <= 7) {
    return "shelf-row-urgent";
  }

  return "shelf-row-good";
}

function getShelfSortValue(food, column) {
  switch (column) {
    case "priority": {
      const value = getCostLostPerDay(food);
      return value === null ? null : value;
    }
    case "food":
      return (food.name || "").toLowerCase();
    case "category":
      return (food.category || DEFAULT_CATEGORY).toLowerCase();
    case "quantity":
      return food.quantity === null ||
        food.quantity === undefined ||
        food.quantity === ""
        ? null
        : Number(food.quantity);
    case "cost":
      return food.cost === null || food.cost === undefined || food.cost === ""
        ? null
        : Number(food.cost);
    case "expirationDate":
      return food.expirationDate || null;
    case "storedDate":
      return food.storedDate || null;
    default:
      return null;
  }
}

function updateShelfSortIndicators() {
  document.querySelectorAll(".shelf-sort-btn").forEach((btn) => {
    const arrow = btn.querySelector(".shelf-sort-arrow");
    if (!arrow) {
      return;
    }

    if (shelfSort.column === btn.dataset.sort) {
      btn.classList.add("is-active");
      arrow.textContent =
        shelfSort.direction === "desc" ? SORT_ARROW_DESC : SORT_ARROW_ASC;
    } else {
      btn.classList.remove("is-active");
      arrow.textContent = SORT_ARROW_NEUTRAL;
    }
  });
}

function toggleShelfSort(column) {
  if (shelfSort.column !== column) {
    shelfSort = { column, direction: "asc" };
  } else if (shelfSort.direction === "asc") {
    shelfSort = { column, direction: "desc" };
  } else {
    shelfSort = { column: null, direction: null };
  }

  shelfPage = 1;
  updateShelfSortIndicators();
  renderShelfTable();
}

function getShelfSearchText(food) {
  return [
    formatPriorityText(food),
    food.name,
    food.category || DEFAULT_CATEGORY,
    formatQuantity(food),
    formatCost(food.cost),
    food.expirationDate,
    food.storedDate,
  ]
    .join(" ")
    .toLowerCase();
}

function getShelfSearchTerm() {
  const searchInput = document.getElementById("shelf-search-input");
  return normalizeFilterText(searchInput?.value);
}

// Page numbers to show: first, last, and a window around the current page,
// with "…" gaps where pages are skipped. Mirrors the recipe pagination logic.
function shelfPageWindow(page, totalPages) {
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

function renderShelfPagination(page, totalPages) {
  const paginationEl = document.getElementById("shelf-pagination");
  if (!paginationEl) {
    return;
  }

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

  const numbers = shelfPageWindow(page, totalPages)
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

function updateShelfResultsNote(visibleCount, totalCount, searchTerm) {
  const resultsNote = document.getElementById("shelf-results-note");
  if (!resultsNote) {
    return;
  }

  if (!searchTerm) {
    resultsNote.textContent =
      totalCount === 1 ? "Showing 1 item." : `Showing ${totalCount} items.`;
    return;
  }

  if (visibleCount === 0) {
    resultsNote.textContent = "No items match your search.";
    return;
  }

  resultsNote.textContent = `Showing ${visibleCount} of ${totalCount} items.`;
}

function renderShelfTable() {
  const tableBody = document.getElementById("shelf-table-body");
  const searchTerm = getShelfSearchTerm();
  const sortedShelf = applyShelfSort(
    allShelfItems,
    shelfSort,
    getShelfSortValue
  );
  const visibleShelf = filterShelfItems(sortedShelf, {
    searchTerm,
    getSearchText: getShelfSearchText,
    keepId: editingItemId,
  });

  updateShelfResultsNote(visibleShelf.length, allShelfItems.length, searchTerm);

  if (visibleShelf.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center text-muted py-4">
          No items match your search.
        </td>
      </tr>
    `;
    renderShelfPagination(1, 1);
    return;
  }

  const totalPages = Math.ceil(visibleShelf.length / SHELF_PAGE_SIZE);

  // If the item being edited falls on a different page, jump to it.
  if (editingItemId) {
    const editingIndex = visibleShelf.findIndex(
      (food) => food._id === editingItemId
    );
    if (editingIndex !== -1) {
      shelfPage = Math.floor(editingIndex / SHELF_PAGE_SIZE) + 1;
    }
  }

  shelfPage = Math.max(1, Math.min(shelfPage, totalPages));

  const start = (shelfPage - 1) * SHELF_PAGE_SIZE;
  const pageItems = visibleShelf.slice(start, start + SHELF_PAGE_SIZE);

  tableBody.innerHTML = pageItems
    .map((food, index) => renderShelfRow(food, start + index))
    .join("");

  renderShelfPagination(shelfPage, totalPages);
}

function clearShelfSearch() {
  const searchInput = document.getElementById("shelf-search-input");
  if (searchInput) {
    searchInput.value = "";
  }

  shelfPage = 1;
  renderShelfTable();
}

function clearShelfFilters() {
  const searchInput = document.getElementById("shelf-search-input");
  if (searchInput) {
    searchInput.value = "";
  }

  shelfSort = { column: null, direction: null };
  shelfPage = 1;
  updateShelfSortIndicators();
  renderShelfTable();
}

function formatCost(cost) {
  if (cost === null || cost === undefined || cost === "") {
    return "—";
  }

  const amount = Number(cost);
  if (Number.isNaN(amount)) {
    return "—";
  }

  return `$${amount.toFixed(2)}`;
}

function parseQuantityValue(value) {
  if (value === "") {
    return null;
  }

  const quantity = Number(value);
  return Number.isNaN(quantity) ? null : quantity;
}

function parseCostValue(value) {
  if (value === "") {
    return null;
  }

  const cost = Number(value);
  return Number.isNaN(cost) ? null : cost;
}

function getShelfItemPayload({
  name,
  storedDate,
  expirationDate,
  quantity,
  quantityUnit,
  cost,
  category,
}) {
  return {
    name,
    storedDate,
    expirationDate,
    quantity: parseQuantityValue(quantity),
    quantityUnit: quantityUnit || DEFAULT_QUANTITY_UNIT,
    cost: parseCostValue(cost),
    category: category || DEFAULT_CATEGORY,
  };
}

function renderQuantityFields(food) {
  const quantity = food.quantity ?? "";
  const unit = food.quantityUnit || DEFAULT_QUANTITY_UNIT;

  return `
    <div class="inline-quantity-fields">
      <input
        type="number"
        class="form-control form-control-sm inline-edit-quantity"
        value="${quantity}"
        min="0"
        step="any"
        placeholder="Amount"
      />
      <select class="form-select form-select-sm inline-edit-unit">
        ${renderQuantityUnitOptions(unit)}
      </select>
    </div>
  `;
}

function renderShelfRow(food, index) {
  const isEditing = editingItemId === food._id;
  const rowClass = getShelfRowClass(food);

  if (isEditing) {
    const cost = food.cost ?? "";

    return `
      <tr class="${rowClass}" data-id="${food._id}">
        <td>${index + 1}</td>
        <td>—</td>
        <td>
          <input
            type="text"
            class="form-control form-control-sm inline-edit-name"
            value="${escapeHtml(food.name)}"
          />
        </td>
        <td>
          <select class="form-select form-select-sm inline-edit-category">
            ${renderCategoryOptions(food.category || "")}
          </select>
        </td>
        <td>${renderQuantityFields(food)}</td>
        <td>
          <div class="input-group input-group-sm inline-cost-field">
            <span class="input-group-text">$</span>
            <input
              type="number"
              class="form-control inline-edit-cost"
              value="${cost}"
              min="0"
              step="0.01"
              placeholder="0.00"
            />
          </div>
        </td>
        <td>
          <input
            type="date"
            class="form-control form-control-sm inline-edit-stored"
            value="${food.storedDate || ""}"
          />
        </td>
        <td>
          <input
            type="date"
            class="form-control form-control-sm inline-edit-expiration"
            value="${food.expirationDate || ""}"
          />
        </td>
        <td>
          <button
            class="btn btn-success btn-sm save-btn"
            data-id="${food._id}">
            Save
          </button>
          <button
            class="btn btn-secondary btn-sm cancel-btn"
            data-id="${food._id}">
            Cancel
          </button>
        </td>
      </tr>
    `;
  }

  return `
    <tr class="${rowClass}" data-id="${food._id}">
      <td>${index + 1}</td>
      <td>${renderPriorityCell(food)}</td>
      <td>${escapeHtml(food.name)}</td>
      <td>${escapeHtml(food.category || DEFAULT_CATEGORY)}</td>
      <td>${formatQuantity(food)}</td>
      <td>${formatCost(food.cost)}</td>
      <td>${food.storedDate || ""}</td>
      <td>${food.expirationDate || ""}</td>
      <td>
        <button
          class="btn btn-warning btn-sm edit-btn"
          data-id="${food._id}">
          Edit
        </button>
        <button
          class="btn btn-danger btn-sm delete-btn"
          data-id="${food._id}">
          Delete
        </button>
      </td>
    </tr>
  `;
}

function readShelfFieldsFromRow(row) {
  return getShelfItemPayload({
    name: row.querySelector(".inline-edit-name").value.trim(),
    expirationDate: row.querySelector(".inline-edit-expiration").value,
    storedDate: row.querySelector(".inline-edit-stored").value,
    quantity: row.querySelector(".inline-edit-quantity").value,
    quantityUnit: row.querySelector(".inline-edit-unit").value,
    cost: row.querySelector(".inline-edit-cost").value,
    category: row.querySelector(".inline-edit-category").value,
  });
}

async function loadShelfData() {
  try {
    const response = await fetch("/api/shelf");
    allShelfItems = await response.json();
    renderShelfTable();
    renderCategoryChart(allShelfItems);
  } catch (error) {
    console.error("Failed to load shelf data:", error);
  }
}

function renderMealPrepUseBy(expirationDate) {
  const days = getDaysUntilExpiration(expirationDate);
  if (days === null) {
    return `<span class="text-muted">${escapeHtml(expirationDate || "—")}</span>`;
  }

  let label = `${days} day${days === 1 ? "" : "s"}`;
  let variant = "good";
  if (days < 0) {
    label = "Expired";
    variant = "expired";
  } else if (days === 0) {
    label = "Today";
    variant = "urgent";
  } else if (days <= 2) {
    variant = "urgent";
  }

  return `<span class="meal-prep-pill meal-prep-pill-${variant}">${label}</span>`;
}

async function loadMealPrepSection() {
  const container = document.getElementById("meal-prep-dashboard-body");
  if (!container) {
    return;
  }

  try {
    const response = await fetch("/api/recipes/meal-prep");
    const items = await response.json();

    if (!items.length) {
      container.innerHTML =
        '<p class="text-muted small mb-0">No meal-prepped food tracked yet. Add some on the <a href="/recipes.html">Recipes page</a>.</p>';
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table meal-prep-dashboard-table mb-0">
          <thead>
            <tr>
              <th>Meal</th>
              <th>Prepared</th>
              <th>Use by</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item) => `
              <tr>
                <td>${escapeHtml(item.name)}</td>
                <td class="text-muted">${escapeHtml(item.preparedDate || "—")}</td>
                <td>${renderMealPrepUseBy(item.expirationDate)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    console.error("Failed to load meal prep section:", error);
    container.innerHTML =
      '<p class="text-danger small mb-0">Could not load meal prep items.</p>';
  }
}

const addItemForm = document.getElementById("add-item-form");
const quantityUnitInput = document.getElementById("quantity-unit-input");
const categoryInput = document.getElementById("category-input");
const shelfSearchInput = document.getElementById("shelf-search-input");
const shelfClearSearchBtn = document.getElementById("shelf-clear-search-btn");
const shelfClearFiltersBtn = document.getElementById("shelf-clear-filters-btn");

quantityUnitInput.innerHTML = renderQuantityUnitOptions();
categoryInput.innerHTML = renderCategoryOptions();

shelfSearchInput.addEventListener("input", () => {
  shelfPage = 1;
  renderShelfTable();
});
document.querySelectorAll(".shelf-sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => toggleShelfSort(btn.dataset.sort));
});
shelfClearSearchBtn.addEventListener("click", clearShelfSearch);
shelfClearFiltersBtn.addEventListener("click", clearShelfFilters);

document
  .getElementById("shelf-pagination")
  .addEventListener("click", (event) => {
    const button = event.target.closest("button[data-page]");
    if (!button) {
      return;
    }
    const page = Number(button.dataset.page);
    if (page && page !== shelfPage) {
      shelfPage = page;
      renderShelfTable();
      document.querySelector(".shelf-table-scroll").scrollTop = 0;
    }
  });

document.addEventListener("click", async (event) => {
  if (event.target.classList.contains("edit-btn")) {
    editingItemId = event.target.dataset.id;
    await loadShelfData();
    return;
  }

  if (event.target.classList.contains("cancel-btn")) {
    editingItemId = null;
    await loadShelfData();
    return;
  }

  if (event.target.classList.contains("save-btn")) {
    const row = event.target.closest("tr");
    const id = event.target.dataset.id;
    const payload = readShelfFieldsFromRow(row);

    if (!payload.name) {
      return;
    }

    try {
      const response = await fetch(`/api/shelf/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("failed to update item");
      }

      editingItemId = null;
      await loadShelfData();
    } catch (error) {
      console.error("Failed to save item:", error);
    }
    return;
  }

  if (!event.target.classList.contains("delete-btn")) {
    return;
  }

  if (!confirm("Delete this item?")) {
    return;
  }

  const id = event.target.dataset.id;

  await fetch(`/api/shelf/${id}`, {
    method: "DELETE",
  });

  if (editingItemId === id) {
    editingItemId = null;
  }

  await loadShelfData();
  await refreshSavingsChart();
  await refreshWasteMap();
});

addItemForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = getShelfItemPayload({
    name: document.getElementById("shelf-item-input").value.trim(),
    storedDate: document.getElementById("store-date-input").value,
    expirationDate: document.getElementById("expiration-date-input").value,
    quantity: document.getElementById("quantity-input").value,
    quantityUnit: document.getElementById("quantity-unit-input").value,
    cost: document.getElementById("cost-input").value,
    category: categoryInput.value,
  });

  try {
    const response = await fetch("/api/shelf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("failed to add item");
    }
    addItemForm.reset();
    quantityUnitInput.value = DEFAULT_QUANTITY_UNIT;
    categoryInput.value = FOOD_CATEGORIES[0];
    const offcanvasEl = document.getElementById("add-item-offcanvas");
    bootstrap.Offcanvas.getInstance(offcanvasEl)?.hide();
    await loadShelfData();
  } catch (error) {
    console.error("Failed to submit form:", error);
  }
});

loadShelfData();
loadMealPrepSection();
refreshSavingsChart();
refreshWasteMap();
