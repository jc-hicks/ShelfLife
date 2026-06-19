# ShelfLife Project Proposal

## Project Description

ShelfLife is a full-stack web application that helps users reduce food waste and manage groceries more efficiently. Users can keep track of pantry inventory, monitor expiration dates, get recipe recommendations that use ingredients close to expiring, and log meal-prepped foods separately so they are used before they spoil.

The backend uses Node.js, Express, and MongoDB to handle CRUD operations and API routing. The frontend uses HTML5, CSS, and vanilla ES6 JavaScript for client-side rendering and DOM updates.

## User Personas

See [user-personas.md](user-personas.md) for the full persona breakdown.

## User Stories

See [user-stories.md](user-stories.md) for the grouped user stories and use cases.

## Design Mockups

### Main Pantry Page

- Top section: pantry table with food names, expiration dates, and delete actions.
- Middle left: shopping list panel for smart ingredient suggestions.
- Middle right: add-item form for pantry inventory.

### Recipe Page

- Searchable, filterable recipe list (by name, ingredient, or tag, plus a
  "make it now" toggle) with cards showing cook time, tags, and a match meter.
- Recipe recommendation order prioritizes ingredients nearing expiration.
- Recipe detail panel with an ingredient checklist (on hand vs. need to buy),
  timing, difficulty, and step-by-step instructions.
- Shopping suggestions table that shows what to buy to unlock near-ready recipes.
- Meal-prep tracker with form inputs and a separate list of prepared foods.

### Simple Wireframe

```text
ShelfLife Dashboard
--------------------------------------------------
| Pantry table                                    |
--------------------------------------------------
| Smart shopping suggestions | Add pantry item    |
--------------------------------------------------

ShelfLife Recipes
--------------------------------------------------
| Suggested recipes | Recipe detail panel         |
--------------------------------------------------
| Shopping suggestions | Meal prep tracker        |
--------------------------------------------------
```

## Core Features

- Pantry management with add, update, delete, and expiration tracking.
- Recipe search and recommendations based on pantry inventory, weighted toward
  ingredients that are about to expire.
- Recipe detail views with an ingredient checklist and instructions.
- Smart shopping suggestions for recipes you can almost make.
- Meal-prep tracking with use-by reminders.

## Technical Notes

- Backend: Node.js, Express, MongoDB
- Frontend: Vanilla JavaScript, HTML5, CSS
- Rendering: Client-side DOM updates with fetch requests
- Data collections: `shelf`, `history`, `recipes`, `ingredients`, and `mealPrep`
- Recipe and ingredient data imported from the free TheMealDB API (see
  `database/fetch-dataset.js`)
