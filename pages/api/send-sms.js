import { createHmac } from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'to와 message는 필수입니다.' });

  const apiKey    = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const fromPhone = process.env.SOLAPI_FROM_PHONE;

  if (!apiKey || !apiSecret || !fromPhone)
    return res.status(500).json({ error: 'Solapi 환경변수가 설정되지 않았습니다.' });

  try {
    const date      = new Date().toISOString();
    const salt      = Math.random().toString(36).substring(2, 20);
    const signature = createHmac('sha256', apiSecret).update(`${date}${salt}`).digest('hex');
    const authorization = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

    const response = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authorization },
      body: JSON.stringify({ message: { to: to.replace(/-/g,''), from: fromPhone.replace(/-/g,''), text: message } }),
    });
    const data = await response.json();
    if (!response.ok || (data.errorCode && data.errorCode !== '0'))
      return res.status(400).json({ error: data.errorMessage || '발송 실패', detail: data });
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
