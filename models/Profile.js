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
  username: String,
  name: String,
  email: String,
  avatarUrl: String,
  memberships: {
    type: [membershipSchema],
    default: [],
  },
});

export default mongoose.models.Profile ||
  mongoose.model("Profile", profileSchema);
