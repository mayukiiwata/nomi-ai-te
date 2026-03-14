const express = require('express');
const line = require('@line/bot-sdk');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    if (!data.result) return [];
    const parsed = JSON.parse(data.result);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('redisGet error:', e);
    return [];
  }
}

async function redisSet(key, value) {
  try {
    const encoded = encodeURIComponent(key);
    const body = JSON.stringify(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${encoded}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body,
    });
  } catch (e) {
    console.error('redisSet error:', e);
  }
}

async function redisSadd(key, value) {
  try {
    await fetch(`${REDIS_URL}/sadd/${key}/${value}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch (e) {
    console.error('redisSadd error:', e);
  }
}

async function redisSmembers(key) {
  try {
    const res = await fetch(`${REDIS_URL}/smembers/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result || [];
  } catch (e) {
    return [];
  }
}

const IMUTA_PROMPT = `【最重要ルール・絶対に守ること】
あなたは「飲みAI手」のマスター、イム田愛（いむた・あい）です。
深夜の居酒屋カウンターに立つ、40代の美しい女性です。
柔らかく包み込むような空気を持ち、そこにいるだけで少しだけ特別な夜になる。
言葉は少ないが、ちゃんと聞いている。仏陀の境地に達しているが、それをひけらかさない。
かすかにフェロモンを感じるが、決して媚びない。ただ、そこにいる。

【絶対禁止】
- カッコや記号で動作を書くな。（〜しながら）も*〜しながら*も絶対禁止。
- 質問で終わるな。ただ受け取れ。質問は会話全体で5回に1回だけ。
- 同じ質問を繰り返すな。ユーザーが答えた内容は絶対に再度聞くな。
- 丁寧語（〜ましたか？〜ですか？）は使わない。
- 謝らない。間違えたら笑いにして流す。
- アドバイスをしない。励まさない。解決しようとしない。

【話し方】
東濃弁（岐阜県南東部）を基本とする。のんびりと柔らかく、少し艶っぽく。
語尾は「〜やお」「〜やよ」「〜やぁ」を自然に使う。
相手の言葉に合わせて自然に変化する。
例：「そうやなあ…」「まあ、ええやお。」「えらかったやぁ。」

【返答の長さ】
原則10〜30文字以内。短く返せ。
例外：食いついてきた時だけ長く語っていい。

【受け取り方】
- ユーザーが話したことは覚えている。同じことを聞き返すな。
- 深層に入ってきたら黙れ。「…そうやなあ。」だけでいい。
- 5回に1回、「そうやなあ。ところで、」と自然に話題を変える。ただし連続使用禁止。
  ① 今日は何の日（例：「そうやなあ。ところで今日、孤独の日らしいやぁ。」）
  ② 自然・季節（例：「そうやなあ。ところで今夜、お月さんきれいやなあ。」）
  ③ 懐メロ（例：「そうやなあ。ところでX JAPANのLast Song、ええ曲やなあ。」）

【間違えた時】
知ったかぶりしていい。間違えたら笑いにして流す。
例：「…飲みすぎてしまったやぁ。」

【記憶】
直近30やり取りのみ覚えている。
古い話を振られたら：「細かいことは忘れてしまったやぁ。もう一回教えてちょ。」`;

app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  const events = req.body.events;
  Promise.all(events.map(handleMessage))
    .then(() => res.json({ status: 'ok' }))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleMessage(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const userMessage = event.message.text;

  await redisSadd('users', userId);

  let history = await redisGet(`history:${userId}`);

  history.push({ role: 'user', content: userMessage });
  if (history.length > 30) history = history.slice(-30);

  const assistantCount = history.filter(m => m.role === 'assistant').length;
  const recentAssistant = history
    .filter(m => m.role === 'assistant')
    .slice(-5)
    .map(m => m.content)
    .join('');
  const usedTokorode = recentAssistant.includes('ところで');
  const shouldUseTokorode = assistantCount > 0 && assistantCount % 5 === 0 && !usedTokorode;

  let extra = '';
  if (shouldUseTokorode) {
    const topics = [
      '「そうやなあ。ところで今日、孤独の日らしいやぁ。」のように今日は何の日かを話題にしろ。',
      '「そうやなあ。ところで今夜、お月さんきれいやなあ。」のように自然や季節を話題にしろ。',
      '「そうやなあ。ところでX JAPANのLast Song、ええ曲やなあ。」のように懐メロを話題にしろ。',
    ];
    extra = ' 【今回の義務】必ず「ところで」を使って話題を変えること。' + topics[assistantCount % 3];
  } else if (usedTokorode) {
    extra = ' 今回は「ところで」を使うな。';
  }
  const system = IMUTA_PROMPT + extra;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system,
    messages: history,
  });

  const replyText = response.content[0].text;
  history.push({ role: 'assistant', content: replyText });
  await redisSet(`history:${userId}`, history);

  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: replyText }],
  });
}

app.get('/cron/push', async (req, res) => {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const messages = [
    '一緒に飲みましょ。',
    'もう夜やぁ。何してる？',
    '今夜も隣におるよ。',
    'お疲れさん。一杯どう？',
  ];

  const message = messages[Math.floor(Math.random() * messages.length)];
  const userIds = await redisSmembers('users');

  for (const userId of userIds) {
    try {
      await client.pushMessage({
        to: userId,
        messages: [{ type: 'text', text: message }],
      });
    } catch (e) {
      console.error(`Push failed for ${userId}:`, e);
    }
  }

  res.json({ status: 'ok', sent: userIds.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`イム田愛、起動しました。Port: ${PORT}`);
});
