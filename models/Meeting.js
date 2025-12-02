import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  committeeId: { type: String, required: true },
  date: { type: String, default: () => new Date().toISOString().slice(0, 10) },
  seq: { type: Number, default: 1 },
  active: { type: Boolean, default: false },
  recessed: { type: Boolean, default: false },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

export default mongoose.models.Meeting ||
  mongoose.model("Meeting", meetingSchema);
