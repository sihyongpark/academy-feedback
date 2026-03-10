import supabase from '../../../lib/supabase';
import { verifyPassword } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { id, password } = req.body;
  if (!id || !password) return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });

  const { data: user, error } = await supabase
    .from('users').select('*').eq('id', id).single();

  if (error || !user) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

  return res.status(200).json({ id: user.id, name: user.name, role: user.role });
}
