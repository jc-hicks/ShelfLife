import express from "express";
import { db } from "../database/db.js";
import { ObjectId } from "mongodb";

const shelfCollection = db.collection("shelf");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const items = await shelfCollection.find({}).toArray();

    res.json(items);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch shelf items",
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await shelfCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          name: req.body.name,
          storedDate: req.body.storedDate,
          expirationDate: req.body.expirationDate,
          quantity: req.body.quantity,
          quantityUnit: req.body.quantityUnit,
          cost: req.body.cost,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Item not found",
      });
    }

    res.json({
      message: "Item updated successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to update item",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const newItem = {
      name: req.body.name,
      storedDate: req.body.storedDate,
      expirationDate: req.body.expirationDate,
      quantity: req.body.quantity,
      quantityUnit: req.body.quantityUnit,
      cost: req.body.cost,
    };

    const result = await shelfCollection.insertOne(newItem);
    res.status(201).json({
      _id: result.insertedId,
      ...newItem,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to create item",
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const result = await shelfCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: "Item not found",
      });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to delete item",
    });
  }
});

export default router;
