import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    imgSrc: { type: String, required: true },
    price: { type: Number, required: true },
    description: String,
    category: String,
    isNew: { type: Boolean, default: false },
    gender: String,
    ageGroup: String,
  },
  { timestamps: true }
);

export default mongoose.models.Item || mongoose.model("Item", itemSchema);