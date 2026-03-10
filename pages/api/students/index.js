import supabase from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('students').select('*').order('created_at');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { name, grade, phone, subject, parent_name, class_id, recipients, schedule_slots, teacher_ids, memo } = req.body;
    if (!name) return res.status(400).json({ error: '이름은 필수입니다.' });
    const { data, error } = await supabase.from('students').insert({
      name, grade, phone, subject, parent_name,
      class_id: class_id || null,
      recipients: recipients || [],
      schedule_slots: schedule_slots || [],
      teacher_ids: teacher_ids || [],
      memo: memo || '',
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...fields } = req.body;
    if (fields.class_id === '') fields.class_id = null;
    const { data, error } = await supabase.from('students').update(fields).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
