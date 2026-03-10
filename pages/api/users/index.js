import supabase from '../../../lib/supabase';
import { hashPassword } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('users').select('id,name,role,created_at').order('created_at');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { id, name, role, password } = req.body;
    if (!id || !name || !password) return res.status(400).json({ error: '필수 항목 누락' });
    const password_hash = await hashPassword(password);
    const { data, error } = await supabase.from('users').insert({ id, name, role: role||'teacher', password_hash }).select('id,name,role').single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const { id, newId, name, role } = req.body;
    if (!id) return res.status(400).json({ error: 'id 누락' });

    if (newId && newId !== id) {
      const { data: existing } = await supabase.from('users').select('password_hash').eq('id', id).single();
      if (!existing) return res.status(404).json({ error: '사용자 없음' });

      const { error: insertErr } = await supabase.from('users').insert({
        id: newId, name, role, password_hash: existing.password_hash,
      });
      if (insertErr) return res.status(400).json({ error: insertErr.message });

      const { data: allStudents } = await supabase.from('students').select('id, teacher_ids');
      for (const s of (allStudents || [])) {
        if ((s.teacher_ids || []).includes(id)) {
          await supabase.from('students').update({ teacher_ids: s.teacher_ids.map(x => x===id?newId:x) }).eq('id', s.id);
        }
      }

      const { data: allClasses } = await supabase.from('classes').select('id, teacher_ids');
      for (const c of (allClasses || [])) {
        if ((c.teacher_ids || []).includes(id)) {
          await supabase.from('classes').update({ teacher_ids: c.teacher_ids.map(x => x===id?newId:x) }).eq('id', c.id);
        }
      }

      await supabase.from('users').delete().eq('id', id);
      return res.status(200).json({ id: newId, name, role });
    }

    const { data, error } = await supabase.from('users').update({ name, role }).eq('id', id).select('id,name,role').single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
