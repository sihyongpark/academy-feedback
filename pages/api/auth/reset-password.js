import supabase from '../../../lib/supabase';
import { hashPassword, generateTempPassword } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { adminId, targetUserId } = req.body;

  // 관리자 확인
  const { data: admin } = await supabase.from('users').select('role').eq('id', adminId).single();
  if (!admin || admin.role !== 'admin')
    return res.status(403).json({ error: '관리자만 비밀번호를 초기화할 수 있습니다.' });

  const tempPw = generateTempPassword();
  const hash = await hashPassword(tempPw);
  await supabase.from('users').update({ password_hash: hash }).eq('id', targetUserId);

  return res.status(200).json({ tempPassword: tempPw });
}
