import mongoose from "mongoose";
import auditSoftDelete from "./plugins/auditSoftDelete.js";
const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    imgSrc: { type: String, required: true },
    price: { type: Number, required: true },
    description: String,
    category: String,
    isNew: { type: Boolean, default: false },
    gender: String,
    ageGroup: String
  },
  { timestamps: true }
);
itemSchema.plugin(auditSoftDelete);
export default mongoose.models.Item || mongoose.model("Item", itemSchema);
