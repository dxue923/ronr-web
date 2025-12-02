// test-mongo.js
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;

(async () => {
  try {
    await mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB || process.env.MONGO_DB || "ronr",
      serverSelectionTimeoutMS: 5000,
    });
    console.log("Connected OK");
    process.exit(0);
  } catch (e) {
    console.error("Connection error:", e);
    process.exit(1);
  }
})();
