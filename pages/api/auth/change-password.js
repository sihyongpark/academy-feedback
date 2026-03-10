import supabase from '../../../lib/supabase';
import { verifyPassword, hashPassword } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { userId, currentPassword, newPassword } = req.body;
  if (!userId || !currentPassword || !newPassword)
    return res.status(400).json({ error: '모든 항목을 입력하세요.' });
  if (newPassword.length < 4)
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });

  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });

  const hash = await hashPassword(newPassword);
  await supabase.from('users').update({ password_hash: hash }).eq('id', userId);
  return res.status(200).json({ ok: true });
}
