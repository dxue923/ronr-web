// models/Committee.js
import mongoose from "mongoose";

const committeeSchema = new mongoose.Schema({
  _id: String, // committee-123
  name: String,
  createdAt: String,
});

// ✅ Define the model in a variable, then export default
const Committee =
  mongoose.models.Committee || mongoose.model("Committee", committeeSchema);

export default Committee;
