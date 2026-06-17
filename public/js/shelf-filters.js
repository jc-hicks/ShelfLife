// Pure sorting and filtering logic for the shelf table. This module owns the
// expiry/priority computations that drive ordering, plus the generic sort and
// filter engine. View-specific concerns (how a column's value or a row's
// search text is derived) are injected by the caller so this stays decoupled
// from rendering and the DOM.

// Whole days between today and an expiration date (YYYY-MM-DD). Parsed as a
// local date to avoid the UTC-midnight off-by-one. Negative = already expired.
export function getDaysUntilExpiration(expirationDate) {
  if (!expirationDate) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = expirationDate.split("-").map(Number);
  const target = new Date(year, month - 1, day);

  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// Cost at stake per remaining day — weights expensive, soon-to-expire items
// highest. This is the default ranking when no column sort is active.
export function getCostLostPerDay(food) {
  const daysLeft = getDaysUntilExpiration(food.expirationDate);

  if (daysLeft === null) {
    return null;
  }

  const cost = Number(food.cost);
  const totalValue = Number.isNaN(cost) ? 0 : cost;

  if (daysLeft <= 0) {
    return totalValue > 0 ? Infinity : 0;
  }

  return totalValue / daysLeft;
}

function sortShelfByPriority(items) {
  return [...items].sort((a, b) => {
    const priorityA = getCostLostPerDay(a);
    const priorityB = getCostLostPerDay(b);

    if (priorityA === null && priorityB === null) {
      return 0;
    }

    if (priorityA === null) {
      return 1;
    }

    if (priorityB === null) {
      return -1;
    }

    return priorityB - priorityA;
  });
}

// Generic comparator. Nulls always sort last regardless of direction.
function compareSortValues(a, b, direction) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  if (a < b) return direction === "desc" ? 1 : -1;
  if (a > b) return direction === "desc" ? -1 : 1;
  return 0;
}

// Sort by the active column using a caller-provided value extractor. With no
// active column, falls back to the cost-weighted priority ranking.
export function applyShelfSort(items, sort, getSortValue) {
  if (!sort.column) {
    return sortShelfByPriority(items);
  }

  return [...items].sort((a, b) =>
    compareSortValues(
      getSortValue(a, sort.column),
      getSortValue(b, sort.column),
      sort.direction
    )
  );
}

export function normalizeFilterText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

// Filter rows by a search term. The row identified by `keepId` (e.g. the row
// being edited) is always kept. `getSearchText` builds the searchable text for
// a row, and `searchTerm` is assumed already normalized.
export function filterShelfItems(items, { searchTerm, getSearchText, keepId }) {
  if (!searchTerm) {
    return items;
  }

  return items.filter(
    (food) => food._id === keepId || getSearchText(food).includes(searchTerm)
  );
}
