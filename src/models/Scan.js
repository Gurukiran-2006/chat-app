const mongoose = require("mongoose");

const scanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },

    // Filled in after the chat message has been saved
    message: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },

    // The prompt that was scanned
    text: { type: String, required: true },

    // Mode in force at that moment ("off" never creates a scan, so it isn't allowed here)
    mode: { type: String, enum: ["monitor", "enforce"], required: true },

    // What the GUARD said. null when the guard failed and gave no verdict.
    decision: { type: String, enum: ["allow", "flag", "block"], default: null },
    risk: { type: Number, min: 0, max: 1, default: null },
    signals: { type: mongoose.Schema.Types.Mixed, default: {} }, // per-layer details, shape will grow
    flags: { type: [String], default: [] },
    guardVersion: { type: String, default: null },
    latencyMs: { type: Number, default: null },   // time spent inside the guard
    roundTripMs: { type: Number, default: null }, // includes the network hop
    guardError: { type: String, default: null },  // set only when the guard failed

    // What EXPRESS actually did. This can differ from `decision`:
    // in monitor mode a "block" decision still ends in "allowed".
    action: {
      type: String,
      enum: ["allowed", "blocked", "failed_open", "failed_closed"],
      required: true,
    },
  },
  { timestamps: true }
);

scanSchema.index({ user: 1, createdAt: -1 });        // "this user's recent scans"
scanSchema.index({ decision: 1, createdAt: -1 });    // dashboard: counts by decision over time
scanSchema.index({ conversation: 1, createdAt: 1 }); // "scans in this chat, in order"

// Optional retention: delete scans (and the raw prompts in them) after 90 days.
// Decide this before you collect real data, then uncomment.
// scanSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model("Scan", scanSchema);