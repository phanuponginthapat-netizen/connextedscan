"""
Offline screens for the standalone build: the kiosk screen and the local admin
pages. Plain HTML + JavaScript so they work with no internet and no build step.
"""

KIOSK_HTML = r"""<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FaceGate — ตู้สแกนใบหน้า</title>
<style>
  :root { --blue:#1d4ed8; --ink:#0f172a; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:"Segoe UI",system-ui,sans-serif; background:#f4f7ff; color:var(--ink); overflow:hidden; }
  .wrap { display:grid; grid-template-columns:1fr 340px; height:100vh; }
  .stage { position:relative; display:flex; align-items:center; justify-content:center; background:#0b1220; }
  video { width:100%; height:100%; object-fit:cover; }
  .mirror video { transform:scaleX(-1); }
  .guide { position:absolute; width:min(46vh,60%); aspect-ratio:0.82; border:4px solid rgba(255,255,255,.85); border-radius:50%; box-shadow:0 0 0 9999px rgba(3,10,25,.45); }
  .banner { position:absolute; bottom:5vh; left:50%; transform:translateX(-50%); background:rgba(255,255,255,.95); padding:16px 28px; border-radius:18px; font-size:1.4rem; font-weight:600; text-align:center; min-width:60%; box-shadow:0 18px 40px rgba(2,10,40,.35); }
  .banner.ok { background:#dcfce7; } .banner.bad { background:#fee2e2; }
  .side { background:#fff; padding:18px; display:flex; flex-direction:column; gap:12px; border-left:1px solid #dbe3f5; }
  .clock { font-size:2.6rem; font-weight:700; letter-spacing:1px; }
  .school { color:#475569; font-weight:600; }
  .list { flex:1; overflow:hidden auto; display:flex; flex-direction:column; gap:8px; }
  .item { display:flex; gap:10px; align-items:center; background:#f8faff; border:1px solid #e5ecfb; border-radius:12px; padding:8px; }
  .item img { width:44px; height:44px; border-radius:10px; object-fit:cover; background:#e2e8f5; }
  .item b { display:block; font-size:.95rem; } .item span { font-size:.78rem; color:#64748b; }
  .tag { margin-left:auto; font-size:.72rem; padding:3px 8px; border-radius:999px; background:#e0e7ff; color:#1e3a8a; }
  .news { background:var(--blue); color:#fff; overflow:hidden; white-space:nowrap; padding:8px 0; border-radius:10px; }
  .news div { display:inline-block; animation:run 28s linear infinite; }
  @keyframes run { from{transform:translateX(0)} to{transform:translateX(-50%)} }
  .saver { position:fixed; inset:0; background:#050b18; color:#fff; display:none; flex-direction:column; align-items:center; justify-content:center; gap:20px; z-index:50; }
  .saver.show { display:flex; }
  .grid { display:grid; grid-template-columns:repeat(4,minmax(140px,1fr)); gap:18px; text-align:center; }
  .grid div { background:rgba(255,255,255,.07); border-radius:18px; padding:22px; }
  .grid b { display:block; font-size:3rem; }
  .admin { position:fixed; top:10px; right:10px; z-index:60; background:rgba(255,255,255,.9); border:0; border-radius:10px; padding:8px 12px; font-weight:600; cursor:pointer; }
</style>
</head>
<body>
<button class="admin" onclick="location.href='/admin'">หลังบ้าน</button>
<div class="wrap">
  <div class="stage" id="stage"><video id="cam" autoplay playsinline muted></video><div class="guide"></div>
    <div class="banner" id="banner">กรุณามองกล้องในกรอบวงรี</div>
  </div>
  <div class="side">
    <div class="clock" id="clock">--:--</div>
    <div class="school" id="school">FaceGate</div>
    <div class="news" id="newsBox" style="display:none"><div id="news"></div></div>
    <div style="font-weight:700">สแกนเข้าล่าสุด (วันนี้)</div>
    <div class="list" id="list"></div>
  </div>
</div>
<div class="saver" id="saver" onclick="wake()">
  <div style="font-size:1.4rem" id="saverTitle">สถิติวันนี้</div>
  <div class="grid">
    <div><b id="sPresent">0</b>มาแล้ว</div>
    <div><b id="sLate">0</b>มาสาย</div>
    <div><b id="sAbsent">0</b>ขาด</div>
    <div><b id="sLeft">0</b>กลับแล้ว</div>
  </div>
  <div style="opacity:.6">แตะหน้าจอเพื่อกลับสู่การสแกน</div>
</div>
<script>
const $ = (id) => document.getElementById(id);
let display = { mirror: true, voice_enabled: true, next_delay_seconds: 5 };
let busy = false, pausedUntil = 0;

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    $('cam').srcObject = stream;
  } catch (e) { say('ไม่พบกล้อง กรุณาตรวจสายกล้อง', 'bad'); }
}
function say(text, kind) {
  const b = $('banner'); b.textContent = text; b.className = 'banner' + (kind ? ' ' + kind : '');
}
function speak(text) {
  if (!display.voice_enabled || !text || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'th-TH'; u.rate = Number(display.voice_rate || 1); u.volume = Number(display.voice_volume || 1);
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function frame() {
  const v = $('cam');
  if (!v.videoWidth) return null;
  const c = document.createElement('canvas');
  c.width = 640; c.height = Math.round(640 * v.videoHeight / v.videoWidth);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82).split(',')[1];
}
async function tick() {
  if (busy || Date.now() < pausedUntil) return;
  const image = frame();
  if (!image) return;
  busy = true;
  try {
    const res = await fetch('/scan', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image }) });
    const data = await res.json();
    if (data.result === 'ok') { say(data.message, 'ok'); speak(data.speak); loadRecent();
      pausedUntil = Date.now() + (data.next_delay_seconds || 5) * 1000; }
    else if (data.result === 'duplicate' || data.result === 'denied') {
      say(data.message, 'bad'); speak(data.speak); pausedUntil = Date.now() + 3000; }
    else if (data.message && data.result !== 'no_face') { say(data.message); }
    else { say('กรุณามองกล้องในกรอบวงรี'); }
  } catch (e) { /* keep scanning */ }
  busy = false;
}
async function loadRecent() {
  try {
    const r = await fetch('/local/api/public/kiosk/recent');
    const data = await r.json();
    display = data.display || display;
    $('school').textContent = data.school_name || 'FaceGate';
    $('stage').className = 'stage' + (display.mirror ? ' mirror' : '');
    if (display.news_enabled && display.news_text) {
      $('newsBox').style.display = 'block';
      const t = display.news_text + '  •  ';
      $('news').textContent = t.repeat(6);
    } else { $('newsBox').style.display = 'none'; }
    $('list').innerHTML = (display.show_recent ? (data.items || []) : []).map((i) => `
      <div class="item">
        <img src="${i.snapshot_url || i.avatar_url || ''}" alt="" />
        <div><b>${i.name}</b><span>${i.detail || ''} • ${new Date(i.scanned_at).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</span></div>
        <div class="tag">${i.direction === 'out' ? 'ออก' : 'เข้า'}</div>
      </div>`).join('');
  } catch (e) {}
}
async function loadStats() {
  try {
    const r = await fetch('/local/api/public/kiosk/today-stats');
    const s = await r.json();
    $('sPresent').textContent = s.present; $('sLate').textContent = s.late;
    $('sAbsent').textContent = s.absent; $('sLeft').textContent = s.left;
    const show = s.screensaver_mode === 'stats' && s.windows_closed;
    $('saver').className = 'saver' + (show ? ' show' : '');
  } catch (e) {}
}
function wake() { $('saver').className = 'saver'; }
function clock() {
  $('clock').textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}
startCamera(); loadRecent(); loadStats(); clock();
setInterval(tick, 900); setInterval(loadRecent, 15000);
setInterval(loadStats, 60000); setInterval(clock, 10000);
</script>
</body>
</html>
"""

