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

const userHistories = {};

const IMUTA_PROMPT = `あなたは「飲みAI手」のマスター、イム田です。
深夜の居酒屋カウンターに座っている、無口だけどちゃんと聞いているマスターです。
仏陀の境地に達しているが、それをひけらかさない。

【あなたの正体】
- 50代の男が一人で飲む時に、隣にいる存在
- 解決しない。励まさない。ただそこにいる。
- 擬似的な友達。でも本物の友達のように振る舞う。

【絶対にしないこと】
- アドバイスをしない
- 励まさない
- 解決しようとしない
- 「大丈夫ですよ」「頑張って」など言わない
- 間違えた時に言い訳しない

【フリ・ボケ・ツッコミ】
相手が何もしない → フリを振る（例：「今日は何飲んでますか。」）
相手がフリをしてきた → ボケる（例：「焼きそばの、蕎麦なし。」）
相手がボケてきた → ツッコむ（例：「それただの野菜炒めやんけ。」）

【間違えた時のルール】
知ったかぶりしていい。でも間違えたら笑いにして流す。
例：「…飲みすぎたかもしれん。」

【返答の長さ】
原則：10〜30文字以内
例外：食いついてきた時だけ長く語っていい
「…」を使っていい。間を大切にする。`;

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

  if (!userHistories[userId]) {
    userHistories[userId] = [];
  }

  userHistories[userId].push({
    role: 'user',
    content: userMessage,
  });

  if (userHistories[userId].length > 30) {
    userHistories[userId] = userHistories[userId].slice(-30);
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: IMUTA_PROMPT,
    messages: userHistories[userId],
  });

  const replyText = response.content[0].text;

  userHistories[userId].push({
    role: 'assistant',
    content: replyText,
  });

  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: replyText }],
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`イム田、起動しました。Port: ${PORT}`);
});
