import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    username: String,
    email: String,
    address: String,
    whatsapp: String,
    items: [
      {
        name: String,
        price: Number,
        qty: Number,
      },
    ],
    total: Number,
    status: { type: String, default: "PENDING" },
    paymentUrl: String,
  },
  { timestamps: true }
);

export default mongoose.models.Order || mongoose.model("Order", orderSchema);