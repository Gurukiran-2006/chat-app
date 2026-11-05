const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { streamChat } = require("../services/ollama");

const MAX_CONTENT = 4000;         // max characters in one user message
const MAX_CONTEXT_MESSAGES = 20;  // how many recent messages we send to the model
const NUM_CTX = 4096;             // context size we ask Ollama to use
const DEFAULT_TITLE = "New chat"; // must match the schema default

// Users who currently have a reply being generated (in memory, single process only)
const activeUsers = new Set();

// The seam for the input guard. It returns the text unchanged for now.
// Later this is where the guardrail check goes.
async function prepareUserMessage(text) {
  return text;
}

// System prompt first, then the last N messages, oldest first.
async function buildContext(convo) {
  const recent = await Message.find({ conversation: convo._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_CONTEXT_MESSAGES)
    .select("role content")
    .lean();

  recent.reverse(); // we fetched newest-first so limit() keeps the latest ones

  // Plain { role, content } objects only, which is all Ollama needs
  const context = recent.map((m) => ({ role: m.role, content: m.content }));
  if (convo.systemPrompt) {
    context.unshift({ role: "system", content: convo.systemPrompt });
  }
  return context;
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

    // 4. Guard seam, then save the user's message BEFORE calling Ollama
    const text = await prepareUserMessage(content.trim());
    const isFirstMessage = (await Message.countDocuments({ conversation: convo._id })) === 0;
    await Message.create({ conversation: convo._id, role: "user", content: text });

    // 5. Build the context (includes the message we just saved)
    const messages = await buildContext(convo);

    // 6. If the client disconnects before we finish, cancel the request to Ollama.
    //    "close" fires on normal completion too, but then writableEnded is true.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    const stream = streamChat({
      model: convo.model,
      messages,
      signal: controller.signal,
      think:false,
      options: { num_ctx: NUM_CTX },
    });

    // 7. Ask for the first chunk BEFORE sending headers. If Ollama is down or the
    //    model is wrong, we can still answer with a normal error status.
    let result;
    try {
      result = await stream.next();
    } catch (err) {
      if (err.name === "AbortError") return; // client already left
      return res.status(503).json({ message: err.message });
    }

    // 8. From here on the status is fixed at 200, so errors go through the stream.
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
        const piece = result.value.message?.content; // ignore message.thinking for now
        if (piece) {
          reply += piece;
          send({ type: "delta", content: piece });
        }
        result = await stream.next();
      }
    } catch (err) {
      // An AbortError means the user pressed Stop, which is normal, so we keep the partial reply
      if (err.name !== "AbortError") failure = err;
    }

    // 9. Save what we got (Mongoose rejects empty content, so skip empty replies)
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
    res.end(); // the stream already started, so just close it
  } finally {
    // Always runs, even after a return or a crash, so a user is never locked out
    activeUsers.delete(userId);
  }
};

module.exports = { sendMessage };