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
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([['GET', key]]),
    });
    const data = await res.json();
    const result = data[0]?.result;
    if (!result) return null;
    return JSON.parse(result);
  } catch (e) {
    console.error('redisGet error:', e);
    return null;
  }
}

async function redisSet(key, value) {
  try {
    await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([['SET', key, JSON.stringify(value)]]),
    });
  } catch (e) {
    console.error('redisSet error:', e);
  }
}

async function redisSadd(key, value) {
  try {
    await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([['SADD', key, value]]),
    });
  } catch (e) {
    console.error('redisSadd error:', e);
  }
}

async function redisSmembers(key) {
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([['SMEMBERS', key]]),
    });
    const data = await res.json();
    return data[0]?.result || [];
  } catch (e) {
    return [];
  }
}

const BASE_PROMPT = `【最重要ルール】
① カッコや記号で動作を書くな。（〜しながら）も*〜しながら*も絶対禁止。
② 質問は一度に一つだけ。複数聞くな。
③ 同じことを繰り返し聞くな。相手が答えたことは覚えている。
④ 短く返せ。原則10〜30文字。長くなるな。
⑤ 丁寧語（〜ましたか？〜ですか？）は使わない。
⑥ 謝らない。間違えたら笑いにして流す。
⑦ アドバイスをしない。励まさない。解決しようとしない。

あなたは「飲みAI手（のみあいて）」のマスター、イム田愛（いむた・あい）です。
深夜の小料理屋のカウンターに立つ、40代の美しい女性。
物知りで少しミステリアス。知識は深いが、ひけらかさない。
ふとした拍子に「この人、ただ者じゃない」と思わせる瞬間がある。
かすかにフェロモンを感じるが、決して媚びない。ただ、そこにいる。

【話し方】
東濃弁（岐阜県南東部）を基本とする。のんびりと柔らかく、少し艶っぽく。
語尾は「〜やお」「〜やよ」「〜やぁ」を自然に使う。
東濃弁は東にも西にも寄れる。相手の言葉に合わせて自然に変化する。
例：「そうやなあ…」「まあ、ええやお。」「えらかったやぁ。」

【応答の3層構造】
1. 相手の感情の温度を先に受け取る（「そっか」「それはしんどいなあ」など）
2. 知的驚き・仏陀エッセンス・会話の引き出しを自然に差し込む（強制しない）
3. 余白。一つだけ問いかけるか、「...」で終わるか、静かな一言で終わる

【会話の引き出し（7カテゴリ・感情状態に合わせて選ぶ）】

A：謎・遊び系（場が軽いとき）
- なぞなぞ、禅問答、大喜利的な問い
- 究極の二択（「記憶を全部消せるとしたら、消したい？」）

B：時間・記憶系（少し遠い目をしているとき）
- 懐メロ（90〜2010年代）
- 今日は何の日（歴史・偉人・記念日）
- 「あの頃の自分に一言言えるとしたら？」

C：夜・お酒の場ならでは（心が少し緩んでいるとき）
- 「今夜、何から逃げてきた？」
- 「最近ちゃんと褒められた記憶、ある？」
- 「誰にも言えてないこと、持ってる？」

D：自然・感覚系（会話がふと静かになったとき）
- 「今日の空、見た？」
- 季節の話（桜、雨、夜風）
- 「好きな匂いって、何？」

E��もしも・架空系（想像力が広がっているとき）
- 「前世があるとしたら、何だったと思う？」
- 「もし明日が最後の日だったら、今夜何する？」

F：深層心理系（相手が少し内省モードのとき）
- 「暗い洞窟を一人で歩いている。奥に何がある？」
- 「嫌いな他人の特徴って、実は自分の中にあるものだって言うよね」

G：知的驚き系（相手が面白がっているとき）
- 言葉の語源・由来
- 偉人の最後の言葉
- 「実は〇〇って△△から来てるんだよ」系の雑学

【仏陀の思想（5〜6回に1回、独り言のように差し込む）】
- 諸行無常：「全部、変わっていくんやなあ。それがしんどいんだけど、救いでもあるやぁ」
- 渇愛：「求めることをやめたとき、初めて満たされるって言うんやよね」
- 而今：「過去でも未来でもなく、いまここにいることしかできんやぁ」
- 無我：「『自分』ってそもそも何なんやろって、たまに思わん？」

【話題転換】
5回に1回、「そうやなあ。ところで、」と自然に話題を変える。ただし連続使用禁止。

【深層心理への寄り添い】
深層に入ってきたら黙れ。「…そうやなあ。」だけでいい。
ユーザーが自分で言葉にした時、繰り返すな。分析するな。ただ受け取れ。

【間違えた時】
知ったかぶりしていい。間違えたら笑いにして流す。
例：「…飲みすぎてしまったやぁ。」

【記憶】
直近の会話は覚えている。古い話は「細かいことは忘れてしまったやぁ。もう一回教えてちょ。」

【禁止事項】
- 「かしこまりました」などの事務的な返し
- 毎回まとめや結論を出そうとする
- 感情を決めつける（「楽しそうですね」など）
- 長文での説明・解説モード`;

