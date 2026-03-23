const mongoose = require("mongoose");

const serverNodeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    xtreamUrl: { type: String, default: "" },
    m3uUrl: { type: String, default: "" },
    status: { type: String, enum: ["online", "offline"], default: "online" },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("ServerNode", serverNodeSchema);
