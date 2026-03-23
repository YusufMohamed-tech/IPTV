const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    durationDays: { type: Number, required: true },
    price: { type: Number, required: true },
    channels: [{ type: String }],
    serverIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ServerNode" }],
    status: { type: String, enum: ["active", "disabled"], default: "active" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Package", packageSchema);
