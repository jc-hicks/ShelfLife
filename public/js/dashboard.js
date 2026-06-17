async function loadShelfData() {
  try {
    const response = await fetch("/api/shelf");
    const shelfData = await response.json();
    const tableBody = document.getElementById("shelf-table-body");

    tableBody.innerHTML = shelfData
      .map(
        (food, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${food.name}</td>
            <td>${food.expirationDate}</td>
            <td>
                <button
                  class="btn btn-danger btn-sm delete-btn"
                  data-id="${food._id}">
                  Delete
                </button>
              </td>
            </tr>
        `
      )
      .join("");
  } catch (error) {
    console.error("Failed to load shelf data:", error);
  }
}

async function loadShoppingList() {
  try {
    const response = await fetch("/data/shoppinglist.json");
    const shoppingList = await response.json();
    const tableBody = document.getElementById("shopping-list-table");

    tableBody.innerHTML = shoppingList
      .map(
        (list, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${list.item}</td>
            <td>${list.quantity}</td>
        </tr>
        `
      )
      .join("");
  } catch (error) {
    console.error("Failed to load shopping list:", error);
  }
}

const addItemForm = document.getElementById("add-item-form");

addItemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("shelf-item-input").value;
  const storedDate = document.getElementById("store-date-input").value;
  const expirationDate = document.getElementById("expiration-date-input").value;

  try {
    const response = await fetch("/api/shelf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        storedDate,
        expirationDate,
      }),
    });

    if (!response.ok) {
      throw new Error("failed to add item");
    }
    addItemForm.reset();
    await loadShelfData();
  } catch (error) {
    console.error("Failed to submit form:", error);
  }
});

document.addEventListener("click", async (event) => {
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

  await loadShelfData();
});

loadShelfData();
loadShoppingList();
