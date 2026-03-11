import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import * as XLSX from 'xlsx';

// ═══ CONSTANTS ═══════════════════════════════════════════════════════
const GRADE_ORDER = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3','기타'];

// ─── Excel 양식 다운로드 ───────────────────────────────────────────────
function downloadTemplate() {
  import('xlsx').then(XLSX => {
    const headers = [['이름','학년','성별','학교','과목','학부모이름','학부모연락처','학생연락처','메모']];
    const sample  = [['홍길동','중1','남','서강중학교','수학','홍부모','010-1234-5678','010-9999-0000','특이사항 없음']];
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...sample]);
    ws['!cols'] = [{wch:10},{wch:8},{wch:6},{wch:14},{wch:8},{wch:12},{wch:16},{wch:16},{wch:20}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '학생목록');
    XLSX.writeFile(wb, '학생_업로드_양식.xlsx');
  });
}

// ─── Excel 파싱 → student 배열 ──────────────────────────────────────────
function parseExcel(file) {
  return new Promise((resolve, reject) => {
    import('xlsx').then(XLSX => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, {type:'array'});
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
          const students = rows.map(r => ({
            name:         String(r['이름']||'').trim(),
            grade:        String(r['학년']||'중1').trim(),
            gender:       String(r['성별']||'').trim(),
            school:       String(r['학교']||'').trim(),
            subject:      String(r['과목']||'').trim(),
            parent_name:  String(r['학부모이름']||'').trim(),
            phone:        String(r['학부모연락처']||'').trim(),
            student_phone:String(r['학생연락처']||'').trim(),
            memo:         String(r['메모']||'').trim(),
            status:       '재원',
            recipients:   [],
            schedule_slots:[],
            teacher_ids:  [],
          })).filter(s=>s.name);
          resolve(students);
        } catch(err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  });
}
const CLASS_COLORS = ['#2d6a4f','#1d4ed8','#6d28d9','#b45309','#be185d','#0e7490','#374151','#15803d'];
const SUBJECT_LIST = ['수학','영어','국어','과학','사회','기타'];
const FREQ_OPTIONS = ['주 1회','주 2회','주 3회','주 4회','주 5회'];
const SEND_STATUS  = ['안함','대기','완료','오류'];
const DAYS = ['월','화','수','목','금','토'];
const TIMES = Array.from({length:14}, (_,i) => `${String(i+9).padStart(2,'0')}:00`);

// ═══ AUTH CONTEXT ════════════════════════════════════════════════════
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

// ═══ API HELPER ═══════════════════════════════════════════════════════
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {'Content-Type':'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API 오류');
  return data;
}

// ═══ SHARED UI ════════════════════════════════════════════════════════
const hwBadge = hw => hw==='완료'?<span className="badge bgr">✓ 완료</span>:hw==='일부'?<span className="badge bw">△ 일부</span>:<span className="badge br">✗ 미제출</span>;
const attBadge = a => a==='매우좋음'?<span className="badge bgr">😊 매우 좋음</span>:a==='보통'?<span className="badge bg">🙂 보통</span>:<span className="badge bw">😐 노력 필요</span>;
const scoreColor = s => s>=80?'#2d6a4f':s>=60?'#b5850a':'#c1440e';
function SendStatusBadge({status}){const icon=status==='완료'?'✓ ':status==='대기'?'⏳ ':status==='오류'?'✗ ':'';return <span className={`badge status-${status}`}>{icon}{status}</span>;}
function Spinner(){return <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:60,color:'#6b6560',fontSize:14}}>⏳ 불러오는 중...</div>;}