ADMIN_HTML = r"""<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FaceGate — หลังบ้านในเครื่อง</title>
<style>
  * { box-sizing:border-box; }
  body { margin:0; font-family:"Segoe UI",system-ui,sans-serif; background:#f4f7ff; color:#0f172a; }
  header { background:#1d4ed8; color:#fff; padding:14px 20px; display:flex; align-items:center; gap:16px; }
  header b { font-size:1.15rem; }
  nav { display:flex; gap:6px; flex-wrap:wrap; padding:12px 20px; background:#fff; border-bottom:1px solid #dbe3f5; }
  nav button { border:1px solid #dbe3f5; background:#f8faff; padding:8px 14px; border-radius:10px; cursor:pointer; font-weight:600; }
  nav button.on { background:#1d4ed8; color:#fff; border-color:#1d4ed8; }
  main { padding:20px; max-width:1100px; }
  .card { background:#fff; border:1px solid #e2e8f5; border-radius:16px; padding:18px; margin-bottom:16px; }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:end; }
  label { font-size:.85rem; font-weight:600; display:block; margin-bottom:4px; }
  input, select { padding:8px 10px; border:1px solid #cbd5e1; border-radius:10px; font-size:.95rem; }
  button.act { background:#1d4ed8; color:#fff; border:0; padding:9px 16px; border-radius:10px; font-weight:600; cursor:pointer; }
  button.ghost { background:#fff; border:1px solid #cbd5e1; padding:8px 14px; border-radius:10px; cursor:pointer; }
  button.warn { background:#dc2626; color:#fff; border:0; padding:7px 12px; border-radius:9px; cursor:pointer; }
  table { width:100%; border-collapse:collapse; font-size:.9rem; }
  th, td { text-align:left; padding:8px; border-bottom:1px solid #eef2fb; }
  .kpi { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
  .kpi div { background:#f8faff; border:1px solid #e5ecfb; border-radius:14px; padding:14px; }
  .kpi b { display:block; font-size:1.9rem; }
  video, .shot { width:280px; border-radius:14px; background:#0b1220; }
  .hide { display:none; }
  .msg { padding:10px 14px; border-radius:10px; background:#e0e7ff; margin-bottom:12px; }
  .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:12px; }
  .faces { display:flex; gap:8px; flex-wrap:wrap; }
  .faces figure { margin:0; text-align:center; }
  .faces img { width:88px; height:88px; object-fit:cover; border-radius:12px; }
</style>
</head>
<body>
<div id="gate" class="card" style="max-width:420px;margin:12vh auto">
  <h2 id="gateTitle">เข้าสู่ระบบผู้ดูแล</h2>
  <p id="gateHint" style="color:#475569"></p>
  <label>รหัสผ่าน</label>
  <input id="pw" type="password" style="width:100%" />
  <p><button class="act" onclick="enter()">เข้าใช้งาน</button></p>
  <div id="gateErr" style="color:#dc2626"></div>
</div>

<div id="app" class="hide">
<header><b>FaceGate หลังบ้านในเครื่อง</b><span id="dataDir" style="opacity:.8;font-size:.8rem"></span>
  <button class="ghost" style="margin-left:auto" onclick="location.href='/kiosk'">ไปหน้าตู้สแกน</button>
  <button class="ghost" onclick="logout()">ออกจากระบบ</button>
</header>
<nav id="tabs"></nav>
<main id="view"></main>
</div>

<script>
const $ = (s) => document.querySelector(s);
let TOKEN = localStorage.getItem('facegate_token') || '';
let TAB = 'overview';
const TABS = [
  ['overview', 'ภาพรวม'], ['people', 'รายชื่อคน'], ['enroll', 'ลงทะเบียนใบหน้า'],
  ['history', 'ประวัติการสแกน'], ['report', 'รายงาน'], ['settings', 'ตั้งค่าระบบ'],
  ['device', 'ประตู / พลังงาน'], ['backup', 'สำรองข้อมูล'], ['audit', 'บันทึกการใช้งาน'],
];

async function api(path, options = {}) {
  const res = await fetch('/local' + path, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-local-token': TOKEN, ...(options.headers || {}) },
  });
  if (res.status === 401) { TOKEN = ''; localStorage.removeItem('facegate_token'); boot(); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'ทำรายการไม่สำเร็จ');
  return res.status === 204 ? null : res.json();
}

async function boot() {
  const status = await (await fetch('/local/api/local/auth/status')).json();
  $('#gateTitle').textContent = status.configured ? 'เข้าสู่ระบบผู้ดูแล' : 'ตั้งรหัสผู้ดูแลครั้งแรก';
  $('#gateHint').textContent = status.configured
    ? 'ใส่รหัสผ่านผู้ดูแลของเครื่องนี้'
    : 'เครื่องนี้ยังไม่มีรหัสผู้ดูแล ตั้งรหัสอย่างน้อย 6 ตัวอักษร';
  window.__configured = status.configured;
  if (TOKEN) { try { await api('/api/local/overview'); return show(); } catch (e) {} }
  $('#gate').classList.remove('hide'); $('#app').classList.add('hide');
}

async function enter() {
  const password = $('#pw').value;
  const path = window.__configured ? '/api/local/auth/login' : '/api/local/auth/setup';
  try {
    const res = await fetch('/local' + path, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'ไม่สำเร็จ');
    TOKEN = data.token; localStorage.setItem('facegate_token', TOKEN); show();
  } catch (e) { $('#gateErr').textContent = e.message; }
}
function logout() { TOKEN = ''; localStorage.removeItem('facegate_token'); location.reload(); }

function show() {
  $('#gate').classList.add('hide'); $('#app').classList.remove('hide');
  $('#tabs').innerHTML = TABS.map(([k, l]) =>
    `<button class="${k === TAB ? 'on' : ''}" onclick="go('${k}')">${l}</button>`).join('');
  render();
}
function go(tab) { TAB = tab; show(); }
const esc = (v) => String(v ?? '').replace(/[<>&"]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const timeText = (v) => new Date(v).toLocaleString('th-TH');

async function render() {
  const view = $('#view');
  view.innerHTML = '<div class="card">กำลังโหลด…</div>';
  try {
    if (TAB === 'overview') return renderOverview(view);
    if (TAB === 'people') return renderPeople(view);
    if (TAB === 'enroll') return renderEnroll(view);
    if (TAB === 'history') return renderHistory(view);
    if (TAB === 'report') return renderReport(view);
    if (TAB === 'settings') return renderSettings(view);
    if (TAB === 'device') return renderDevice(view);
    if (TAB === 'backup') return renderBackup(view);
    if (TAB === 'audit') return renderAudit(view);
  } catch (e) { view.innerHTML = `<div class="card">${esc(e.message)}</div>`; }
}

async function renderOverview(view) {
  const d = await api('/api/local/overview');
  $('#dataDir').textContent = d.data_dir;
  view.innerHTML = `<div class="card"><h3>สถิติวันนี้</h3><div class="kpi">
    <div><b>${d.stats.present}</b>มาแล้ว</div><div><b>${d.stats.late}</b>มาสาย</div>
    <div><b>${d.stats.absent}</b>ขาด</div><div><b>${d.stats.left}</b>กลับแล้ว</div>
    <div><b>${d.stats.people}</b>รายชื่อทั้งหมด</div><div><b>${d.faces}</b>ภาพใบหน้าที่ใช้จำ</div>
  </div></div>
  <div class="card"><h3>เครื่องนี้</h3>
    <p>ที่เก็บข้อมูล: <code>${esc(d.data_dir)}</code></p>
    <p>ขนาดฐานข้อมูล ${d.db_size_mb} MB • พื้นที่ว่าง ${(d.disk_free_mb/1024).toFixed(1)} GB</p>
    <p>ระบบนี้ทำงานในเครื่องทั้งหมด ไม่ต้องต่ออินเทอร์เน็ต</p></div>`;
}

async function renderPeople(view) {
  const q = window.__q || '';
  const d = await api('/api/local/people?q=' + encodeURIComponent(q));
  view.innerHTML = `<div class="card"><h3>เพิ่ม / แก้ไขรายชื่อ</h3>
    <div class="grid2">
      <div><label>รหัส</label><input id="f_code" /></div>
      <div><label>ชื่อ-นามสกุล</label><input id="f_name" /></div>
      <div><label>ชื่อเล่น</label><input id="f_nick" /></div>
      <div><label>ชั้น/ห้อง</label><input id="f_class" /></div>
      <div><label>เบอร์ผู้ปกครอง</label><input id="f_phone" /></div>
      <div><label>ประเภท</label><select id="f_type"><option value="student">นักเรียน</option><option value="staff">บุคลากร</option></select></div>
    </div>
    <p><input id="f_id" type="hidden" /><button class="act" onclick="savePerson()">บันทึก</button>
    <button class="ghost" onclick="clearPerson()">ล้างฟอร์ม</button></p></div>
  <div class="card"><div class="row"><div><label>ค้นหา</label>
    <input id="q" value="${esc(q)}" placeholder="ชื่อ / รหัส / ชั้น" /></div>
    <button class="ghost" onclick="window.__q=$('#q').value;render()">ค้นหา</button></div>
    <table><thead><tr><th>ชื่อ</th><th>รหัส</th><th>ชั้น/แผนก</th><th>ใบหน้า</th><th></th></tr></thead>
    <tbody>${d.items.map((p) => `<tr>
      <td>${esc(p.full_name)}</td><td>${esc(p.student_code)}</td>
      <td>${esc(p.class_room || p.department || '')}</td><td>${p.faces}</td>
      <td><button class="ghost" onclick='editPerson(${JSON.stringify(p)})'>แก้ไข</button>
      <button class="warn" onclick="delPerson('${p.id}')">ลบ</button></td></tr>`).join('')}</tbody></table></div>`;
}
function editPerson(p) {
  $('#f_id').value = p.id; $('#f_code').value = p.student_code; $('#f_name').value = p.full_name;
  $('#f_nick').value = p.nickname || ''; $('#f_class').value = p.class_room || '';
  $('#f_phone').value = p.guardian_phone || ''; $('#f_type').value = p.person_type || 'student';
  window.scrollTo(0, 0);
}
function clearPerson() { ['f_id','f_code','f_name','f_nick','f_class','f_phone'].forEach((id)=>$('#'+id).value=''); }
async function savePerson() {
  await api('/api/local/people', { method: 'POST', body: JSON.stringify({
    id: $('#f_id').value || null, student_code: $('#f_code').value, full_name: $('#f_name').value,
    nickname: $('#f_nick').value, class_room: $('#f_class').value,
    guardian_phone: $('#f_phone').value, person_type: $('#f_type').value }) });
  clearPerson(); render();
}
async function delPerson(id) {
  if (!confirm('ลบรายชื่อนี้และภาพใบหน้าทั้งหมด?')) return;
  await api('/api/local/people/' + id, { method: 'DELETE' }); render();
}

async function renderEnroll(view) {
  const d = await api('/api/local/people');
  view.innerHTML = `<div class="card"><h3>ลงทะเบียนใบหน้า</h3>
    <div class="row"><div><label>เลือกคน</label><select id="e_person">
      ${d.items.map((p) => `<option value="${p.id}">${esc(p.full_name)} (${esc(p.student_code)})</option>`).join('')}
    </select></div>
    <button class="ghost" onclick="camOn()">เปิดกล้อง</button>
    <button class="act" onclick="capture()">ถ่ายและบันทึกใบหน้า</button>
    <div><label>หรืออัปโหลดรูป</label><input id="e_file" type="file" accept="image/*" onchange="upload(this)" /></div>
    </div>
    <p><video id="e_cam" autoplay playsinline muted></video></p>
    <div id="e_msg"></div><div class="faces" id="e_faces"></div></div>`;
  $('#e_person').onchange = loadFaces; loadFaces();
}
async function camOn() {
  try { $('#e_cam').srcObject = await navigator.mediaDevices.getUserMedia({ video: true }); }
  catch (e) { $('#e_msg').textContent = 'เปิดกล้องไม่ได้'; }
}
function grab(video) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = Math.round(640 * video.videoHeight / video.videoWidth);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}
async function sendFace(dataUrl, source) {
  const id = $('#e_person').value;
  $('#e_msg').innerHTML = '<div class="msg">กำลังประมวลผลใบหน้า…</div>';
  try {
    const r = await api(`/api/local/people/${id}/faces`, { method: 'POST',
      body: JSON.stringify({ image: dataUrl, source }) });
    $('#e_msg').innerHTML = `<div class="msg">บันทึกแล้ว • คุณภาพ ${(r.quality ?? 0).toFixed ? r.quality.toFixed(2) : r.quality}</div>`;
    loadFaces();
  } catch (e) { $('#e_msg').innerHTML = `<div class="msg">${esc(e.message)}</div>`; }
}
async function capture() {
  const v = $('#e_cam');
  if (!v.videoWidth) return camOn();
  sendFace(grab(v), 'liveness');
}
function upload(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => sendFace(reader.result, 'upload');
  reader.readAsDataURL(file);
}
async function loadFaces() {
  const id = $('#e_person').value; if (!id) return;
  const d = await api(`/api/local/people/${id}/faces`);
  $('#e_faces').innerHTML = d.items.map((f) => `<figure><img src="${f.url}" />
    <figcaption><button class="warn" onclick="delFace('${f.id}')">ลบ</button></figcaption></figure>`).join('');
}
async function delFace(id) { await api('/api/local/faces/' + id, { method: 'DELETE' }); loadFaces(); }

async function renderHistory(view) {
  const s = window.__hs || '', e = window.__he || '';
  const d = await api(`/api/local/attendance?start=${s}&end=${e}`);
  view.innerHTML = `<div class="card"><div class="row">
    <div><label>จากวันที่</label><input id="h_s" type="date" value="${d.start}" /></div>
    <div><label>ถึงวันที่</label><input id="h_e" type="date" value="${d.end}" /></div>
    <button class="ghost" onclick="window.__hs=$('#h_s').value;window.__he=$('#h_e').value;render()">ดูข้อมูล</button>
    <button class="ghost" onclick="csv()">บันทึกเป็นไฟล์ CSV</button></div>
    <table><thead><tr><th>เวลา</th><th>ชื่อ</th><th>รหัส</th><th>ทิศทาง</th><th>สถานะ</th><th></th></tr></thead>
    <tbody>${d.items.map((r) => `<tr><td>${timeText(r.scanned_at)}</td><td>${esc(r.full_name||'-')}</td>
      <td>${esc(r.student_code||'')}</td><td>${r.direction === 'out' ? 'ออก' : 'เข้า'}</td>
      <td>${esc(r.status)}</td>
      <td><button class="warn" onclick="delLog('${r.id}')">ลบ</button></td></tr>`).join('')}</tbody></table></div>`;
  window.__rows = d.items;
}
async function delLog(id) { await api('/api/local/attendance/' + id, { method: 'DELETE' }); render(); }
function csv() {
  const rows = window.__rows || [];
  const head = 'เวลา,ชื่อ,รหัส,ทิศทาง,สถานะ\n';
  const body = rows.map((r) => [timeText(r.scanned_at), r.full_name || '', r.student_code || '',
    r.direction === 'out' ? 'ออก' : 'เข้า', r.status].join(',')).join('\n');
  const blob = new Blob(['\ufeff' + head + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'facegate-attendance.csv'; a.click();
}

async function renderReport(view) {
  const s = window.__rs || '', e = window.__re || '';
  const d = await api(`/api/local/report?start=${s}&end=${e}`);
  view.innerHTML = `<div class="card"><div class="row">
    <div><label>จากวันที่</label><input id="r_s" type="date" value="${d.start}" /></div>
    <div><label>ถึงวันที่</label><input id="r_e" type="date" value="${d.end}" /></div>
    <button class="ghost" onclick="window.__rs=$('#r_s').value;window.__re=$('#r_e').value;render()">สร้างรายงาน</button>
    <button class="ghost" onclick="window.print()">พิมพ์</button></div>
    <h3>สรุปรายวัน (รายชื่อทั้งหมด ${d.people} คน)</h3>
    <table><thead><tr><th>วันที่</th><th>มาแล้ว</th><th>มาสาย</th><th>ขาด</th></tr></thead>
    <tbody>${d.days.map((x) => `<tr><td>${x.date}</td><td>${x.present}</td><td>${x.late}</td><td>${x.absent}</td></tr>`).join('')}</tbody></table>
    <h3>อันดับมาสาย</h3>
    <table><thead><tr><th>ชื่อ</th><th>ชั้น</th><th>มาสาย (วัน)</th><th>มาเรียน (วัน)</th></tr></thead>
    <tbody>${d.top_late.map((p) => `<tr><td>${esc(p.name||'')}</td><td>${esc(p.class_room||'')}</td><td>${p.late}</td><td>${p.present}</td></tr>`).join('')}</tbody></table></div>`;
}

const FIELDS = [
  ['school_name', 'ชื่อโรงเรียน', 'text'], ['checkin_start', 'เริ่มสแกนเข้า', 'time'],
  ['checkin_end', 'ปิดสแกนเข้า', 'time'], ['checkout_start', 'เริ่มสแกนออก', 'time'],
  ['checkout_end', 'ปิดสแกนออก', 'time'], ['late_after', 'ถือว่าสาย หลังเวลา', 'time'],
  ['late_grace_minutes', 'ผ่อนผัน (นาที)', 'number'], ['early_leave_before', 'ออกก่อนเวลา ก่อน', 'time'],
  ['work_days', 'วันทำการ (0=อาทิตย์)', 'text'], ['match_threshold', 'ความเข้มงวดการจำหน้า', 'number'],
  ['duplicate_cooldown_minutes', 'กันสแกนซ้ำ (นาที)', 'number'],
  ['next_person_delay_seconds', 'เว้นก่อนคนถัดไป (วินาที)', 'number'],
  ['kiosk_recent_limit', 'จำนวนรายการล่าสุด', 'number'],
  ['kiosk_news_text', 'ข้อความข่าววิ่ง', 'text'],
  ['voice_template', 'ข้อความเสียงเมื่อสแกนผ่าน', 'text'],
];
const FLAGS = [
  ['block_non_work_days', 'ปิดรับสแกนวันหยุด'], ['require_liveness', 'ตรวจว่าเป็นคนจริง'],
  ['save_snapshots', 'เก็บภาพตอนสแกน'], ['auto_enroll', 'เรียนรู้ใบหน้าเพิ่มอัตโนมัติ'],
  ['kiosk_show_recent', 'แสดงรายการล่าสุด'], ['kiosk_mirror', 'กลับภาพกล้องเหมือนกระจก'],
  ['kiosk_news_enabled', 'เปิดข้อความข่าววิ่ง'], ['voice_enabled', 'เปิดเสียงพูด'],
  ['door_enabled', 'เปิดใช้ประตูอัจฉริยะ'],
];

async function renderSettings(view) {
  const d = await api('/api/local/settings');
  const s = d.settings;
  view.innerHTML = `<div class="card"><h3>ตั้งค่าระบบ</h3><div class="grid2">
    ${FIELDS.map(([k, l, t]) => `<div><label>${l}</label>
      <input id="s_${k}" type="${t}" ${t==='number'?'step="any"':''} value="${esc(s[k] ?? '')}" /></div>`).join('')}
    <div><label>ภาพพักหน้าจอ</label><select id="s_screensaver_mode">
      <option value="stats"${s.screensaver_mode==='stats'?' selected':''}>แสดงสถิติวันนี้</option>
      <option value="black"${s.screensaver_mode==='black'?' selected':''}>จอดำ</option></select></div>
  </div>
  <p>${FLAGS.map(([k, l]) => `<label style="display:inline-block;margin:6px 16px 6px 0">
    <input id="s_${k}" type="checkbox" ${s[k] ? 'checked' : ''} /> ${l}</label>`).join('')}</p>
  <p><button class="act" onclick="saveSettings()">บันทึกการตั้งค่า</button>
  <button class="ghost" onclick="changePw()">เปลี่ยนรหัสผู้ดูแล</button></p>
  <div id="s_msg"></div></div>`;
}
async function saveSettings() {
  const patch = {};
  FIELDS.forEach(([k, , t]) => {
    const v = $('#s_' + k).value;
    patch[k] = t === 'number' ? (v === '' ? null : Number(v)) : (v === '' ? null : v);
  });
  FLAGS.forEach(([k]) => { patch[k] = $('#s_' + k).checked; });
  patch.screensaver_mode = $('#s_screensaver_mode').value;
  await api('/api/local/settings', { method: 'POST', body: JSON.stringify(patch) });
  $('#s_msg').innerHTML = '<div class="msg">บันทึกแล้ว ระบบจะใช้ค่าใหม่ภายใน 30 วินาที</div>';
}
async function changePw() {
  const password = prompt('รหัสผู้ดูแลใหม่ (อย่างน้อย 6 ตัวอักษร)');
  if (!password) return;
  await api('/api/local/auth/password', { method: 'POST', body: JSON.stringify({ password }) });
  alert('เปลี่ยนรหัสแล้ว');
}

async function renderDevice(view) {
  view.innerHTML = `<div class="card"><h3>ประตูอัจฉริยะ (micro:bit)</h3>
    <p><button class="act" onclick="door('open')">ทดลองยกขึ้น</button>
    <button class="ghost" onclick="door('close')">ลดลง</button>
    <button class="ghost" onclick="door('deny')">เสียงปฏิเสธ</button></p>
    <p style="color:#475569">ต่อ micro:bit เข้าพอร์ต USB ของเครื่องนี้ และจ่ายไฟ 5V แยกให้เซอร์โว</p></div>
  <div class="card"><h3>ประหยัดพลังงาน</h3>
    <p><button class="ghost" onclick="power('screen_off')">ปิดหน้าจอ</button>
    <button class="ghost" onclick="power('screen_on')">เปิดหน้าจอ</button>
    <button class="ghost" onclick="power('sleep')">พักเครื่อง</button>
    <button class="warn" onclick="power('shutdown')">ปิดเครื่อง</button>
    <button class="ghost" onclick="power('cancel')">ยกเลิก</button></p></div>`;
}
async function door(action) { await api('/api/local/door/command', { method: 'POST', body: JSON.stringify({ action }) }); alert('ส่งคำสั่งแล้ว'); }
async function power(action) { await api('/api/local/power/command', { method: 'POST', body: JSON.stringify({ action }) }); alert('ส่งคำสั่งแล้ว'); }

async function renderBackup(view) {
  view.innerHTML = `<div class="card"><h3>สำรองข้อมูล</h3>
    <p>ไฟล์สำรองรวมรายชื่อ ใบหน้า ประวัติการสแกน และการตั้งค่าทั้งหมดของเครื่องนี้</p>
    <p><button class="act" onclick="downloadBackup()">ดาวน์โหลดไฟล์สำรอง</button></p></div>
  <div class="card"><h3>กู้คืนข้อมูล</h3>
    <p>เลือกไฟล์สำรอง (.zip) เพื่อนำข้อมูลกลับ หรือย้ายไปเครื่องใหม่</p>
    <input type="file" accept=".zip" onchange="restore(this)" /><div id="b_msg"></div></div>`;
}
function downloadBackup() { location.href = '/local/api/local/backup?token=' + encodeURIComponent(TOKEN); }
async function restore(input) {
  const file = input.files[0]; if (!file) return;
  if (!confirm('กู้คืนจะเขียนทับข้อมูลปัจจุบัน ต้องการทำต่อ?')) return;
  const res = await fetch('/local/api/local/restore', { method: 'POST',
    headers: { 'x-local-token': TOKEN }, body: file });
  const data = await res.json();
  $('#b_msg').innerHTML = `<div class="msg">${res.ok ? 'กู้คืนแล้ว กรุณาปิดและเปิดโปรแกรมใหม่' : esc(data.detail)}</div>`;
}

async function renderAudit(view) {
  const d = await api('/api/local/audit');
  view.innerHTML = `<div class="card"><h3>บันทึกการใช้งาน</h3>
    <table><thead><tr><th>เวลา</th><th>การกระทำ</th><th>รายละเอียด</th></tr></thead>
    <tbody>${d.items.map((r) => `<tr><td>${timeText(r.created_at)}</td><td>${esc(r.action)}</td>
      <td>${esc(r.detail || r.target || '')}</td></tr>`).join('')}</tbody></table></div>`;
}

boot();
</script>
</body>
</html>
"""
