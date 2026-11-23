const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// អានពី Environment Variables លើ Render (ឬដាក់ផ្ទាល់ពេលតេស្ត)
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_CHAT_ID = process.env.CHAT_ID || "";
const PORT = process.env.PORT || 3000;

// រក្សាសារឆ្លើយតបពី Telegram តាម sessionId
// { sessionId: [ { text, time } ] }
const repliesBySession = {};
// ផ្គូផ្គង Telegram message_id -> sessionId ដើម្បីដឹងថា Admin កំពុង Reply ទៅភ្ញៀវណា
const messageToSession = {};
let lastTelegramUpdateId = 0;

async function sendTelegramMessage(chatId, text, replyToMessageId = null) {
  if (!BOT_TOKEN) {
    throw new Error("Missing BOT_TOKEN");
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
    throw new Error(data.description || "Telegram API error");
  }
  return data.result;
}

// ពិនិត្យសុខភាព Server
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "MEW STORE Chat Server" });
});

// ទទួលសារ / Order ID ពី Website Live Chat ហើយផ្ញើចូល Telegram
app.post("/api/chat/send", async (req, res) => {
  try {
    const { sessionId, message } = req.body || {};
    if (!sessionId || !message || !String(message).trim()) {
      return res.status(400).json({ ok: false, error: "Missing sessionId or message" });
    }
    if (!ADMIN_CHAT_ID) {
      return res.status(500).json({ ok: false, error: "Missing CHAT_ID on server" });
    }

    const cleanMsg = String(message).trim();
    const tgText =
      `💬 *MEW STORE Live Chat*\n` +
      `🆔 Session: \`${sessionId}\`\n` +
      `━━━━━━━━━━━━━━\n` +
      `${cleanMsg}\n` +
      `━━━━━━━━━━━━━━\n` +
      `↩️ _Reply សារនេះ ដើម្បីឆ្លើយតបទៅភ្ញៀវវិញ_`;

    const sent = await sendTelegramMessage(ADMIN_CHAT_ID, tgText);
    if (sent && sent.message_id) {
      messageToSession[sent.message_id] = sessionId;
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Error /api/chat/send:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Website Poll យកសារឆ្លើយតបពី Admin
app.get("/api/chat/poll", (req, res) => {
  const sessionId = String(req.query.sessionId || "");
  const after = Number(req.query.after || 0);

  const list = repliesBySession[sessionId] || [];
  const messages = list.filter((m) => m.time > after);
  return res.json({ ok: true, messages });
});

// ទាញយកសារ Reply ពី Telegram Bot (Long Polling)
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

        // បើ Admin ធ្វើការ Reply លើសាររបស់ Bot
        const repliedMsgId = msg.reply_to_message && msg.reply_to_message.message_id;
        let targetSession = repliedMsgId ? messageToSession[repliedMsgId] : null;

        // ឬបើ Admin វាយទម្រង់: /reply <sessionId> <សារ>
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
  } catch (_) {
    // រង់ចាំ loop បន្ទាប់
  } finally {
    setTimeout(pollTelegramUpdates, 1000);
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  pollTelegramUpdates();
});