// ═══ SCHEDULE PICKER ══════════════════════════════════════════════════
function SchedulePicker({value=[], onChange}) {
  const toggle = (day, time) => {
    const exists = value.find(s=>s.day===day&&s.time===time);
    onChange(exists ? value.filter(s=>!(s.day===day&&s.time===time)) : [...value, {day, time}]);
  };
  const isSel = (day, time) => !!value.find(s=>s.day===day&&s.time===time);
  return (
    <div style={{overflowX:'auto', border:'1px solid #e0dbd2', borderRadius:8}}>
      <table style={{borderCollapse:'collapse', fontSize:11, minWidth:300}}>
        <thead>
          <tr>
            <th style={{padding:'5px 8px', background:'#f0ede8', fontWeight:600, fontSize:11, color:'#6b6560'}}></th>
            {DAYS.map(d=><th key={d} style={{padding:'5px 10px', background:'#f0ede8', fontWeight:700, fontSize:12, textAlign:'center', color:'#1a1814'}}>{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {TIMES.map(t=>(
            <tr key={t}>
              <td style={{padding:'3px 8px', fontSize:11, color:'#6b6560', whiteSpace:'nowrap', background:'#f7f6f2', borderRight:'1px solid #e0dbd2'}}>{t}</td>
              {DAYS.map(d=>(
                <td key={d} onClick={()=>toggle(d,t)} style={{
                  padding:'4px 6px', textAlign:'center', cursor:'pointer', userSelect:'none',
                  background:isSel(d,t)?'#2d6a4f':'#fff',
                  color:isSel(d,t)?'#fff':'transparent',
                  border:'1px solid #e0dbd2', transition:'all .1s',
                  fontSize:11, fontWeight:700,
                }}>✓</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {value.length>0&&<div style={{padding:'8px 12px', background:'#f0faf4', borderTop:'1px solid #e0dbd2', fontSize:12, color:'#2d6a4f'}}>
        선택: {value.sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.time.localeCompare(b.time)).map(s=>`${s.day} ${s.time}`).join(', ')}
      </div>}
    </div>
  );
}

// ═══ RECIPIENTS EDITOR ════════════════════════════════════════════════
function RecipientsEditor({value=[], onChange}) {
  const add = () => onChange([...value, {label:'어머니', phone:''}]);
  const upd = (i,k,v) => onChange(value.map((r,idx)=>idx===i?{...r,[k]:v}:r));
  const del = (i) => onChange(value.filter((_,idx)=>idx!==i));
  return (
    <div>
      {value.map((r,i)=>(
        <div key={i} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
          <input className="form-input" value={r.label} onChange={e=>upd(i,'label',e.target.value)} placeholder="구분 (어머니/아버지...)" style={{width:140}}/>
          <input className="form-input" value={r.phone} onChange={e=>upd(i,'phone',e.target.value)} placeholder="010-0000-0000" style={{flex:1}}/>
          <button className="btn btn-d btn-sm" onClick={()=>del(i)} style={{padding:'5px 8px'}}>✕</button>
        </div>
      ))}
      <button className="btn btn-s btn-sm" onClick={add}>+ 연락처 추가</button>
    </div>
  );
}

// ═══ LOGIN ════════════════════════════════════════════════════════════
function Login({onLogin}) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit() {
    if (!id||!pw) return setErr('아이디와 비밀번호를 입력하세요.');
    setLoading(true); setErr('');
    try {
      const user = await api('POST', '/api/auth/login', {id, password:pw});
      onLogin(user);
    } catch(e) { setErr(e.message); }
    setLoading(false);
  }
  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{textAlign:"center",marginBottom:8}}><img src="/logo.jpg" style={{width:90,borderRadius:6}}/></div>
        <div className="login-title">서강학원 피드백 관리</div>
        <div className="login-sub">계정으로 로그인하세요</div>
        {err&&<div className="login-err">{err}</div>}
        <div className="form-grid">
          <div className="form-group"><label className="form-label">아이디</label><input className="form-input" value={id} onChange={e=>setId(e.target.value)} placeholder="아이디 입력" onKeyDown={e=>e.key==='Enter'&&submit()}/></div>
          <div className="form-group"><label className="form-label">비밀번호</label><input className="form-input" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="비밀번호 입력" onKeyDown={e=>e.key==='Enter'&&submit()}/></div>
          <button className="btn btn-p" style={{width:'100%',justifyContent:'center',marginTop:4}} onClick={submit} disabled={loading}>{loading?'로그인 중...':'로그인'}</button>
        </div>
      </div>
    </div>
  );
}

// ═══ PASSWORD MODAL ════════════════════════════════════════════════════
function PasswordModal({userId, onClose}) {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nw2, setNw2] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  async function submit() {
    if (nw!==nw2) return setErr('새 비밀번호가 일치하지 않습니다.');
    if (nw.length<4) return setErr('비밀번호는 4자 이상이어야 합니다.');
    try {
      await api('POST','/api/auth/change-password',{userId, currentPassword:cur, newPassword:nw});
      setMsg('비밀번호가 변경되었습니다.'); setErr('');
    } catch(e) { setErr(e.message); }
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
        <div className="modal-hd"><div className="modal-title">🔑 비밀번호 변경</div><button className="modal-x" onClick={onClose}>✕</button></div>
        {msg?<div style={{color:'#2d6a4f',textAlign:'center',padding:20}}>{msg}<br/><button className="btn btn-p btn-sm" style={{marginTop:12}} onClick={onClose}>닫기</button></div>
        :<div className="form-grid">
          {err&&<div className="login-err">{err}</div>}
          <div className="form-group"><label className="form-label">현재 비밀번호</label><input className="form-input" type="password" value={cur} onChange={e=>setCur(e.target.value)}/></div>
          <div className="form-group"><label className="form-label">새 비밀번호</label><input className="form-input" type="password" value={nw} onChange={e=>setNw(e.target.value)}/></div>
          <div className="form-group"><label className="form-label">새 비밀번호 확인</label><input className="form-input" type="password" value={nw2} onChange={e=>setNw2(e.target.value)}/></div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button className="btn btn-s" onClick={onClose}>취소</button>
            <button className="btn btn-p" onClick={submit}>변경</button>
          </div>
        </div>}
      </div>
    </div>
  );
}

// ═══ RECORD MODAL ══════════════════════════════════════════════════════
function RecordModal({student, initial, onSave, onClose}) {
  const isEdit = !!initial?.id;
  const blank = {date:new Date().toISOString().split('T')[0], subject:student?.subject?.split(',')[0].trim()||'수학', progress:'', homework:'완료', score:'', attitude:'보통', note:'', send_status:'안함'};
  const [form, setForm] = useState(isEdit?{...initial,score:String(initial.score)}:blank);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hd">
          <div><div className="modal-title">{isEdit?'수업 기록 수정':'수업 기록 추가'}</div><div className="modal-sub">{student?.name} · {student?.grade}</div></div>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <div className="form-group"><label className="form-label">날짜 *</label><input type="date" className="form-input" value={form.date} onChange={e=>f('date',e.target.value)}/></div>
            <div className="form-group"><label className="form-label">과목</label><select className="form-select" value={form.subject} onChange={e=>f('subject',e.target.value)}>{SUBJECT_LIST.map(s=><option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="form-group"><label className="form-label">진도 *</label><input className="form-input" value={form.progress} onChange={e=>f('progress',e.target.value)} placeholder="예) 중2 수학 2단원 일차방정식"/></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">점수</label><input type="number" className="form-input" value={form.score} onChange={e=>f('score',e.target.value)} min="0" max="100"/></div>
            <div className="form-group"><label className="form-label">과제</label><select className="form-select" value={form.homework} onChange={e=>f('homework',e.target.value)}><option>완료</option><option>일부</option><option>미제출</option></select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">태도</label><select className="form-select" value={form.attitude} onChange={e=>f('attitude',e.target.value)}><option value="매우좋음">😊 매우 좋음</option><option value="보통">🙂 보통</option><option value="노력필요">😐 노력 필요</option></select></div>
            <div className="form-group"><label className="form-label">발송 상태</label><select className="form-select" value={form.send_status} onChange={e=>f('send_status',e.target.value)}>{SEND_STATUS.map(s=><option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="form-group"><label className="form-label">특이사항</label><textarea className="form-textarea" value={form.note} onChange={e=>f('note',e.target.value)}/></div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
            <button className="btn btn-s" onClick={onClose}>취소</button>
            <button className="btn btn-p" onClick={()=>onSave(form)} disabled={!form.progress}>{isEdit?'수정 저장':'추가'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ STUDENT DETAIL ════════════════════════════════════════════════════
function StudentDetail({studentId, students, setStudents, records, setRecords, onBack, classes, users}) {
  const student = students.find(s=>s.id===studentId);
  const [recModal, setRecModal] = useState(null);
  const [editInfo, setEditInfo] = useState(false);
  const [infoForm, setInfoForm] = useState(null);
  const [sel, setSel] = useState([]);
  const [confirmType, setConfirmType] = useState(null);

  useEffect(()=>{ if(student) setInfoForm({...student, recipients: student.recipients||[], schedule_slots: student.schedule_slots||[], teacher_ids: student.teacher_ids||[], student_phone: student.student_phone||'', gender: student.gender||'', school: student.school||'', status: student.status||'재원'}); }, [studentId]);

  if (!student) { onBack(); return null; }

  const myRecs = records.filter(r=>r.student_id===student.id).sort((a,b)=>b.date.localeCompare(a.date));
  const avg = myRecs.length ? Math.round(myRecs.reduce((s,r)=>s+r.score,0)/myRecs.length) : 0;
  const cls = classes?.find(c=>c.id===student.class_id);
  const allSel = sel.length===myRecs.length&&myRecs.length>0;
  const teachers = users;

  async function saveRecord(form) {
    const data = {...form, score:parseInt(form.score)||0};
    try {
      if (recModal?.id) {
        const updated = await api('PUT','/api/records',{id:recModal.id,...data});
        setRecords(p=>p.map(r=>r.id===recModal.id?updated:r));
      } else {
        const created = await api('POST','/api/records',{student_id:student.id,...data});
        setRecords(p=>[...p,created]);
      }
    } catch(e) { alert(e.message); }
    setRecModal(null);
  }

  async function doDelete() {
    const ids = confirmType==='all' ? myRecs.map(r=>r.id) : sel;
    try {
      await api('DELETE','/api/records',{id:ids});
      setRecords(p=>p.filter(r=>!ids.includes(r.id)));
      setSel([]); setConfirmType(null);
    } catch(e) { alert(e.message); }
  }

  async function saveInfo() {
    try {
      const updated = await api('PUT','/api/students',{...infoForm});
      setStudents(p=>p.map(s=>s.id===updated.id?updated:s));
      setEditInfo(false);
    } catch(e) { alert(e.message); }
  }

  function toggleTeacher(uid) {
    setInfoForm(p=>{const ids=p.teacher_ids||[];return{...p,teacher_ids:ids.includes(uid)?ids.filter(x=>x!==uid):[...ids,uid]};});
  }

  function exportExcel() {
    const data = myRecs.map(r=>({'날짜':r.date,'과목':r.subject,'진도':r.progress,'과제':r.homework,'점수':r.score,'태도':r.attitude,'특이사항':r.note,'발송상태':r.send_status,'발송일시':r.sent_at||'-','발송메시지':r.sent_message||'-'}));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols']=[10,8,30,8,6,10,20,8,16,40].map(w=>({wch:w}));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'수업기록');
    XLSX.writeFile(wb,`${student.name}_수업기록_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← 목록으로</button>

      {/* 학생 정보 헤더 */}
      <div className="card" style={{marginBottom:16}}>
        {!editInfo ? (
          <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
            <div className="detail-av" style={{background:cls?.color||'#2d6a4f'}}>{student.name[0]}</div>
            <div style={{flex:1}}>
              <div className="detail-name">{student.name}</div>
              <div className="detail-meta">
                {student.grade} · {student.subject} · {student.parent_name} · {student.phone}
                {cls&&<span style={{marginLeft:8}}><span className="dot" style={{background:cls.color,marginRight:4}}/>{cls.schedule}</span>}
              </div>
              {(student.recipients||[]).length>0&&<div style={{fontSize:12,color:'#6b6560',marginTop:4}}>
                연락처: {student.recipients.map((r,i)=><span key={i} style={{marginRight:10}}>👤 {r.label} {r.phone}</span>)}
              </div>}
              {student.memo&&<div style={{fontSize:12,color:'#6b6560',marginTop:2}}>메모: {student.memo}</div>}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0,alignItems:'flex-end'}}>
              <div style={{display:'flex',gap:12,marginBottom:4}}>
                <div style={{textAlign:'center'}}><div className="stat-num" style={{fontSize:22}}>{myRecs.length}</div><div style={{fontSize:12,color:'#6b6560'}}>총 수업</div></div>
                <div style={{width:1,background:'#e0dbd2'}}/>
                <div style={{textAlign:'center'}}><div className="stat-num" style={{fontSize:22}}>{avg}</div><div style={{fontSize:12,color:'#6b6560'}}>평균 점수</div></div>
              </div>
              <div style={{display:'flex',gap:6}}>
                <button className="btn btn-s btn-sm" onClick={()=>setEditInfo(true)}>✏️ 정보 수정</button>
                <button className="btn btn-p btn-sm" onClick={()=>setRecModal('add')}>+ 수업 기록 추가</button>
                <button className="btn btn-xl btn-sm" onClick={exportExcel}>📥 엑셀</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="form-grid">
            <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>학생 정보 수정</div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">이름</label><input className="form-input" value={infoForm.name} onChange={e=>setInfoForm(p=>({...p,name:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">학년</label><select className="form-select" value={infoForm.grade} onChange={e=>setInfoForm(p=>({...p,grade:e.target.value}))}>{GRADE_ORDER.map(g=><option key={g}>{g}</option>)}</select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">과목</label><input className="form-input" value={infoForm.subject} onChange={e=>setInfoForm(p=>({...p,subject:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">주 연락처</label><input className="form-input" value={infoForm.phone} onChange={e=>setInfoForm(p=>({...p,phone:e.target.value}))}/></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">학부모 이름</label><input className="form-input" value={infoForm.parent_name} onChange={e=>setInfoForm(p=>({...p,parent_name:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">클래스</label>
                <select className="form-select" value={infoForm.class_id||''} onChange={e=>setInfoForm(p=>({...p,class_id:e.target.value?parseInt(e.target.value):null}))}>
                  <option value="">미배정</option>{classes.map(c=><option key={c.id} value={c.id}>{c.schedule}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">담당 교사</label>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,padding:'10px 12px',border:'1px solid #e0dbd2',borderRadius:8}}>
                {teachers.map(u=>{const chk=(infoForm.teacher_ids||[]).includes(u.id);return(
                  <label key={u.id} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',padding:'5px 12px',borderRadius:20,border:`1px solid ${chk?'#2d6a4f':'#e0dbd2'}`,background:chk?'#d8f3dc':'#fff',fontSize:13}}>
                    <input type="checkbox" checked={chk} onChange={()=>toggleTeacher(u.id)} style={{accentColor:'#2d6a4f'}}/>{u.name}
                  </label>
                );})}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">추가 연락처 (어머니/아버지/할머니 등)</label>
              <RecipientsEditor value={infoForm.recipients||[]} onChange={v=>setInfoForm(p=>({...p,recipients:v}))}/>
            </div>
            <div className="form-group">
              <label className="form-label">수업 시간 선택 (클릭으로 토글)</label>
              <SchedulePicker value={infoForm.schedule_slots||[]} onChange={v=>setInfoForm(p=>({...p,schedule_slots:v}))}/>
            </div>
            <div className="form-group">
              <label className="form-label">수업 메모 <span style={{color:'#6b6560',fontSize:12}}>(예: 월수금 2시간)</span></label>
              <input className="form-input" value={infoForm.memo||''} onChange={e=>setInfoForm(p=>({...p,memo:e.target.value}))} placeholder="예: 월수금 2시간"/>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="btn btn-s" onClick={()=>setEditInfo(false)}>취소</button>
              <button className="btn btn-p" onClick={saveInfo}>저장</button>
            </div>
          </div>
        )}
      </div>

      {/* 수업 기록 */}
      {confirmType&&<div className="del-confirm"><span>{confirmType==='all'?`전체 ${myRecs.length}건`:`선택 ${sel.length}건`} 삭제할까요?</span><div style={{display:'flex',gap:8}}><button className="btn btn-s btn-sm" onClick={()=>setConfirmType(null)}>취소</button><button className="btn btn-d btn-sm" onClick={doDelete}>삭제</button></div></div>}
      <div className="card" style={{padding:0}}>
        <div style={{padding:'13px 16px',borderBottom:'1px solid #e0dbd2',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:600,fontSize:15}}>수업 기록 <span style={{color:'#6b6560',fontWeight:400,fontSize:13}}>{myRecs.length}건</span></span>
          <div style={{display:'flex',gap:8}}>
            {sel.length>0&&<button className="btn btn-d btn-sm" onClick={()=>setConfirmType('selected')}>선택 삭제 ({sel.length})</button>}
            {myRecs.length>0&&<button className="btn btn-d btn-sm" onClick={()=>setConfirmType('all')}>전체 삭제</button>}
          </div>
        </div>
        {myRecs.length===0
          ?<div className="empty"><div className="empty-icon">📝</div><div className="empty-text">수업 기록이 없습니다</div><button className="btn btn-p btn-sm" style={{marginTop:14}} onClick={()=>setRecModal('add')}>+ 첫 수업 기록 추가</button></div>
          :<div className="table-wrap">
            <table>
              <thead><tr>
                <th style={{width:40}}><input type="checkbox" checked={allSel} onChange={()=>setSel(allSel?[]:myRecs.map(r=>r.id))} style={{accentColor:'#2d6a4f',cursor:'pointer'}}/></th>
                <th>날짜</th><th>과목</th><th>진도</th><th>과제</th><th>점수</th><th>태도</th><th>특이사항</th><th>발송</th>
              </tr></thead>
              <tbody>
                {myRecs.map(r=>(
                  <tr key={r.id} style={{cursor:'pointer',background:sel.includes(r.id)?'#fff8f6':undefined}}
                    onClick={()=>setRecModal(r)}>
                    <td onClick={e=>e.stopPropagation()}><input type="checkbox" checked={sel.includes(r.id)} onChange={()=>setSel(p=>p.includes(r.id)?p.filter(x=>x!==r.id):[...p,r.id])} style={{accentColor:'#2d6a4f',cursor:'pointer'}}/></td>
                    <td className="mono" style={{fontSize:12}}>{r.date}</td>
                    <td><span className="badge bg">{r.subject}</span></td>
                    <td style={{fontSize:13,maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.progress}</td>
                    <td>{hwBadge(r.homework)}</td>
                    <td><span className="mono" style={{fontWeight:700,color:scoreColor(r.score)}}>{r.score}점</span></td>
                    <td>{attBadge(r.attitude)}</td>
                    <td style={{fontSize:12,color:'#6b6560',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.note}</td>
                    <td><SendStatusBadge status={r.send_status}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </div>
      {recModal&&<RecordModal student={student} initial={recModal==='add'?null:recModal} onSave={saveRecord} onClose={()=>setRecModal(null)}/>}
    </div>
  );
}

// ═══ DASHBOARD ════════════════════════════════════════════════════════
function Dashboard({students, records, classes}) {
  const {user} = useAuth();
  const myCls = user.role==='admin'?classes:classes.filter(c=>c.teacher_ids?.includes(user.id));
  const allMySt = user.role==='admin'?students:students.filter(s=>s.teacher_ids?.includes(user.id)||myCls.some(c=>c.id===s.class_id));
  const mySt = allMySt.filter(s=>(s.status||'재원')==='재원');
  const myRec = records.filter(r=>mySt.some(s=>s.id===r.student_id));
  const pending = myRec.filter(r=>r.send_status==='대기').length;
  const avg = myRec.length?Math.round(myRec.reduce((s,r)=>s+r.score,0)/myRec.length):0;
  return (
    <div>
      <div className="page-header"><div className="page-title">📊 대시보드</div><div className="page-sub">{user.name} 선생님, 안녕하세요!</div></div>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-num">{mySt.length}</div><div className="stat-lbl">담당 학생</div></div>
        <div className="stat-card"><div className="stat-num">{myCls.length}</div><div className="stat-lbl">담당 클래스</div></div>
        <div className="stat-card"><div className="stat-num" style={{color:pending>0?'#b5850a':'#2d6a4f'}}>{pending}</div><div className="stat-lbl">발송 대기</div></div>
        <div className="stat-card"><div className="stat-num">{avg}</div><div className="stat-lbl">평균 점수</div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div className="card">
          <div style={{fontWeight:600,fontSize:13,color:'#6b6560',marginBottom:12,textTransform:'uppercase',letterSpacing:'.4px'}}>최근 수업 기록</div>
          {myRec.slice(0,5).map(r=>{const st=mySt.find(s=>s.id===r.student_id);return(
            <div key={r.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid #e0dbd2'}}>
              <div><div style={{fontWeight:500}}>{st?.name} <span style={{color:'#6b6560',fontSize:13}}>({r.subject})</span></div><div style={{fontSize:12,color:'#6b6560',marginTop:2}}>{r.date} · {r.progress}</div></div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}><span className="mono" style={{fontWeight:600}}>{r.score}점</span><SendStatusBadge status={r.send_status}/></div>
            </div>
          );})}
          {myRec.length===0&&<div style={{color:'#6b6560',fontSize:13,textAlign:'center',padding:20}}>수업 기록이 없습니다</div>}
        </div>
        <div className="card">
          <div style={{fontWeight:600,fontSize:13,color:'#6b6560',marginBottom:12,textTransform:'uppercase',letterSpacing:'.4px'}}>학생별 최근 점수</div>
          {mySt.slice(0,8).map(s=>{const lat=myRec.filter(r=>r.student_id===s.id).sort((a,b)=>b.date.localeCompare(a.date))[0];return(
            <div key={s.id} style={{marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:3}}><span>{s.name} <span style={{color:'#6b6560'}}>({s.grade})</span></span><span className="mono" style={{fontWeight:600}}>{lat?.score??'-'}점</span></div>
              <div className="score-bar"><div className="score-fill" style={{width:`${lat?.score??0}%`}}/></div>
            </div>
          );})}
        </div>
      </div>
    </div>
  );
}

// ═══ SCHEDULE VIEW (수업 보기) ══════════════════════════════════════════
function ScheduleView({students, users}) {
  const [teacherFilter, setTeacherFilter] = useState('');
  const teachers = users;
  const activeStudents = students.filter(s=>(s.status||'재원')==='재원');
  const filtered = teacherFilter ? activeStudents.filter(s=>(s.teacher_ids||[]).includes(teacherFilter)) : activeStudents;
  const getStudents = (day, time) => filtered.filter(s=>(s.schedule_slots||[]).some(sl=>sl.day===day&&sl.time===time));
  const hasAny = (day, time) => getStudents(day,time).length > 0;
  // Only show time rows that have at least one student
  const activeTimes = TIMES.filter(t=>DAYS.some(d=>hasAny(d,t)));

  return (
    <div>
      <div className="page-header"><div className="page-title">📅 수업 보기</div><div className="page-sub">요일별 수업 시간표 · 학생 배치 현황</div></div>
      <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
        <select className="form-select" style={{width:140}} value={teacherFilter} onChange={e=>setTeacherFilter(e.target.value)}>
          <option value="">전체 강사</option>
          {teachers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <span style={{fontSize:13,color:'#6b6560'}}>총 {filtered.length}명</span>
      </div>
      <div className="card" style={{padding:0,overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',width:'100%',fontSize:12}}>
          <thead>
            <tr>
              <th style={{padding:'10px 14px',background:'#1a1814',color:'#fff',textAlign:'center',fontSize:12,fontWeight:600,width:70,borderRight:'1px solid #2d2b28'}}>시간</th>
              {DAYS.map(d=><th key={d} style={{padding:'10px 14px',background:'#1a1814',color:'#fff',textAlign:'center',fontSize:13,fontWeight:700,minWidth:120,borderRight:'1px solid #2d2b28'}}>{d}요일</th>)}
            </tr>
          </thead>
          <tbody>
            {(activeTimes.length > 0 ? activeTimes : TIMES).map((t,ti)=>(
              <tr key={t} style={{background:ti%2===0?'#fff':'#f7f6f2'}}>
                <td style={{padding:'8px 12px',textAlign:'center',fontSize:11,color:'#6b6560',fontFamily:"'DM Mono',monospace",borderRight:'1px solid #e0dbd2',fontWeight:600}}>{t}</td>
                {DAYS.map(d=>{
                  const sts = getStudents(d,t);
                  return (
                    <td key={d} style={{padding:'6px 10px',borderRight:'1px solid #e0dbd2',verticalAlign:'top',minHeight:32}}>
                      {sts.length>0&&<div>
                        <div style={{fontSize:10,color:'#6b6560',marginBottom:3}}>{sts.length}명</div>
                        {sts.map(s=><div key={s.id} style={{fontSize:11,fontWeight:600,padding:'2px 6px',background:'#d8f3dc',borderRadius:4,marginBottom:2,color:'#1a1814',whiteSpace:'nowrap',display:'inline-block',marginRight:3}}>{s.name}</div>)}
                      </div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.every(s=>!(s.schedule_slots||[]).length)&&<div className="empty"><div className="empty-icon">📅</div><div className="empty-text">수업 시간이 등록된 학생이 없습니다<br/><span style={{fontSize:13}}>학생 관리에서 수업 시간을 등록해주세요</span></div></div>}
      </div>
    </div>
  );
}

// ═══ CLASS VIEW ════════════════════════════════════════════════════════
function ClassView({classes, setClasses, students, setStudents, records, setRecords, users}) {
  const {user} = useAuth();
  const [detailId, setDetailId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const blank = {schedule:'', teacher_ids:user.role==='teacher'?[user.id]:[], subject:'수학', color:CLASS_COLORS[0], frequency:'주 1회'};
  const [form, setForm] = useState(blank);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const teachers = users;
  const myCls = user.role==='admin'?classes:classes.filter(c=>c.teacher_ids?.includes(user.id));

  function toggleTeacher(uid){setForm(p=>{const ids=p.teacher_ids||[];return{...p,teacher_ids:ids.includes(uid)?ids.filter(x=>x!==uid):[...ids,uid]};});}

  async function save() {
    try {
      if(editId) {
        const updated = await api('PUT','/api/classes',{id:editId,...form});
        setClasses(p=>p.map(c=>c.id===editId?updated:c));
      } else {
        const created = await api('POST','/api/classes',form);
        setClasses(p=>[...p,created]);
      }
      setShowModal(false);
    } catch(e) { alert(e.message); }
  }

  async function delCls(id,e) {
    e.stopPropagation();
    if(!confirm('클래스를 삭제할까요?')) return;
    try {
      await api('DELETE','/api/classes',{id});
      setClasses(p=>p.filter(c=>c.id!==id));
      setStudents(p=>p.map(s=>s.class_id===id?{...s,class_id:null}:s));
    } catch(e) { alert(e.message); }
  }

  if(detailId) return <StudentDetail studentId={detailId} students={students} setStudents={setStudents} records={records} setRecords={setRecords} onBack={()=>setDetailId(null)} classes={classes} users={users}/>;

  return (
    <div>
      <div className="page-header"><div className="page-title">🕐 수업별 보기</div><div className="page-sub">학생 이름 클릭 → 상세 기록</div></div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:18}}><button className="btn btn-p btn-sm" onClick={()=>{setEditId(null);setForm(blank);setShowModal(true);}}>+ 클래스 추가</button></div>
      {myCls.length===0?<div className="card"><div className="empty"><div className="empty-icon">🗓️</div><div className="empty-text">등록된 클래스가 없습니다</div></div></div>
      :<div className="cls-grid">
        {myCls.map(cls=>{
          const cSt=students.filter(s=>s.class_id===cls.id);
          const teacherNames=(cls.teacher_ids||[]).map(id=>users.find(u=>u.id===id)?.name||'?').join(', ')||'미배정';
          return (
            <div key={cls.id} className="cls-card">
              <div className="cls-hd" style={{borderLeft:`4px solid ${cls.color}`}}>
                <div style={{flex:1}}>
                  <div className="cls-title"><span className="dot" style={{background:cls.color,width:12,height:12}}/>{cls.schedule}</div>
                  <div className="cls-meta">👤 {teacherNames} · {cls.subject} <span className="badge bb">{cls.frequency}</span><span className="badge bg">{cSt.length}명</span></div>
                </div>
                <div style={{display:'flex',gap:5,flexShrink:0}}>
                  <button className="btn btn-s btn-sm" style={{fontSize:11,padding:'3px 9px'}} onClick={e=>{e.stopPropagation();setEditId(cls.id);setForm({...cls,teacher_ids:cls.teacher_ids||[]});setShowModal(true);}}>수정</button>
                  {user.role==='admin'&&<button className="btn btn-d btn-sm" style={{fontSize:11,padding:'3px 9px'}} onClick={e=>delCls(cls.id,e)}>삭제</button>}
                  <button className="btn btn-s btn-sm" style={{fontSize:11,padding:'3px 9px'}} onClick={()=>setCollapsed(p=>({...p,[cls.id]:!p[cls.id]}))}>
                    {collapsed[cls.id]?'펼치기':'접기'}
                  </button>
                </div>
              </div>
              {!collapsed[cls.id]&&<div className="cls-body">
                {cSt.length===0?<div className="cls-empty">배정된 학생이 없습니다</div>
                :cSt.map(s=>{
                  const lat=records.filter(r=>r.student_id===s.id).sort((a,b)=>b.date.localeCompare(a.date))[0];
                  const pend=records.filter(r=>r.student_id===s.id&&r.send_status==='대기').length;
                  return (
                    <div key={s.id} className="cls-row" onClick={()=>setDetailId(s.id)}>
                      <div>
                        <div className="cls-sname">{s.name}<span style={{fontSize:12,color:'#6b6560',fontWeight:400}}>{s.grade}</span>{pend>0&&<span className="badge bw">{pend}건 대기</span>}</div>
                        <div className="cls-sinfo">{lat?`최근: ${lat.date} · ${lat.progress}`:'수업 기록 없음'}</div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
                        {lat&&<span className="mono" style={{fontWeight:700,fontSize:14,color:scoreColor(lat.score)}}>{lat.score}점</span>}
                        <span style={{fontSize:12,color:'#2d6a4f'}}>→</span>
                      </div>
                    </div>
                  );
                })}
              </div>}
            </div>
          );
        })}
      </div>}
      {showModal&&<div className="overlay" onClick={()=>setShowModal(false)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-hd"><div className="modal-title">{editId?'클래스 수정':'새 클래스 추가'}</div><button className="modal-x" onClick={()=>setShowModal(false)}>✕</button></div>
          <div className="form-grid">
            <div className="form-group"><label className="form-label">수업 일정 *</label><input className="form-input" value={form.schedule} onChange={e=>f('schedule',e.target.value)} placeholder="화목 오후 5시"/></div>
            <div className="form-group">
              <label className="form-label">담당 강사</label>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,padding:'10px 12px',border:'1px solid #e0dbd2',borderRadius:8}}>
                {teachers.map(u=>{const chk=(form.teacher_ids||[]).includes(u.id);return(
                  <label key={u.id} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',padding:'5px 12px',borderRadius:20,border:`1px solid ${chk?'#2d6a4f':'#e0dbd2'}`,background:chk?'#d8f3dc':'#fff',fontSize:13}}>
                    <input type="checkbox" checked={chk} onChange={()=>toggleTeacher(u.id)} style={{accentColor:'#2d6a4f'}}/>{u.name}
                  </label>
                );})}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">수업 횟수</label><select className="form-select" value={form.frequency} onChange={e=>f('frequency',e.target.value)}>{FREQ_OPTIONS.map(o=><option key={o}>{o}</option>)}</select></div>
              <div className="form-group"><label className="form-label">과목</label><select className="form-select" value={form.subject} onChange={e=>f('subject',e.target.value)}>{SUBJECT_LIST.map(s=><option key={s}>{s}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">색상</label><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{CLASS_COLORS.map(c=><div key={c} onClick={()=>f('color',c)} style={{width:28,height:28,borderRadius:'50%',background:c,cursor:'pointer',border:form.color===c?'3px solid #1a1814':'3px solid transparent'}}/>)}</div></div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn btn-s" onClick={()=>setShowModal(false)}>취소</button>
              <button className="btn btn-p" onClick={save} disabled={!form.schedule}>{editId?'저장':'추가'}</button>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}

// ═══ STUDENTS ══════════════════════════════════════════════════════════
function Students({students, setStudents, records, setRecords, classes, users}) {
  const {user} = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [statusFilter, setStatusFilter] = useState('재원');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);
  const teachers = users;

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportResult(null);
    try {
      const rows = await parseExcel(file);
      if (!rows.length) { alert('데이터가 없습니다. 양식을 확인해주세요.'); setImporting(false); return; }
      let ok=0, fail=0;
      for (const row of rows) {
        try { const created = await api('POST','/api/students',row); setStudents(p=>[...p,created]); ok++; }
        catch { fail++; }
      }
      setImportResult({ok, fail, total:rows.length});
    } catch(err) { alert('파일 읽기 실패: '+err.message); }
    setImporting(false);
    e.target.value='';
  }
  const blank = {name:'',grade:'초1',phone:'',student_phone:'',gender:'',school:'',subject:'',parent_name:'',class_id:'',recipients:[],schedule_slots:[],teacher_ids:[],memo:'',status:'재원',enrolled_at:''};
  const [form, setForm] = useState(blank);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const myCls = user.role==='admin'?classes:classes.filter(c=>c.teacher_ids?.includes(user.id));
  const allMySt = user.role==='admin'?students:students.filter(s=>s.teacher_ids?.includes(user.id)||myCls.some(c=>c.id===s.class_id));
  const mySt = allMySt.filter(s=>(s.status||'재원')===statusFilter);
  const grouped={};
  GRADE_ORDER.forEach(g=>{const a=mySt.filter(s=>s.grade===g);if(a.length)grouped[g]=a;});
  function toggleTeacher(uid){setForm(p=>{const ids=p.teacher_ids||[];return{...p,teacher_ids:ids.includes(uid)?ids.filter(x=>x!==uid):[...ids,uid]};});}

  async function save() {
    const data = {...form, class_id:form.class_id?parseInt(form.class_id):null};
    try {
      if(editing) {
        const updated = await api('PUT','/api/students',{id:editing,...data});
        setStudents(p=>p.map(s=>s.id===editing?updated:s));
      } else {
        const created = await api('POST','/api/students',data);
        setStudents(p=>[...p,created]);
      }
      setShowModal(false);
    } catch(e) { alert(e.message); }
  }

  async function del(id,e) {
    e.stopPropagation();
    if(!confirm('학생을 삭제할까요?')) return;
    try {
      await api('DELETE','/api/students',{id});
      setStudents(p=>p.filter(s=>s.id!==id));
    } catch(e) { alert(e.message); }
  }

  if(detailId) return <StudentDetail studentId={detailId} students={students} setStudents={setStudents} records={records} setRecords={setRecords} onBack={()=>setDetailId(null)} classes={classes} users={users}/>;

  return (
    <div>
      <div className="page-header"><div className="page-title">👤 학생 관리</div></div>
      <input type="file" accept=".xlsx,.xls" ref={fileInputRef} style={{display:'none'}} onChange={handleImport}/>
      {importResult&&<div style={{background:'#d8f3dc',border:'1px solid #52b788',borderRadius:10,padding:'12px 18px',marginBottom:16,fontSize:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span>✅ 가져오기 완료: <strong>{importResult.ok}명</strong> 추가{importResult.fail>0&&<span style={{color:'#e63946'}}> · {importResult.fail}명 실패</span>}</span>
        <button className="btn btn-s btn-sm" onClick={()=>setImportResult(null)}>닫기</button>
      </div>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
        <div style={{display:'flex',gap:4}}>
          {['재원','퇴원'].map(s=><button key={s} onClick={()=>setStatusFilter(s)} style={{padding:'5px 18px',borderRadius:20,border:'none',cursor:'pointer',fontSize:13,fontWeight:statusFilter===s?700:400,background:statusFilter===s?(s==='재원'?'#4a7c59':'#9b4a4a'):'#f0ede8',color:statusFilter===s?'#fff':'#555'}}>{s}생</button>)}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-s btn-sm" onClick={downloadTemplate}>📥 양식 다운로드</button>
          {user.role==='admin'&&<button className="btn btn-s btn-sm" onClick={()=>fileInputRef.current?.click()} disabled={importing}>{importing?'⏳ 가져오는 중...':'📤 Excel 가져오기'}</button>}
          {user.role==='admin'&&<button className="btn btn-p btn-sm" onClick={()=>{setEditing(null);setForm(blank);setShowModal(true);}}>+ 학생 추가</button>}
        </div>
      </div>
      {Object.entries(grouped).map(([grade,gs])=>(
        <div key={grade}>
          <div className="grp-hd" onClick={()=>setCollapsed(p=>({...p,[grade]:!p[grade]}))}>
            <span style={{display:'inline-block',transform:collapsed[grade]?'rotate(-90deg)':'rotate(0)',transition:'transform .2s'}}>▼</span>
            <span>{grade}</span><span className="badge bgr" style={{marginLeft:4}}>{gs.length}명</span>
            <span style={{marginLeft:'auto',fontSize:12,color:'rgba(255,255,255,.4)',fontWeight:400}}>{collapsed[grade]?'펼치기':'접기'}</span>
          </div>
          {!collapsed[grade]&&<div className="grp-body">
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
              <thead><tr>{['이름','학년','과목','수업시간','수업메모','등록일','수업 수','관리'].map(h=><th key={h} style={{textAlign:'left',padding:'9px 14px',background:'#f0ede8',color:'#6b6560',fontSize:12,fontWeight:600,borderBottom:'1px solid #e0dbd2'}}>{h}</th>)}</tr></thead>
              <tbody>
                {gs.map(s=>{
                  const cnt=records.filter(r=>r.student_id===s.id).length;
                  const slots=(s.schedule_slots||[]).sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)).map(sl=>`${sl.day} ${sl.time}`).join(', ');
                  return (
                    <tr key={s.id} style={{cursor:'pointer'}} onClick={()=>setDetailId(s.id)}>
                      <td style={{padding:'11px 14px',borderBottom:'1px solid #e0dbd2',fontWeight:600}}>{s.name} <span style={{fontSize:12,color:'#2d6a4f'}}>→</span></td>
                      <td style={{padding:'11px 14px',borderBottom:'1px solid #e0dbd2'}}><span className="badge bg">{s.grade}</span></td>
                      <td style={{padding:'11px 14px',borderBottom:'1px solid #e0dbd2',fontSize:13,color:'#6b6560'}}>{s.subject}</td>
                      <td style={{padding:'11px 14px',borderBottom:'1px solid #e0dbd2',fontSize:12,color:'#6b6560',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{slots||'-'}</td>
                      <td style={{padding:'11px 14px',borderBottom:'1px solid #e0dbd2',fontSize:12,color:'#6b6560'}}>{s.memo||'-'}</td>
                      <td style={{padding:'11px 14px',borderBottom:'1px solid #e0dbd2',fontSize:12,color:'#6b6560'}}>{s.enrolled_at||'-'}</td>
                      <td style={{padding:'11px 14px',borderBottom:'1px solid #e0dbd2'}}><span className="badge bb">{cnt}건</span></td>
                      <td style={{padding:'11px 14px',borderBottom:'1px solid #e0dbd2'}}>
                        <div style={{display:'flex',gap:6}} onClick={e=>e.stopPropagation()}>
                          <button className="btn btn-s btn-sm" onClick={e=>{e.stopPropagation();setEditing(s.id);setForm({...s,class_id:s.class_id||'',recipients:s.recipients||[],schedule_slots:s.schedule_slots||[],teacher_ids:s.teacher_ids||[]});setShowModal(true);}}>수정</button>
                          {user.role==='admin'&&<button className="btn btn-d btn-sm" onClick={e=>del(s.id,e)}>삭제</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
        </div>
      ))}
      {Object.keys(grouped).length===0&&<div className="card"><div className="empty"><div className="empty-icon">👤</div><div className="empty-text">담당 학생이 없습니다</div></div></div>}

      {showModal&&<div className="overlay" onClick={()=>setShowModal(false)}>
        <div className="modal" style={{maxWidth:640}} onClick={e=>e.stopPropagation()}>
          <div className="modal-hd"><div className="modal-title">{editing?'학생 수정':'학생 추가'}</div><button className="modal-x" onClick={()=>setShowModal(false)}>✕</button></div>
          <div className="form-grid">
            <div className="form-row">
              <div className="form-group"><label className="form-label">이름 *</label><input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)} placeholder="홍길동"/></div>
              <div className="form-group"><label className="form-label">학년 *</label><select className="form-select" value={form.grade} onChange={e=>f('grade',e.target.value)}>{GRADE_ORDER.map(g=><option key={g}>{g}</option>)}</select></div>
              <div className="form-group"><label className="form-label">성별</label><select className="form-select" value={form.gender||''} onChange={e=>f('gender',e.target.value)}><option value=''>선택</option><option>남</option><option>여</option></select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">학부모 이름</label><input className="form-input" value={form.parent_name} onChange={e=>f('parent_name',e.target.value)}/></div>
              <div className="form-group"><label className="form-label">학교</label><input className="form-input" value={form.school||''} onChange={e=>f('school',e.target.value)} placeholder="재학 중인 학교"/></div>
              <div className="form-group"><label className="form-label">학생 휴대폰</label><input className="form-input" value={form.student_phone||''} onChange={e=>f('student_phone',e.target.value)} placeholder="010-0000-0000"/></div>
              <div className="form-group"><label className="form-label">재원 상태</label><select className="form-select" value={form.status||'재원'} onChange={e=>f('status',e.target.value)}><option>재원</option><option>퇴원</option></select></div>
              <div className="form-group"><label className="form-label">등록일</label><input className="form-input" type="date" value={form.enrolled_at||''} onChange={e=>f('enrolled_at',e.target.value)}/></div>
              <div className="form-group"><label className="form-label">주 연락처</label><input className="form-input" value={form.phone} onChange={e=>f('phone',e.target.value)} placeholder="010-0000-0000"/></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">수강 과목</label><input className="form-input" value={form.subject} onChange={e=>f('subject',e.target.value)} placeholder="수학, 영어"/></div>
              <div className="form-group"><label className="form-label">클래스 배정</label>
                <select className="form-select" value={form.class_id} onChange={e=>f('class_id',e.target.value)}>
                  <option value="">미배정</option>{myCls.map(c=><option key={c.id} value={c.id}>{c.schedule} – {c.subject}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">담당 교사</label>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,padding:'10px 12px',border:'1px solid #e0dbd2',borderRadius:8}}>
                {teachers.map(u=>{const chk=(form.teacher_ids||[]).includes(u.id);return(
                  <label key={u.id} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',padding:'5px 12px',borderRadius:20,border:`1px solid ${chk?'#2d6a4f':'#e0dbd2'}`,background:chk?'#d8f3dc':'#fff',fontSize:13}}>
                    <input type="checkbox" checked={chk} onChange={()=>toggleTeacher(u.id)} style={{accentColor:'#2d6a4f'}}/>{u.name}
                  </label>
                );})}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">추가 연락처</label>
              <RecipientsEditor value={form.recipients||[]} onChange={v=>f('recipients',v)}/>
            </div>
            <div className="form-group">
              <label className="form-label">수업 시간 선택</label>
              <SchedulePicker value={form.schedule_slots||[]} onChange={v=>f('schedule_slots',v)}/>
            </div>
            <div className="form-group">
              <label className="form-label">수업 메모 <span style={{color:'#6b6560',fontSize:12}}>(예: 월수금 2시간)</span></label>
              <input className="form-input" value={form.memo||''} onChange={e=>f('memo',e.target.value)} placeholder="예: 월수금 2시간"/>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:4}}>
              <button className="btn btn-s" onClick={()=>setShowModal(false)}>취소</button>
              <button className="btn btn-p" onClick={save} disabled={!form.name}>{editing?'저장':'추가'}</button>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}

// ═══ RECORDS ═══════════════════════════════════════════════════════════
function Records({students, records, setRecords, classes}) {
  const {user} = useAuth();
  const myCls = user.role==='admin'?classes:classes.filter(c=>c.teacher_ids?.includes(user.id));
  const mySt  = user.role==='admin'?students:students.filter(s=>myCls.some(c=>c.id===s.class_id)||s.teacher_ids?.includes(user.id));
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [recModal, setRecModal] = useState(null);
  const filtered = records.filter(r=>mySt.some(s=>s.id===r.student_id)).filter(r=>!filter||r.student_id===parseInt(filter)).filter(r=>!statusFilter||r.send_status===statusFilter).sort((a,b)=>b.date.localeCompare(a.date));

  async function saveRecord(form) {
    const data = {...form, score:parseInt(form.score)||0};
    try {
      const updated = await api('PUT','/api/records',{id:recModal.initial.id,...data});
      setRecords(p=>p.map(r=>r.id===recModal.initial.id?updated:r));
    } catch(e) { alert(e.message); }
    setRecModal(null);
  }

  return (
    <div>
      <div className="page-header"><div className="page-title">📚 수업 기록</div><div className="page-sub">행 클릭 → 수정</div></div>
      <div className="card">
        <div className="toolbar">
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <select className="form-select" style={{width:130}} value={filter} onChange={e=>setFilter(e.target.value)}>
              <option value="">전체 학생</option>{mySt.map(s=><option key={s.id} value={s.id}>{s.name} ({s.grade})</option>)}
            </select>
            <select className="form-select" style={{width:110}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
              <option value="">전체 상태</option>{SEND_STATUS.map(s=><option key={s}>{s}</option>)}
            </select>
            <span style={{fontSize:13,color:'#6b6560'}}>{filtered.length}건</span>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>날짜</th><th>학생</th><th>과목</th><th>진도</th><th>과제</th><th>점수</th><th>태도</th><th>발송</th></tr></thead>
            <tbody>
              {filtered.length===0&&<tr><td colSpan={8}><div className="empty"><div className="empty-icon">📝</div><div className="empty-text">기록이 없습니다</div></div></td></tr>}
              {filtered.map(r=>{const st=mySt.find(s=>s.id===r.student_id);return(
                <tr key={r.id} style={{cursor:'pointer'}} onClick={()=>st&&setRecModal({student:st,initial:r})}>
                  <td className="mono" style={{fontSize:12}}>{r.date}</td>
                  <td style={{fontWeight:600}}>{st?.name}</td>
                  <td><span className="badge bg">{r.subject}</span></td>
                  <td style={{fontSize:13,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.progress}</td>
                  <td>{hwBadge(r.homework)}</td>
                  <td><span className="mono" style={{fontWeight:700,color:scoreColor(r.score)}}>{r.score}점</span></td>
                  <td>{attBadge(r.attitude)}</td>
                  <td><SendStatusBadge status={r.send_status}/></td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>
      {recModal&&<RecordModal student={recModal.student} initial={recModal.initial} onSave={saveRecord} onClose={()=>setRecModal(null)}/>}
    </div>
  );
}

// ═══ MESSAGES ══════════════════════════════════════════════════════════
function Messages({students, records, setRecords, classes}) {
  const {user} = useAuth();
  const myCls = user.role==='admin'?classes:classes.filter(c=>c.teacher_ids?.includes(user.id));
  const mySt  = user.role==='admin'?students:students.filter(s=>myCls.some(c=>c.id===s.class_id)||s.teacher_ids?.includes(user.id));
  const activeSt = mySt.filter(s=>(s.status||'재원')==='재원');
  const pending = records.filter(r=>r.send_status==='대기'&&activeSt.some(s=>s.id===r.student_id));
  const [sel, setSel] = useState([]);
  const [previews, setPreviews] = useState({});
  const [editing, setEditing] = useState({});
  const [generating, setGenerating] = useState({});
  const [sending, setSending] = useState(false);
  const [recModal, setRecModal] = useState(null);
  const allSel = sel.length===pending.length&&pending.length>0;

  async function genOne(r) {
    const st=mySt.find(s=>s.id===r.student_id); if(!st) return;
    setGenerating(p=>({...p,[r.id]:true}));
    try {
      const res = await fetch('/api/generate-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({student:st,record:r})});
      const data = await res.json();
      setPreviews(p=>({...p,[r.id]:data.message||''}));
    } catch { setPreviews(p=>({...p,[r.id]:`${mySt.find(s=>s.id===r.student_id)?.name} 학생 어머니!\n이번 수업을 잘 마쳤습니다.\n감사합니다 🙏`})); }
    setGenerating(p=>({...p,[r.id]:false}));
  }

  async function genAll() {
    const targets = pending.filter(r=>sel.includes(r.id)&&!previews[r.id]);
    for(const r of targets) await genOne(r);
  }

  async function savePreviewEdit(id) {
    setEditing(p=>({...p,[id]:false}));
  }

  async function sendSelected() {
    const toSend = pending.filter(r=>sel.includes(r.id));
    setSending(true);
    const results = {};
    for(const r of toSend) {
      const st=mySt.find(s=>s.id===r.student_id); if(!st) continue;
      const msg = previews[r.id] || '';
      if(!msg) { results[r.id]={ok:false,error:'메시지 없음'}; continue; }
      // 수신자 결정 (recipients 있으면 선택, 없으면 기본 phone)
      const phone = (st.recipients||[]).find(r=>r.label?.includes('어머니'))?.phone || st.phone;
      try {
        const res = await fetch('/api/send-sms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:phone,message:msg})});
        const data = await res.json();
        results[r.id] = res.ok ? {ok:true,msg} : {ok:false,error:data.error};
      } catch(e) { results[r.id]={ok:false,error:e.message}; }
    }
    // DB 업데이트
    for(const [rid, result] of Object.entries(results)) {
      const updates = result.ok
        ? {id:parseInt(rid),send_status:'완료',sent_at:new Date().toLocaleString(),sent_message:result.msg}
        : {id:parseInt(rid),send_status:'오류'};
      try { const updated=await api('PUT','/api/records',updates); setRecords(p=>p.map(r=>r.id===updated.id?updated:r)); } catch{}
    }
    setSending(false); setSel([]);
    const ok=Object.values(results).filter(v=>v.ok).length;
    const fail=Object.values(results).length-ok;
    alert(`완료: ${ok}건${fail>0?`, 오류: ${fail}건`:''}`);
  }

  async function saveRecordFromModal(form) {
    const data = {...form, score:parseInt(form.score)||0};
    try {
      const updated = await api('PUT','/api/records',{id:recModal.initial.id,...data});
      setRecords(p=>p.map(r=>r.id===recModal.initial.id?updated:r));
    } catch(e) { alert(e.message); }
    setRecModal(null);
  }

  return (
    <div>
      <div className="page-header"><div className="page-title">✉️ 문자 발송</div><div className="page-sub">발송 상태가 대기인 기록 · 행 클릭 → 수정</div></div>
      {pending.length===0
        ?<div className="card"><div className="empty"><div className="empty-icon">✅</div><div className="empty-text">발송 대기 중인 기록이 없습니다</div></div></div>
        :<>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:10}}>
            <span style={{fontSize:14,color:'#6b6560'}}>대기 <strong>{pending.length}건</strong> · {sel.length}건 선택</span>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button className="btn btn-s btn-sm" onClick={()=>setSel(allSel?[]:pending.map(r=>r.id))}>{allSel?'전체 해제':'전체 선택'}</button>
              <button className="btn btn-s btn-sm" onClick={genAll} disabled={sel.length===0||sending}>🤖 선택 일괄 미리보기</button>
              <button className="btn btn-p" onClick={sendSelected} disabled={sel.length===0||sending}>{sending?'⏳ 발송 중...':'🚀 선택 발송 ('+sel.length+')'}</button>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {pending.map(r=>{
              const st=mySt.find(s=>s.id===r.student_id);
              const isSel=sel.includes(r.id);
              const preview=previews[r.id];
              const isEditing=editing[r.id];
              return (
                <div key={r.id} className="card" style={{border:isSel?'2px solid #2d6a4f':undefined,padding:'16px 18px'}}>
                  <div style={{display:'flex',gap:12}}>
                    <input type="checkbox" checked={isSel} onChange={()=>setSel(p=>p.includes(r.id)?p.filter(x=>x!==r.id):[...p,r.id])} style={{marginTop:3,accentColor:'#2d6a4f',width:16,height:16,cursor:'pointer',flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,flexWrap:'wrap',gap:6,cursor:'pointer'}} onClick={()=>st&&setRecModal({student:st,initial:r})}>
                        <div><span style={{fontWeight:700,fontSize:15}}>{st?.name}</span><span style={{color:'#6b6560',fontSize:13,marginLeft:8}}>{r.date} · {r.subject}</span></div>
                        <div style={{display:'flex',gap:6,alignItems:'center'}}>{hwBadge(r.homework)}<span className="mono" style={{fontWeight:700}}>{r.score}점</span><span style={{fontSize:11,color:'#2d6a4f'}}>✏️ 수정</span></div>
                      </div>
                      <div style={{fontSize:13,color:'#6b6560',marginBottom:10}}>{r.progress}{r.note&&` · ${r.note}`}</div>
                      {!preview
                        ?<button className="btn btn-s btn-sm" onClick={()=>genOne(r)} disabled={generating[r.id]}>{generating[r.id]?'⏳ 생성 중...':'🤖 미리보기 생성'}</button>
                        :<div>
                          {isEditing
                            ?<textarea className="form-textarea" value={preview} onChange={e=>setPreviews(p=>({...p,[r.id]:e.target.value}))} style={{minHeight:100,fontSize:14,lineHeight:1.75}}/>
                            :<div className="msg-preview">{preview}</div>
                          }
                          <div style={{display:'flex',gap:8,marginTop:8}}>
                            <button className="btn btn-s btn-sm" onClick={()=>setEditing(p=>({...p,[r.id]:!p[r.id]}))}>
                              {isEditing?'✅ 수정완료':'✏️ 수정하기'}
                            </button>
                            <button className="btn btn-s btn-sm" onClick={()=>{setPreviews(p=>{const n={...p};delete n[r.id];return n;});genOne(r);}} disabled={generating[r.id]}>🔄 메시지 재작성</button>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      }
      {recModal&&<RecordModal student={recModal.student} initial={recModal.initial} onSave={saveRecordFromModal} onClose={()=>setRecModal(null)}/>}
    </div>
  );
}

// ═══ HISTORY ═══════════════════════════════════════════════════════════
function History({students, records, classes}) {
  const {user} = useAuth();
  const myCls = user.role==='admin'?classes:classes.filter(c=>c.teacher_ids?.includes(user.id));
  const mySt  = user.role==='admin'?students:students.filter(s=>myCls.some(c=>c.id===s.class_id)||s.teacher_ids?.includes(user.id));
  const sent = [...records.filter(r=>r.send_status==='완료'&&mySt.some(s=>s.id===r.student_id))].sort((a,b)=>b.date.localeCompare(a.date));
  return (
    <div>
      <div className="page-header"><div className="page-title">📜 발송 이력</div><div className="page-sub">발송 완료된 문자 기록</div></div>
      <div className="card">
        {sent.length===0?<div className="empty"><div className="empty-icon">📭</div><div className="empty-text">발송 이력이 없습니다</div></div>
        :sent.map(r=>{const st=mySt.find(s=>s.id===r.student_id);return(
          <div key={r.id} className="hist-item">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,flexWrap:'wrap',marginBottom:r.sent_message?8:0}}>
              <div>
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:4,flexWrap:'wrap'}}>
                  <SendStatusBadge status="완료"/>
                  <span style={{fontWeight:600}}>{st?.name}</span>
                  <span style={{color:'#6b6560',fontSize:13}}>{r.date} · {r.subject}</span>
                </div>
                <div style={{fontSize:13,color:'#6b6560',lineHeight:1.5}}>{r.progress} · {hwBadge(r.homework)} · {r.score}점</div>
                {st&&<div style={{fontSize:12,color:'#6b6560',marginTop:3}}>수신: {st.phone} ({st.parent_name}) · {r.sent_at}</div>}
              </div>
            </div>
            {r.sent_message&&<div className="msg-sent-box">{r.sent_message}</div>}
          </div>
        );})}
      </div>
    </div>
  );
}

// ═══ ADMIN ═════════════════════════════════════════════════════════════
function Admin({users, setUsers}) {
  const {user} = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [tempPw, setTempPw] = useState(null);
  const blank = {id:'', name:'', password:'', role:'teacher'};
  const [form, setForm] = useState(blank);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const [guideline, setGuideline] = useState('');
  const [guidelineSaved, setGuidelineSaved] = useState(false);
  useEffect(()=>{
    api('GET','/api/settings').then(d=>{ if(d.sms_guideline) setGuideline(d.sms_guideline); }).catch(()=>{});
  },[]);
  async function saveGuideline() {
    try { await api('PUT','/api/settings',{key:'sms_guideline',value:guideline}); setGuidelineSaved(true); setTimeout(()=>setGuidelineSaved(false),2000); } catch(e) { alert(e.message); }
  }

  if(user.role!=='admin') return <div className="access-denied"><div style={{fontSize:48,marginBottom:16}}>🔒</div><div style={{fontSize:18,fontWeight:700,marginBottom:8}}>관리자 전용 페이지</div></div>;

  async function save() {
    try {
      if(editId) {
        const updated = await api('PUT','/api/users',{id:editId,newId:form.newId||editId,name:form.name,role:form.role});
        setUsers(p=>p.map(u=>u.id===editId?{...u,...updated}:u));
      } else {
        const created = await api('POST','/api/users',form);
        setUsers(p=>[...p,created]);
      }
      setShowModal(false);
    } catch(e) { alert(e.message); }
  }

  async function del(id) {
    if(!confirm('계정을 삭제할까요?')) return;
    try { await api('DELETE','/api/users',{id}); setUsers(p=>p.filter(u=>u.id!==id)); } catch(e) { alert(e.message); }
  }

  async function resetPw(targetId) {
    if(!confirm(`${targetId} 계정의 비밀번호를 초기화할까요?`)) return;
    try {
      const data = await api('POST','/api/auth/reset-password',{adminId:user.id, targetUserId:targetId});
      setTempPw({id:targetId, pw:data.tempPassword});
    } catch(e) { alert(e.message); }
  }

  return (
    <div>
      <div className="page-header"><div className="page-title">⚙️ 전체 관리</div></div>
      {tempPw&&<div style={{background:'#d8f3dc',border:'1px solid #52b788',borderRadius:10,padding:'14px 18px',marginBottom:20,fontSize:14}}>
        <div style={{fontWeight:700,marginBottom:4}}>✅ 비밀번호 초기화 완료</div>
        <div><strong>{tempPw.id}</strong> 임시 비밀번호: <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:16,background:'#fff',padding:'3px 10px',borderRadius:6,marginLeft:4}}>{tempPw.pw}</span></div>
        <div style={{fontSize:12,color:'#2d6a4f',marginTop:6}}>이 창을 닫으면 다시 확인할 수 없습니다. 해당 강사에게 전달하세요.</div>
        <button className="btn btn-s btn-sm" style={{marginTop:8}} onClick={()=>setTempPw(null)}>닫기</button>
      </div>}
      <div style={{background:'#fff',border:'1px solid #e0dbd2',borderRadius:10,padding:'18px',marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:10}}>📝 문자 생성 가이드라인</div>
        <div style={{fontSize:13,color:'#6b6560',marginBottom:10}}>Claude AI가 문자를 생성할 때 참고할 지침을 입력하세요. (원장 이름, 문체, 인사말 등)</div>
        <textarea className="form-textarea" value={guideline} onChange={e=>setGuideline(e.target.value)} placeholder={"예시:\n- 원장 이름은 '박시형 원장'으로 표기\n- 마지막 인사는 '서강학원 드림'으로\n- 학부모 호칭은 '어머님'으로 통일\n- 150자 이내로 작성"} style={{minHeight:120,fontSize:13,marginBottom:10}}/>
        <button className="btn btn-p btn-sm" onClick={saveGuideline}>{guidelineSaved?'✅ 저장됨':'저장'}</button>
      </div>
      <div style={{background:'#f0faf4',border:'1px solid #a7d7b8',borderRadius:10,padding:'14px 18px',marginBottom:20,fontSize:13}}>
        <div style={{fontWeight:700,marginBottom:8}}>🔑 환경변수 설정 (Vercel → Settings → Environment Variables)</div>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          {[['SUPABASE_URL','Supabase 프로젝트 URL'],['SUPABASE_SERVICE_KEY','Supabase service role key'],['ANTHROPIC_API_KEY','Claude API 키'],['SOLAPI_API_KEY','Solapi API Key'],['SOLAPI_API_SECRET','Solapi Secret'],['SOLAPI_FROM_PHONE','발신번호'],['ADMIN_RESET_KEY','관리자 비번 긴급 초기화 키']].map(([k,v])=>(
            <div key={k} style={{display:'flex',gap:10,alignItems:'center'}}><span style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:'#fff',padding:'2px 7px',borderRadius:5,border:'1px solid #e0dbd2'}}>{k}</span><span style={{fontSize:12,color:'#6b6560'}}>{v}</span></div>
          ))}
        </div>
      </div>
      <div className="card" style={{padding:0}}>
        <div style={{padding:'13px 18px',borderBottom:'1px solid #e0dbd2',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:600,fontSize:15}}>강사 계정</span>
          <button className="btn btn-p btn-sm" onClick={()=>{setEditId(null);setForm(blank);setShowModal(true);}}>+ 강사 추가</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>이름</th><th>아이디</th><th>권한</th><th>관리</th></tr></thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.id}>
                  <td style={{fontWeight:600}}>{u.name}</td>
                  <td className="mono" style={{fontSize:13}}>{u.id}</td>
                  <td>{u.role==='admin'?<span className="badge bgo">👑 관리자</span>:<span className="badge bb">강사</span>}</td>
                  <td><div style={{display:'flex',gap:6}}>
                    <button className="btn btn-s btn-sm" onClick={()=>{setEditId(u.id);setForm({...u,password:'',newId:u.id});setShowModal(true);}}>수정</button>
                    <button className="btn btn-s btn-sm" onClick={()=>resetPw(u.id)}>🔑 비번 초기화</button>
                    {u.role!=='admin'&&<button className="btn btn-d btn-sm" onClick={()=>del(u.id)}>삭제</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showModal&&<div className="overlay" onClick={()=>setShowModal(false)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-hd"><div className="modal-title">{editId?'계정 수정':'강사 추가'}</div><button className="modal-x" onClick={()=>setShowModal(false)}>✕</button></div>
          <div className="form-grid">
            <div className="form-row">
              <div className="form-group"><label className="form-label">이름 *</label><input className="form-input" value={form.name} onChange={e=>f('name',e.target.value)}/></div>
              {!editId&&<div className="form-group"><label className="form-label">아이디 *</label><input className="form-input" value={form.id} onChange={e=>f('id',e.target.value)}/></div>}
              {editId&&<div className="form-group"><label className="form-label">아이디 변경</label><input className="form-input" value={form.newId||''} onChange={e=>f('newId',e.target.value)} placeholder="변경할 아이디 입력"/><div style={{fontSize:11,color:'#6b6560',marginTop:3}}>비워두면 변경 안 됨</div></div>}
            </div>
            {!editId&&<div className="form-group"><label className="form-label">초기 비밀번호 *</label><input className="form-input" value={form.password} onChange={e=>f('password',e.target.value)}/></div>}
            <div className="form-group"><label className="form-label">권한</label><select className="form-select" value={form.role} onChange={e=>f('role',e.target.value)}><option value="teacher">강사</option><option value="admin">관리자</option></select></div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn btn-s" onClick={()=>setShowModal(false)}>취소</button>
              <button className="btn btn-p" onClick={save} disabled={!form.name||(!editId&&(!form.id||!form.password))}>{editId?'저장':'추가'}</button>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}

// ═══ APP ═══════════════════════════════════════════════════════════════
const BASE_NAV = [
  {id:'dashboard', icon:'📊', label:'대시보드'},
  {id:'schedule',  icon:'📅', label:'수업 보기'},
  {id:'classes',   icon:'🕐', label:'수업별 보기'},
  {id:'students',  icon:'👤', label:'학생 관리'},
  {id:'records',   icon:'📚', label:'수업 기록'},
  {id:'messages',  icon:'✉️',  label:'문자 발송'},
  {id:'history',   icon:'📜', label:'발송 이력'},
];

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [u,c,s,r] = await Promise.all([
        api('GET','/api/users'),
        api('GET','/api/classes'),
        api('GET','/api/students'),
        api('GET','/api/records'),
      ]);
      setUsers(u); setClasses(c); setStudents(s); setRecords(r);
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(()=>{ if(user) loadAll(); }, [user, loadAll]);

  const myCls = user ? (user.role==='admin'?classes:classes.filter(c=>c.teacher_ids?.includes(user.id))) : [];
  const mySt  = user ? (user.role==='admin'?students:students.filter(s=>s.teacher_ids?.includes(user.id)||myCls.some(c=>c.id===s.class_id))) : [];
  const pendingCount = records.filter(r=>r.send_status==='대기'&&mySt.filter(s=>(s.status||'재원')==='재원').some(s=>s.id===r.student_id)).length;

  if(!user) return <Login onLogin={u=>{setUser(u);setPage('dashboard');}}/>;
  if(loading) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#1a1814',color:'#fff',fontSize:16}}>⏳ 불러오는 중...</div>;

  return (
    <AuthCtx.Provider value={{user,setUser}}>
      <div className="app">
        <nav className="sidebar">
          <div className="sidebar-logo" style={{textAlign:"center",padding:"20px 16px 12px"}}><img src="/logo.jpg" style={{width:80,marginBottom:6,borderRadius:4}}/><div style={{fontSize:11,color:"rgba(255,255,255,.5)",letterSpacing:".3px"}}>피드백 관리 시스템</div></div>
          <div className="sidebar-user">
            <div className="sidebar-avatar">{user.name[0]}</div>
            <div style={{flex:1,minWidth:0}}>
              <div className="sidebar-uname">{user.name}</div>
              <div className="sidebar-urole">{user.role==='admin'?'👑 최고 관리자':'강사'}</div>
            </div>
          </div>
          <div className="sidebar-nav">
            {BASE_NAV.map(n=>(
              <button key={n.id} className={`nav-item ${page===n.id?'active':''}`} onClick={()=>setPage(n.id)}>
                <span className="nav-icon">{n.icon}</span><span>{n.label}</span>
                {n.id==='messages'&&pendingCount>0&&<span style={{marginLeft:'auto',background:'#c1440e',color:'#fff',borderRadius:10,padding:'1px 7px',fontSize:11,fontWeight:700}}>{pendingCount}</span>}
              </button>
            ))}
            {user.role==='admin'&&<><div className="nav-divider"/><button className={`nav-item admin ${page==='admin'?'active':''}`} onClick={()=>setPage('admin')}><span className="nav-icon">⚙️</span><span>전체 관리</span></button></>}
          </div>
          <div className="sidebar-foot">
            <button className="logout-btn" style={{marginBottom:6}} onClick={()=>setShowPwModal(true)}>🔑 비밀번호 변경</button>
            <button className="logout-btn" onClick={()=>{setUser(null);setUsers([]);setClasses([]);setStudents([]);setRecords([]);}}>🚪 로그아웃</button>
          </div>
        </nav>
        <main className="main">
          {page==='dashboard'&&<Dashboard students={students} records={records} classes={classes}/>}
          {page==='schedule' &&<ScheduleView students={students} users={users}/>}
          {page==='classes'  &&<ClassView classes={classes} setClasses={setClasses} students={students} setStudents={setStudents} records={records} setRecords={setRecords} users={users}/>}
          {page==='students' &&<Students students={students} setStudents={setStudents} records={records} setRecords={setRecords} classes={classes} users={users}/>}
          {page==='records'  &&<Records students={students} records={records} setRecords={setRecords} classes={classes}/>}
          {page==='messages' &&<Messages students={students} records={records} setRecords={setRecords} classes={classes}/>}
          {page==='history'  &&<History students={students} records={records} classes={classes}/>}
          {page==='admin'    &&<Admin users={users} setUsers={setUsers}/>}
        </main>
      </div>
      {showPwModal&&<PasswordModal userId={user.id} onClose={()=>setShowPwModal(false)}/>}
    </AuthCtx.Provider>
  );
}
