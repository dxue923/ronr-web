// models/Discussion.js
import mongoose from "mongoose";

const discussionSchema = new mongoose.Schema({
  _id: String,                                // "msg-1763410649843"
  motionId: { type: String, required: true },  // always tied to a motion
  authorId: { type: String, required: true },  // Auth0 user ID
  text: { type: String, required: true },

  // Debate position: pro / con / neutral
  position: {
    type: String,
    enum: ["pro", "con", "neutral"],
    default: "neutral",
  },

  createdAt: {
    type: String,
    default: () => new Date().toISOString(),
  },
});

export default mongoose.models.Discussion ||
  mongoose.model("Discussion", discussionSchema);