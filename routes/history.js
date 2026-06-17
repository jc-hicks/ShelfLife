import express from "express";
import { db } from "../database/db.js";

const historyCollection = db.collection("history");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const items = await historyCollection
      .find({})
      .sort({ removedDate: -1 })
      .toArray();

    res.json(items);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch history",
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const items = await historyCollection.find({}).toArray();

    const stats = items.reduce(
      (acc, item) => {
        const value = Number(item.value);
        const amount = Number.isNaN(value) ? 0 : value;

        if (item.outcome === "wasted") {
          acc.totalLost += amount;
          acc.wastedCount += 1;
        } else if (item.outcome === "saved") {
          acc.totalSaved += amount;
          acc.savedCount += 1;
        } else {
          // "used" — removed well before expiry; neutral to savings and loss.
          acc.usedCount += 1;
        }

        return acc;
      },
      {
        totalSaved: 0,
        totalLost: 0,
        savedCount: 0,
        wastedCount: 0,
        usedCount: 0,
      }
    );

    res.json(stats);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch history stats",
    });
  }
});

router.get("/by-category", async (req, res) => {
  try {
    const items = await historyCollection.find({}).toArray();

    const byCategory = new Map();

    for (const item of items) {
      if (item.outcome !== "wasted" && item.outcome !== "saved") {
        continue;
      }

      const category = item.category || "Uncategorized";
      const entry = byCategory.get(category) || {
        category,
        savedCount: 0,
        wastedCount: 0,
        totalCount: 0,
        costLost: 0,
        valueSaved: 0,
      };

      const value = Number(item.value);
      const amount = Number.isNaN(value) ? 0 : value;

      entry.totalCount += 1;
      if (item.outcome === "wasted") {
        entry.wastedCount += 1;
        entry.costLost += amount;
      } else {
        entry.savedCount += 1;
        entry.valueSaved += amount;
      }

      byCategory.set(category, entry);
    }

    const result = [...byCategory.values()].map((entry) => ({
      ...entry,
      costLost: Math.round(entry.costLost * 100) / 100,
      valueSaved: Math.round(entry.valueSaved * 100) / 100,
      wasteRate:
        entry.totalCount === 0
          ? 0
          : Math.round((entry.wastedCount / entry.totalCount) * 100),
    }));

    res.json(result);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch category breakdown",
    });
  }
});

export default router;
