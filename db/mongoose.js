// db/mongoose.js
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" }); // or ".env" if you changed it

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("❌ MONGODB_URI is missing in .env.local");
}

let isConnected = false;

export async function connectToDatabase() {
  if (isConnected) {
    // Reuse existing connection in warm Lambda
    return;
  }

  await mongoose.connect(uri);
  isConnected = true;
  console.log("✅ Connected to MongoDB Atlas");
}

export default mongoose;
