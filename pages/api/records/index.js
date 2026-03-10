import supabase from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('records').select('*').order('date', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { student_id, date, subject, progress, homework, score, attitude, note, send_status } = req.body;
    if (!student_id || !progress) return res.status(400).json({ error: '필수 항목 누락' });
    const { data, error } = await supabase.from('records').insert({
      student_id, date, subject, progress,
      homework: homework||'완료',
      score: parseInt(score)||0,
      attitude: attitude||'보통',
      note: note||'',
      send_status: send_status||'안함',
      sent_at: null, sent_message: null,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...fields } = req.body;
    if (fields.score !== undefined) fields.score = parseInt(fields.score)||0;
    const { data, error } = await supabase.from('records').update(fields).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (Array.isArray(id)) {
      const { error } = await supabase.from('records').delete().in('id', id);
      if (error) return res.status(400).json({ error: error.message });
    } else {
      const { error } = await supabase.from('records').delete().eq('id', id);
      if (error) return res.status(400).json({ error: error.message });
    }
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
