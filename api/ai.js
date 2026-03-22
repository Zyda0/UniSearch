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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY не настроен' });
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

  const callGroq = async () => {
    return fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage }
        ]
      })
    });
  };

  try {
    let groqResp;
    let groqData;

    for (let attempt = 0; attempt <= 2; attempt++) {
      groqResp = await callGroq();
      groqData = await groqResp.json().catch(() => null);

      if (groqResp.status !== 429) break;

      if (attempt < 2) {
        await sleep(2000 * Math.pow(2, attempt));
      }
    }

    if (!groqResp.ok) {
      if (groqResp.status === 429) {
        return res.status(429).json({
          error: 'Лимит запросов к AI исчерпан. Попробуйте через несколько минут.',
          isQuotaError: true
        });
      }
      const msg = groqData?.error?.message || ('Groq статус ' + groqResp.status);
      return res.status(500).json({ error: msg });
    }

    const rawText = groqData?.choices?.[0]?.message?.content || '';

    const first = rawText.indexOf('{');
    const last  = rawText.lastIndexOf('}');

    if (first === -1 || last === -1 || last <= first) {
      return res.status(500).json({ error: 'AI не вернул JSON', raw: rawText.slice(0, 300) });
    }

    const jsonText = rawText.slice(first, last + 1);

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return res.status(500).json({ error: 'Невалидный JSON от AI', raw: jsonText.slice(0, 300) });
    }

    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      return res.status(500).json({ error: 'AI вернул неверную структуру JSON (ожидается объект)', raw: jsonText.slice(0, 300) });
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
