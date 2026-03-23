const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reseller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    package: { type: mongoose.Schema.Types.ObjectId, ref: "Package", required: true },
    server: { type: mongoose.Schema.Types.ObjectId, ref: "ServerNode", default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ["active", "expired", "cancelled"], default: "active" },
    isTrial: { type: Boolean, default: false },
    amount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
