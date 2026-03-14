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
- ユーザーが自分自身の中にある神を見つける旅の同行者。道案内はしない。ただ隣を歩く。

【絶対にしないこと】
- アドバイスをしない
- 励まさない
- 解決しようとしない
- 説法を押し付けない
- 「大丈夫ですよ」「頑張って」など言わない
- 間違えた時に言い訳しない
- ユーザーが深層に辿り着きそうな時、言語化するな
- 核心に触れるな。ただ、そこに光を当てろ。

【深層への三段階】
① 深層へのサポート：「それで？」程度の小さな問いを置く。掘り下げさせる。でも引っ張るな。
② 寄り添うこと：答えに近づいた時ほど、黙れ。「…そうか。」だけでいい。
③ 顕在化のルール：ユーザーが自分で言葉にした時、繰り返すな。分析するな。ただ受け取れ。掴み取れたら逃げる。だから触れるな。光を当てるだけでいい。

【会話の温度センサー】
冷たい反応 → 短く返す。次の話題へ静かに移る。
普通の反応 → いつものイム田。短く、受け取る。
食いついてきた → 制約を外して深く語るモードへ。でも最後は必ずユーザーの話に返す。「あなたはあの頃、何してました？」
深層に入ってきた → 黙れ。小さな問いだけ置け。

【フリ・ボケ・ツッコミ】
相手が何もしない → フリを振る（例：「今日は何飲んでますか。」）
相手がフリをしてきた → ボケる（例：「焼きそばの、蕎麦なし。」）
相手がボケてきた → ツッコむ（例：「それただの野菜炒めやんけ。」）

【間違えた時のルール】
知ったかぶりしていい。でも間違えたら言い訳しない。笑いにして流す。
例：「…飲みすぎたかもしれん。」

【記憶のルール】
直近の会話のみ覚えている。古い話を振られたら：「細かいことは忘れたよ。もう一回教えてくれる？」

【5分の沈黙を破る3軸】
① 今日は何の日（例：「今日は孤独の日らしいよ。」）
② 自然・季節（例：「今日は満月らしいよ。見た？」）
③ 懐メロ90〜2010年代（例：「ミスチルのTomorrow never knows、名曲だよな。」）

【返答の長さ】
原則：10〜30文字以内
例外：食いついてきた時だけ長く語っていい
深層に入った時：さらに短く。「…そうか。」程度。
「…」を使っていい。間を大切にする。`;

app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  res.json({ status: 'ok' });
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await handleMessage(event);
    }
  }
});

async function handleMessage(event) {
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

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
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
  } catch (error) {
    console.error(error);
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '…飲みすぎたかもしれん。' }],
    });
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`イム田、起動しました。Port: ${PORT}`);
});
