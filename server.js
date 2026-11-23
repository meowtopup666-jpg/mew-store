const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const BOT_TOKEN = '9140989423:AAF3oYhVeT0-AdXIy-TNtZyjCz_oVjAgoU0';
const ADMIN_CHAT_ID = '7888085147';

const repliesBySession = {};

app.post('/api/chat/send', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) {
    return res.status(400).json({ ok: false, error: 'Missing sessionId or message' });
  }

  const tgText =
    `💬 សារថ្មីពី Live Chat (MEW STORE)\n` +
    `🆔 Session: ${sessionId}\n` +
    `📝 សារ: ${message}\n\n` +
    `👉 Reply សារនេះដើម្បីតបទៅភ្ញៀវវិញ`;

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: tgText
      })
    });
    const tgData = await tgRes.json();
    if (!tgData.ok) {
      return res.status(500).json({ ok: false, error: tgData.description });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/webhook/telegram', (req, res) => {
  const msg = req.body.message;
  if (msg && msg.text && msg.reply_to_message) {
    const repliedText = msg.reply_to_message.text || '';
    const match = repliedText.match(/Session:\s*([A-Za-z0-9_-]+)/);
    if (match) {
      const sessionId = match[1];
      if (!repliesBySession[sessionId]) repliesBySession[sessionId] = [];
      repliesBySession[sessionId].push({
        text: msg.text,
        time: Date.now()
      });
    }
  }
  res.sendStatus(200);
});

app.get('/api/chat/poll', (req, res) => {
  const { sessionId, after = 0 } = req.query;
  const list = repliesBySession[sessionId] || [];
  const newMessages = list.filter(m => m.time > Number(after));
  res.json({ messages: newMessages });
});

app.get('/', (req, res) => res.send('MEW STORE Live Chat Server Running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port', PORT));
