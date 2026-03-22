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
    return res.status(500).json({ error: 'GEMINI_API_KEY не настроен в переменных окружения Vercel' });
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Неверный JSON в теле запроса' });
  }

  const { system = '', userMessage = '' } = body;

  if (!userMessage.trim()) {
    return res.status(400).json({ error: 'userMessage не может быть пустым' });
  }

  try {
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
      const msg = geminiData?.error?.message || ('Gemini вернул статус ' + geminiResp.status);
      return res.status(geminiResp.status).json({ error: msg });
    }

    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const first = rawText.indexOf('{');
    const last  = rawText.lastIndexOf('}');

    if (first === -1 || last === -1 || last <= first) {
      return res.status(500).json({
        error: 'Gemini вернул ответ без JSON',
        raw: rawText.slice(0, 300)
      });
    }

    const jsonText = rawText.slice(first, last + 1);

    try {
      JSON.parse(jsonText);
    } catch {
      return res.status(500).json({
        error: 'Gemini вернул невалидный JSON',
        raw: jsonText.slice(0, 300)
      });
    }

    return res.status(200).json({ text: jsonText });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Внутренняя ошибка сервера' });
  }
}
