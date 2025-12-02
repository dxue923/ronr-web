// db/mongoose.js
import mongoose from "mongoose";
import dotenv from "dotenv";

// Load env without hard-failing at module import time
dotenv.config({ path: ".env.local" }); // or ".env" if you changed it

let isConnected = false;

export async function connectToDatabase() {
  if (isConnected) {
    // Reuse existing connection in warm Lambda
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI not set. Add it to .env.local or Netlify env."
    );
  }

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || process.env.MONGO_DB || "ronr",
    serverSelectionTimeoutMS: 3000, // fail in 3 seconds instead of 30s
    connectTimeoutMS: 3000, // TCP fail fast
    socketTimeoutMS: 45000, // normal for Atlas
  });

  isConnected = true;
  console.log("Connected to MongoDB Atlas");
}

export default mongoose;
