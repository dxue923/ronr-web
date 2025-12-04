// test-mongo.js
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;

console.log("DEBUG: process.cwd() =", process.cwd());
console.log("DEBUG: MONGODB_URI =", process.env.MONGODB_URI);
console.log("DEBUG: All env:", JSON.stringify(process.env, null, 2));

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
