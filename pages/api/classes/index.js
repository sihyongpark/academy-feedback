import supabase from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('classes').select('*').order('created_at');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { schedule, teacher_ids, subject, color, frequency } = req.body;
    const { data, error } = await supabase.from('classes').insert({ schedule, teacher_ids: teacher_ids||[], subject, color, frequency }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...fields } = req.body;
    const { data, error } = await supabase.from('classes').update(fields).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    const { error } = await supabase.from('classes').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
