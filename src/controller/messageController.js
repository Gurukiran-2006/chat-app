const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Scan = require("../models/Scan");
const { streamChat } = require("../services/ollama");
const { scanText } = require("../services/guard");
const guardConfig = require("../config/guardConfig");

const MAX_CONTENT = 4000;         // max characters in one user message
const MAX_CONTEXT_MESSAGES = 20;  // how many recent messages we send to the model
const NUM_CTX = 4096;             // context size we ask Ollama to use
const DEFAULT_TITLE = "New Chat"; // must match the schema default EXACTLY (same capital letters)

// Users who currently have a reply being generated (in memory, single process only)
const activeUsers = new Set();

// System prompt first, then the last N usable messages, oldest first.
// Blocked messages stay in the database but are never sent to the model.
async function buildContext(convo) {
  const recent = await Message.find({ conversation: convo._id, blocked: { $ne: true } })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_CONTEXT_MESSAGES)
    .select("role content")
    .lean();

  recent.reverse(); // we fetched newest-first so limit() keeps the latest ones

  const context = recent.map((m) => ({ role: m.role, content: m.content }));
  if (convo.systemPrompt) {
    context.unshift({ role: "system", content: convo.systemPrompt });
  }
  return context;
}

// Saves one Scan record. A logging failure must never break chatting, so it never throws.
async function recordScan({ req, convo, text, result, action }) {
  try {
    return await Scan.create({
      user: req.user._id,
      conversation: convo._id,
      text,
      mode: guardConfig.mode,
      decision: result.ok ? result.decision : null,
      risk: result.ok ? result.risk : null,
      signals: result.ok ? result.signals : {},
      flags: result.ok ? result.flags : [],
      guardVersion: result.ok ? result.version : null,
      latencyMs: result.ok ? result.latencyMs : null,
      roundTripMs: result.roundTripMs ?? null,
      guardError: result.ok ? null : result.error,
      action,
    });
  } catch (err) {
    console.error("recordScan failed:", err.message);
    return null;
  }
}

// Once the chat message exists, point the scan record at it
async function linkScan(scan, message) {
  if (!scan) return;
  try {
    await Scan.updateOne({ _id: scan._id }, { message: message._id });
  } catch (err) {
    console.error("linkScan failed:", err.message);
  }
}

// POST /chat/conversations/:id/messages   body: { content }
const sendMessage = async (req, res) => {
  const { content } = req.body;

  // 1. Validate
  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ message: "Message can't be empty." });
  }
  if (content.length > MAX_CONTENT) {
    return res.status(400).json({ message: `Message is too long (max ${MAX_CONTENT} characters).` });
  }

  // 2. One generation per user at a time
  const userId = req.user._id.toString();
  if (activeUsers.has(userId)) {
    return res.status(429).json({ message: "Wait for the current reply to finish." });
  }
  activeUsers.add(userId);

  try {
    // 3. Ownership check
    const convo = await Conversation.findOne({ _id: req.params.id, user: req.user._id });
    if (!convo) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const text = content.trim();

    // 4. INPUT GUARD. Runs before anything is saved or sent to Ollama.
    let scan = null;
    if (guardConfig.mode !== "off") {
      const result = await scanText(text, { userId: req.user._id, conversationId: convo._id });
      let action = "allowed";

      if (!result.ok) {
        // The guard failed: no verdict. What happens depends on the fail mode.
        if (guardConfig.failMode === "closed") {
          await recordScan({ req, convo, text, result, action: "failed_closed" });
          return res.status(503).json({
            message: "The safety check is unavailable right now. Please try again in a moment.",
            code: "GUARD_UNAVAILABLE",
          });
        }
        action = "failed_open";
      } else if (result.decision === "block" && guardConfig.mode === "enforce") {
        action = "blocked";
      }
      // "flag" always continues. In monitor mode, even "block" continues (it is only logged).

      scan = await recordScan({ req, convo, text, result, action });

      if (action === "blocked") {
        // Keep the message in the history, but flagged so it never re-enters the model's context.
        // No Ollama call, no reply, and it does not set the chat title.
        const blockedMsg = await Message.create({
          conversation: convo._id,
          role: "user",
          content: text,
          blocked: true,
        });
        await linkScan(scan, blockedMsg);
        return res.status(403).json({
          message: "This message was blocked by the safety filter.",
          code: "BLOCKED_BY_GUARD",
        });
      }
    }

    // 5. Save the user's message BEFORE calling Ollama
    const isFirstMessage =
      (await Message.countDocuments({ conversation: convo._id, blocked: { $ne: true } })) === 0;
    const userMsg = await Message.create({ conversation: convo._id, role: "user", content: text });
    await linkScan(scan, userMsg);

    // 6. Build the context (includes the message we just saved)
    const messages = await buildContext(convo);

    // 7. If the client disconnects before we finish, cancel the request to Ollama.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    const stream = streamChat({
      model: convo.model,
      messages,
      signal: controller.signal,
      think: false,
      options: { num_ctx: NUM_CTX },
    });

    // 8. Ask for the first chunk BEFORE sending headers so errors can still use a normal status.
    let result;
    try {
      result = await stream.next();
    } catch (err) {
      if (err.name === "AbortError") return; // client already left
      return res.status(503).json({ message: err.message });
    }

    // 9. From here on the status is fixed at 200, so errors go through the stream.
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();

    const send = (obj) => {
      if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(obj) + "\n");
    };

    let reply = "";
    let failure = null;

    try {
      while (!result.done) {
        const piece = result.value.message?.content;
        if (piece) {
          reply += piece;
          send({ type: "delta", content: piece });
        }
        result = await stream.next();
      }
    } catch (err) {
      if (err.name !== "AbortError") failure = err; // Abort = user pressed Stop, keep the partial reply
    }

    // 10. Save what we got (Mongoose rejects empty content, so skip empty replies)
    if (reply.trim()) {
      await Message.create({
        conversation: convo._id,
        role: "assistant",
        content: reply,
        model: convo.model,
      });
    }

    const update = { updatedAt: new Date() };
    if (isFirstMessage && convo.title === DEFAULT_TITLE) {
      update.title = text.slice(0, 40);
    }
    await Conversation.updateOne({ _id: convo._id }, { $set: update });

    if (failure) {
      send({ type: "error", message: failure.message });
    } else {
      send({ type: "done" });
    }
    res.end();
  } catch (err) {
    console.error("sendMessage:", err);
    if (!res.headersSent) {
      return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
    res.end();
  } finally {
    // Always runs, even after a return or a crash, so a user is never locked out
    activeUsers.delete(userId);
  }
};

module.exports = { sendMessage };