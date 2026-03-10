import supabase from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('settings').select('key,value');
    if (error) return res.status(500).json({ error: error.message });
    const result = {};
    (data||[]).forEach(row => { result[row.key] = row.value; });
    return res.status(200).json(result);
  }

  if (req.method === 'PUT') {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key 누락' });
    const { error } = await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
