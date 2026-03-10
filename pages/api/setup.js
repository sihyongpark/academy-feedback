/**
 * 최초 1회 실행용 셋업 API
 * GET /api/setup → admin 계정을 올바른 비밀번호 해시로 생성/업데이트
 * 완료 후 Vercel에서 이 파일을 삭제하세요.
 */
import supabase from '../../lib/supabase';
import { hashPassword } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const password_hash = await hashPassword('admin1234');

    // 기존 admin 삭제 후 재생성
    await supabase.from('users').delete().eq('id', 'admin');
    const { data, error } = await supabase.from('users').insert({
      id: 'admin',
      name: '관리자',
      role: 'admin',
      password_hash,
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      ok: true,
      message: 'admin 계정 생성 완료! 비밀번호: admin1234',
      user: { id: data.id, name: data.name, role: data.role },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
