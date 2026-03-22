export default async function handler(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const { system = '', userMessage = '' } = body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${system}\n\n${userMessage}` }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1500,
          },
        }),
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data?.error?.message || 'Gemini error' }),
        { status: response.status, headers: corsHeaders }
      );
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const stripped = String(rawText).replace(/```json|```/gi, '').trim();

    const first = stripped.indexOf('{');
    const last = stripped.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) {
      return new Response(
        JSON.stringify({
          error: 'Gemini returned non-JSON response',
          raw: rawText.slice(0, 500),
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    const jsonText = stripped.slice(first, last + 1);
    JSON.parse(jsonText);

    return new Response(JSON.stringify({ text: jsonText }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error?.message || 'Server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
}
