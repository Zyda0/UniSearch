export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD не настроен на сервере' });
  }

  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Пароль не передан' });
  }

  if (password !== adminPassword) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }

  return res.status(200).json({ ok: true });
}

export const config = {
  api: {
    bodyParser: true,
  },
};
