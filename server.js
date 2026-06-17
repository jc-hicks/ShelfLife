import dotenv from "dotenv";
import express from "express";

import recipeRoutes from "./routes/recipes.js";
import shelfRoutes from "./routes/shelf.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.static("public"));
app.use(express.json());

app.use("/api/shelf", shelfRoutes);
app.use("/api/recipes", recipeRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