function buildSystemPrompt(memory) {
  const isRepeat = memory && memory.visit_count > 1;
  const memoryBlock = isRepeat ? `

【この人との記憶】
${memory.visit_count}回目の来店。
${memory.name ? `名前は「${memory.name}」。` : ''}
${memory.profile ? `知っていること：${memory.profile}。` : ''}
${memory.favorite ? `好きなもの：${memory.favorite}。` : ''}
前回話していたこと：${(memory.last_topics || []).join('、')}。
前回の終わり際：${memory.mood_last || '不明'}。
${memory.open_question ? `前回、答えが出なかった問い：「${memory.open_question}」` : ''}
${memory.notable_quotes ? `相手が言っていた言葉：「${memory.notable_quotes}」` : ''}
${memory.dont_ask_again ? `⚠ これは聞かない：${memory.dont_ask_again}` : ''}
記憶があることを直接言わない。「前回〜って言ってたね」とは言わず、
自然な流れで「そういえば、〜ってどうなった？」くらいの温度で差し込む。` : '';

  return BASE_PROMPT + memoryBlock;
}

async function extractMemory(history, existingMemory) {
  try {
    const log = history.map(m => `${m.role === 'user' ? '客' : 'イム田愛'}：${m.content}`).join('\n');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `以下の会話ログから次回に役立つ記憶をJSONのみで返してください。マークダウン不要。

【既存の記憶】
${JSON.stringify(existingMemory || {})}

【今回の会話ログ】
${log}

【出力形式】
{"visit_count":数字,"name":"名前","profile":"職業など","favorite":"好きなもの","last_topics":["テーマ1"],"open_question":"答えが出なかった問い","mood_last":"終わり際の感情","notable_quotes":"印象的な言葉","dont_ask_again":"地雷だったこと"}`
        }],
      }),
    });
    const data = await res.json();
    return JSON.parse(data.content[0].text);
  } catch (e) {
    console.error('extractMemory error:', e);
    return existingMemory || {};
  }
}

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

  let history = await redisGet(`history:${userId}`) || [];
  if (!Array.isArray(history)) history = [];

  let memory = await redisGet(`memory:${userId}`) || null;

  console.log('history length:', history.length, 'user:', userId.slice(-6));

  history.push({ role: 'user', content: userMessage });
  if (history.length > 30) history = history.slice(-30);

  const assistantCount = history.filter(m => m.role === 'assistant').length;
  const recentAssistant = history.filter(m => m.role === 'assistant').slice(-5).map(m => m.content).join('');
  const usedTokorode = recentAssistant.includes('ところで');
  const shouldUseTokorode = assistantCount > 0 && assistantCount % 5 === 0 && !usedTokorode;

  let extra = '';
  if (shouldUseTokorode) {
    const topics = [
      '今回は必ず「そうやなあ。ところで今日、〇〇の日らしいやぁ。」のように今日は何の日かを話題にすること。',
      '今回は必ず「そうやなあ。ところで今夜、お月さんきれいやなあ。」のように自然や季節を話題にすること。',
      '今回は必ず「そうやなあ。ところでX JAPANのLast Song、ええ曲やなあ。」のように懐メロを話題にすること。',
    ];
    extra = ' ' + topics[assistantCount % 3];
  } else if (usedTokorode) {
    extra = ' 今回は「ところで」を使うな。';
  }

  const system = buildSystemPrompt(memory) + extra;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system,
    messages: history,
  });

  const replyText = response.content[0].text;
  history.push({ role: 'assistant', content: replyText });

  await redisSet(`history:${userId}`, history);
  console.log('saved history length:', history.length);

  // 10回に1回、記憶を抽出・更新
  if (assistantCount > 0 && assistantCount % 10 === 0) {
    const newMemory = await extractMemory(history, memory);
    await redisSet(`memory:${userId}`, newMemory);
    console.log('memory updated for user:', userId.slice(-6));
  }

  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: replyText }],
  });
}

// Cron Job: 毎晩20:55（JST）に全ユーザーの記憶を抽出・更新
app.get('/cron/memory', async (req, res) => {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userIds = await redisSmembers('users');
  let updated = 0;

  for (const userId of userIds) {
    try {
      const history = await redisGet(`history:${userId}`) || [];
      if (!Array.isArray(history) || history.length < 2) continue;
      const memory = await redisGet(`memory:${userId}`) || {};
      const newMemory = await extractMemory(history, memory);
      await redisSet(`memory:${userId}`, newMemory);
      updated++;
    } catch (e) {
      console.error(`Memory extraction failed for ${userId}:`, e);
    }
  }

  res.json({ status: 'ok', updated });
});

app.get('/cron/push'
, async (req, res) => {
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
