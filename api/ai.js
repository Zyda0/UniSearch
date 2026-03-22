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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY не настроен' });
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

  try {
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: system + '\n\nЗапрос клиента: ' + userMessage }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2000
          }
        })
      }
    );

    const geminiData = await geminiResp.json().catch(() => null);

    if (!geminiResp.ok) {
      const msg = geminiData?.error?.message || ('Gemini статус ' + geminiResp.status);
      return res.status(500).json({ error: msg });
    }

    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const first = rawText.indexOf('{');
    const last  = rawText.lastIndexOf('}');

    if (first === -1 || last === -1 || last <= first) {
      return res.status(500).json({ error: 'Gemini не вернул JSON', raw: rawText.slice(0, 300) });
    }

    const jsonText = rawText.slice(first, last + 1);

    try {
      JSON.parse(jsonText);
    } catch {
      return res.status(500).json({ error: 'Невалидный JSON от Gemini', raw: jsonText.slice(0, 300) });
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
