// models/Committee.js
import mongoose from "mongoose";

const committeeSchema = new mongoose.Schema({
  _id: String,     // committee-123
  name: String,
  createdAt: String
});

export default mongoose.models.Committee ||
  mongoose.model("Committee", committeeSchema);
