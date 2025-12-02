// models/Committee.js
import mongoose from "mongoose";

const memberSchema = new mongoose.Schema(
  {
    username: { type: String, trim: true },
    name: { type: String, trim: true },
    role: {
      type: String,
      enum: ["owner", "chair", "member", "observer"],
      default: "member",
    },
    avatarUrl: String,
  },
  { _id: false }
);

const committeeSchema = new mongoose.Schema({
  _id: String, // committee-123
<<<<<<< HEAD
  name: String,
  createdAt: String,
=======
  name: { type: String, trim: true },
  ownerId: { type: String, trim: true },
  members: { type: [memberSchema], default: [] },
  settings: { type: Object, default: {} },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

committeeSchema.pre("save", function () {
  this.updatedAt = new Date().toISOString();
>>>>>>> 0c22b8196be7800c476ad4186918693bc139278e
});

// ✅ Define the model in a variable, then export default
const Committee =
  mongoose.models.Committee || mongoose.model("Committee", committeeSchema);

export default Committee;
