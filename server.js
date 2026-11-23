const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = (process.env.BOT_TOKEN || "9140989423:AAHAu5hm_DH_vlahDwTIgfOT3QgliTfu3gg").trim();
const ADMIN_CHAT_ID = (process.env.CHAT_ID || "7888085147").trim();
const PORT = process.env.PORT || 3000;

const repliesBySession = {};
const messageToSession = {};
let lastTelegramUpdateId = 0;

async function sendTelegramMessage(chatId, text, replyToMessageId = null) {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is empty");
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text
  };
  if (replyToMessageId) {
    payload.reply_to_message_id = replyToMessageId;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API Error: ${data.description || "unknown"}`);
  }
  return data.result;
}

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "MEW STORE Chat Server",
    hasBotToken: Boolean(BOT_TOKEN),
    hasChatId: Boolean(ADMIN_CHAT_ID)
  });
});

app.post("/api/chat/send", async (req, res) => {
  try {
    const { sessionId, message } = req.body || {};
    if (!sessionId || !message || !String(message).trim()) {
      return res.status(400).json({ ok: false, error: "Missing sessionId or message" });
    }

    const cleanMsg = String(message).trim();
    const tgText =
      `💬 MEW STORE Live Chat\n` +
      `🆔 Session: ${sessionId}\n` +
      `━━━━━━━━━━━━━━\n` +
      `${cleanMsg}\n` +
      `━━━━━━━━━━━━━━\n` +
      `↩️ Reply សារនេះ ដើម្បីឆ្លើយតបទៅភ្ញៀវវិញ`;

    const sent = await sendTelegramMessage(ADMIN_CHAT_ID, tgText);
    if (sent && sent.message_id) {
      messageToSession[sent.message_id] = sessionId;
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/chat/send failed:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/chat/poll", (req, res) => {
  const sessionId = String(req.query.sessionId || "");
  const after = Number(req.query.after || 0);

  const list = repliesBySession[sessionId] || [];
  const messages = list.filter((m) => m.time > after);
  return res.json({ ok: true, messages });
});

async function pollTelegramUpdates() {
  if (!BOT_TOKEN) return;

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastTelegramUpdateId + 1}&timeout=20`;
    const res = await fetch(url);
    const data = await res.json();

    if (data && data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        lastTelegramUpdateId = Math.max(lastTelegramUpdateId, update.update_id);

        const msg = update.message;
        if (!msg || !msg.text) continue;

        const repliedMsgId = msg.reply_to_message && msg.reply_to_message.message_id;
        let targetSession = repliedMsgId ? messageToSession[repliedMsgId] : null;

        let replyText = msg.text;
        if (!targetSession && msg.text.startsWith("/reply ")) {
          const parts = msg.text.replace("/reply ", "").trim().split(" ");
          targetSession = parts.shift();
          replyText = parts.join(" ");
        }

        if (targetSession && replyText) {
          if (!repliesBySession[targetSession]) {
            repliesBySession[targetSession] = [];
          }
          repliesBySession[targetSession].push({
            text: replyText,
            time: Date.now()
          });
        }
      }
    }
  } catch (err) {
    console.error("Telegram polling error:", err.message);
  } finally {
    setTimeout(pollTelegramUpdates, 1000);
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  pollTelegramUpdates();
});
