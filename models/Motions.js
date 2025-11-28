// models/Motions.js
import mongoose from "mongoose";

const voteSchema = new mongoose.Schema(
  {
    yes: { type: Number, default: 0 },
    no: { type: Number, default: 0 },
    abstain: { type: Number, default: 0 },
  },
  { _id: false }
);

const motionSchema = new mongoose.Schema({
  // Unique motion id as string, e.g. "1763411180511"
  _id: {
    type: String,
    required: true,
  },

  committeeId: {
    type: String,
    required: true,
  },

  // "main" or "submotion"
  type: {
    type: String,
    enum: ["main", "submotion"],
    default: "main",
  },

  // Only used when type === "submotion"
  parentMotionId: {
    type: String,
    default: null,
  },

  title: {
    type: String,
    required: true,
  },

  description: {
    type: String,
    default: "",
  },

  // Motion lifecycle status
  status: {
    type: String,
    enum: [
      "in-progress",
      "paused",
      "unfinished",
      "postponed",
      "referred",
      "passed",
      "failed",
      "closed",
    ],
    default: "in-progress",
  },

  createdAt: {
    type: String,
    default: () => new Date().toISOString(),
  },

  votes: {
    type: voteSchema,
    default: () => ({
      yes: 0,
      no: 0,
      abstain: 0,
    }),
  },
});

export default mongoose.models.Motion ||
  mongoose.model("Motion", motionSchema);
