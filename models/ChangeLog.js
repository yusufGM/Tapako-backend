import mongoose from "mongoose";
const changeLogSchema = new mongoose.Schema({
  refCollection: String,
  refId: mongoose.Schema.Types.ObjectId,
  action: { type: String, enum: ["create", "update", "delete", "restore"] },
  user: String,
  timestamp: { type: Date, default: Date.now },
  diff: mongoose.Schema.Types.Mixed
});
export default mongoose.models.ChangeLog || mongoose.model("ChangeLog", changeLogSchema);
