/**
 * 긴급 관리자 비밀번호 초기화
 * POST /api/auth/admin-reset
 * Body: { resetKey: "...", newPassword: "..." }
 *
 * 환경변수 ADMIN_RESET_KEY 와 일치해야만 실행됩니다.
 * Vercel → Settings → Environment Variables 에서 설정하세요.
 */
import supabase from '../../../lib/supabase';
import { hashPassword } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { resetKey, newPassword } = req.body;

  if (!process.env.ADMIN_RESET_KEY || resetKey !== process.env.ADMIN_RESET_KEY)
    return res.status(403).json({ error: '유효하지 않은 초기화 키입니다.' });

  if (!newPassword || newPassword.length < 4)
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });

  const hash = await hashPassword(newPassword);
  await supabase.from('users').update({ password_hash: hash }).eq('role', 'admin');

  return res.status(200).json({ ok: true, message: '관리자 비밀번호가 초기화되었습니다.' });
}
