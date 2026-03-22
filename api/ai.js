export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY не настроен' });
  }

  let system = '';
  let userMessage = '';

  try {
    const body = req.body || {};
    system = body.system || '';
    userMessage = body.userMessage || '';
  } catch (e) {
    return res.status(400).json({ error: 'Ошибка чтения тела запроса' });
  }

  if (!userMessage.trim()) {
    return res.status(400).json({ error: 'userMessage пустой' });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const callClaude = async () => {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        system: system,
        messages: [
          { role: 'user', content: userMessage }
        ]
      })
    });
  };

  try {
    let claudeResp;
    let claudeData;

    // Retry up to 2 times on 429 with exponential backoff
    for (let attempt = 0; attempt <= 2; attempt++) {
      claudeResp = await callClaude();
      claudeData = await claudeResp.json().catch(() => null);

      if (claudeResp.status !== 429) break;

      if (attempt < 2) {
        await sleep(2000 * Math.pow(2, attempt)); // 2s, 4s
      }
    }

    if (!claudeResp.ok) {
      if (claudeResp.status === 429) {
        return res.status(429).json({
          error: 'Лимит запросов к AI исчерпан. Попробуйте через несколько минут.',
          isQuotaError: true
        });
      }
      const msg = claudeData?.error?.message || ('Claude статус ' + claudeResp.status);
      return res.status(500).json({ error: msg });
    }

    const rawText = claudeData?.content?.[0]?.text || '';

    const first = rawText.indexOf('{');
    const last  = rawText.lastIndexOf('}');

    if (first === -1 || last === -1 || last <= first) {
      return res.status(500).json({ error: 'Claude не вернул JSON', raw: rawText.slice(0, 300) });
    }

    const jsonText = rawText.slice(first, last + 1);

    try {
      JSON.parse(jsonText);
    } catch {
      return res.status(500).json({ error: 'Невалидный JSON от Claude', raw: jsonText.slice(0, 300) });
    }

    return res.status(200).json({ text: jsonText });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
