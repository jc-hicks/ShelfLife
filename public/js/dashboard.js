async function loadShelfData() {
    try {
        const response = await fetch("/data/shelfdata.json");
        const shelfData = await response.json();
        const tableBody = document.getElementById("shelf-table-body");

        tableBody.innerHTML = shelfData.map((food, index)=> `
        <tr>
            <td>${index + 1}</td>
            <td>${food.name}</td>
            <td>${food.expirationDate}</td>
            </tr>
        `
        ).join("");
    } catch (error) {
        console.error("Failed to load shelf data:", error)
    }
}

async function loadPreppedMeals() {
    try {
        const response = await fetch("/data/shelfdata.json");
        const shelfData = await response.json();
        const tableBody = document.getElementById("shelf-table-body");

        tableBody.innerHTML = shelfData.map((food, index)=> `
        <tr>
            <td>${index + 1}</td>
            <td>${food.name}</td>
            <td>${food.expirationDate}</td>
            </tr>
        `
        ).join("");
    } catch (error) {
        console.error("Failed to load shelf data:", error)
    }
}

async function loadShoppingList() {
    try {
        const response = await fetch("/data/shoppinglist.json");
        const shoppingList = await response.json();
        const tableBody = document.getElementById("shopping-list-table");

        tableBody.innerHTML = shoppingList.map((list, index)=> `
        <tr>
            <td>${index + 1}</td>
            <td>${list.item}</td>
            <td>${list.quantity}</td>
            </tr>
        `
        ).join("");
    } catch (error) {
        console.error("Failed to load shopping list:", error)
    }
}

loadShelfData();
loadShoppingList();