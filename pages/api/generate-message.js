import supabase from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { student, record } = req.body;
  if (!student || !record) return res.status(400).json({ error: '필수 항목 누락' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY 미설정' });

  // 관리자 설정 가이드라인 불러오기
  let guideline = '';
  try {
    const { data } = await supabase.from('settings').select('value').eq('key','sms_guideline').single();
    if (data?.value) guideline = `\n\n[원장 가이드라인]\n${data.value}`;
  } catch {}

  const prompt = `다음 학생 수업 정보를 바탕으로 학부모에게 보낼 따뜻하고 전문적인 문자 메시지를 작성해줘.
규칙: 150자 이내, 첫 줄: "${student.name} 학생 어머니!", 이번 수업 내용 간략히, 칭찬 또는 개선 사항 한 가지, 마지막: "감사합니다 🙏"
학생: ${student.name} (${student.grade}), 과목: ${record.subject}, 진도: ${record.progress}, 과제: ${record.homework}, 점수: ${record.score}점, 태도: ${record.attitude}${record.note?`, 특이사항: ${record.note}`:''}${guideline}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: data.error?.message || '생성 실패' });
    return res.status(200).json({ message: data.content?.[0]?.text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
