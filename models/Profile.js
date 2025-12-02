// models/Profile.js
import mongoose from "mongoose";

const membershipSchema = new mongoose.Schema(
  {
    committeeId: { type: String, required: true },
    role: { type: String, default: "member" },
    joinedAt: {
      type: String,
      default: () => new Date().toISOString(),
    },
  },
  { _id: false }
);

const profileSchema = new mongoose.Schema({
  _id: String, // Auth0 user id: "google-oauth2|..."
  username: {
    type: String,
    trim: true,
  },
  name: {
    type: String,
    trim: true,
  },
  email: String,
  avatarUrl: String,
  memberships: {
    type: [membershipSchema],
    default: [],
  },
});

// Unique index for username (case sensitive by default). Use a separate migration step in production if needed.
profileSchema.index({ username: 1 }, { unique: true, sparse: true });

export default mongoose.models.Profile ||
  mongoose.model("Profile", profileSchema);
