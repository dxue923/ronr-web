// models/Profile.js
import mongoose from "mongoose";

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
  email: {
    type: String,
    trim: true,
  },
  avatarUrl: String,
});

// Unique index for username (case sensitive by default). Use a separate migration step in production if needed.
profileSchema.index({ username: 1 }, { unique: true, sparse: true });
// Ensure a single email maps to a single profile; prevent crossovers
profileSchema.index({ email: 1 }, { unique: true, sparse: true });

export default mongoose.models.Profile ||
  mongoose.model("Profile", profileSchema);
