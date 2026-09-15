"""
Offline admin pages for the standalone build.
Same white/blue look as the online admin site, but every screen reads and
writes the local database on this PC.
"""

ADMIN_HTML = r"""<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FaceGate — ระบบหลังบ้านในเครื่อง</title>
<style>
  :root { --primary:#1d6fe0; --accent:#0ea5e9; --ink:#132a4f; --line:#e2e9f8; }
  * { box-sizing:border-box; }
  body { margin:0; color:var(--ink); background:#f4f8fe;
    font-family:"IBM Plex Sans Thai","Noto Sans Thai","Segoe UI",system-ui,sans-serif; }
  a { color:var(--primary); }
  .shell { display:grid; grid-template-columns:250px 1fr; min-height:100vh; }
  aside { background:#fff; border-right:1px solid var(--line); padding:18px 14px; position:sticky; top:0; height:100vh; overflow:auto; }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:18px; }
  .brand img { width:40px; height:40px; border-radius:12px; object-fit:contain; }
  .brand span { grid-area:auto; }
  .brand b { font-size:1.05rem; display:block; } .brand small { color:#64748b; }
  aside button { display:flex; align-items:center; gap:8px; width:100%; text-align:left; border:0;
    background:transparent; padding:10px 12px; border-radius:12px; font:inherit; font-weight:600;
    color:#334155; cursor:pointer; margin-bottom:2px; }
  aside button:hover { background:#f1f6ff; }
  aside button.on { background:linear-gradient(90deg,var(--primary),var(--accent)); color:#fff; }
  main { padding:22px 26px 60px; }
  .topbar { display:flex; align-items:center; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
  h1 { font-size:1.35rem; margin:0; }
  .sub { color:#64748b; font-size:.88rem; }
  .card { background:#fff; border:1px solid var(--line); border-radius:20px; padding:20px;
    margin-bottom:18px; box-shadow:0 10px 30px rgba(20,60,140,.05); }
  .card h3 { margin:0 0 12px; font-size:1.02rem; }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; }
  .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
  label { display:block; font-size:.8rem; font-weight:700; color:#475569; margin-bottom:4px; }
  input, select, textarea { width:100%; padding:9px 11px; border:1px solid #cbd5e1; border-radius:12px;
    font:inherit; background:#fff; }
  input[type=color] { padding:3px; height:40px; }
  .btn { border:0; cursor:pointer; font:inherit; font-weight:700; padding:10px 18px; border-radius:999px;
    background:linear-gradient(90deg,var(--primary),var(--accent)); color:#fff;
    box-shadow:0 10px 22px rgba(29,111,224,.25); }
  .btn.ghost { background:#fff; color:var(--ink); border:1px solid #cbd5e1; box-shadow:none; }
  .btn.danger { background:#dc2626; box-shadow:none; padding:7px 14px; }
  .btn.sm { padding:6px 13px; font-size:.85rem; }
  table { width:100%; border-collapse:collapse; font-size:.9rem; }
  th { text-align:left; font-size:.78rem; color:#64748b; text-transform:uppercase; letter-spacing:.04em; }
  th, td { padding:9px 8px; border-bottom:1px solid #eff3fc; }
  tbody tr:hover { background:#f8fbff; }
  .kpi { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
  .kpi div { background:linear-gradient(180deg,#f7fbff,#eef5ff); border:1px solid var(--line);
    border-radius:18px; padding:16px; }
  .kpi b { display:block; font-size:2rem; color:var(--primary); }
  .kpi span { font-size:.82rem; color:#64748b; }
  .pill { font-size:.72rem; font-weight:700; padding:4px 10px; border-radius:999px; background:#e0edff; color:#14428e; }
  .pill.bad { background:#fee2e2; color:#7f1d1d; } .pill.good { background:#dcfce7; color:#14532d; }
  .msg { padding:10px 14px; border-radius:12px; background:#e6f0ff; font-size:.9rem; margin-top:10px; }
  .msg.bad { background:#fee2e2; } .msg.good { background:#dcfce7; }
  video { width:300px; border-radius:16px; background:#0b1220; }
  .faces { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
  .faces figure { margin:0; text-align:center; }
  .faces img { width:92px; height:92px; object-fit:cover; border-radius:14px; border:1px solid var(--line); }
  .hide { display:none !important; }
  .gate { max-width:420px; margin:12vh auto; }
  textarea { min-height:150px; font-family:ui-monospace,monospace; font-size:.85rem; }
  @media print { aside, .topbar, .noprint { display:none !important; } .shell { display:block; } }
</style>
</head>
<body>
<div id="gate" class="card gate">
  <h1 id="gateTitle">เข้าสู่ระบบผู้ดูแล</h1>
  <p class="sub" id="gateHint"></p>
  <label>รหัสผ่าน</label>
  <input id="pw" type="password" onkeydown="if(event.key==='Enter')enter()" />
  <p><button class="btn" onclick="enter()">เข้าใช้งาน</button></p>
  <div id="gateErr" class="msg bad hide"></div>
</div>

<div id="app" class="shell hide">
  <aside>
    <div class="brand"><img id="brandLogo" alt="" style="display:none" />
      <div><b id="brandName">FaceGate</b><small>จบในเครื่อง</small></div></div>
    <div id="menu"></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:14px 0" />
    <button onclick="location.href='/kiosk'">🖥 ไปหน้าตู้สแกน</button>
    <button onclick="logout()">ออกจากระบบ</button>
    <p class="sub" style="margin-top:14px;font-size:.72rem" id="dataDir"></p>
  </aside>
  <main>
    <div class="topbar"><div><h1 id="pageTitle"></h1><div class="sub" id="pageSub"></div></div></div>
    <div id="view"></div>
  </main>
</div>

<script>
const $ = (s) => document.querySelector(s);
let TOKEN = localStorage.getItem('facegate_token') || '';
let TAB = 'overview';
const TABS = [
  ['overview', '📊 ภาพรวม', 'ภาพรวมวันนี้', 'สรุปการเข้า-ออกและสถานะเครื่อง'],
  ['people', '👥 รายชื่อคน', 'รายชื่อนักเรียนและบุคลากร', 'เพิ่ม แก้ไข ค้นหา และลบรายชื่อ'],
  ['import', '📥 นำเข้ารายชื่อ', 'นำเข้ารายชื่อหลายคนพร้อมกัน', 'วางข้อมูลจาก Excel หรือเลือกไฟล์ CSV'],
  ['enroll', '🙂 ลงทะเบียนใบหน้า', 'ลงทะเบียนใบหน้า', 'ค้นหาด้วยรหัส ชื่อ หรือระดับชั้น แล้วถ่ายภาพ'],
  ['history', '🕒 ประวัติการสแกน', 'ประวัติการสแกน', 'ดูย้อนหลัง ส่งออก CSV และลบรายการ'],
  ['report', '📈 รายงาน', 'รายงานสรุป', 'สรุปรายวันและอันดับมาสาย'],
  ['class_report', '📋 รายงานการมาโรงเรียน', 'รายงานการมาโรงเรียน', 'สรุปตามชั้นและรายชื่อผู้ขาด'],
  ['certificate', '📜 ใบรับรองเวลาเรียน', 'ใบรับรองเวลาเรียน', 'เลือกคนและช่วงวัน แล้วสั่งพิมพ์'],
  ['visitors', '🚶 ผู้มาติดต่อ / แจ้งเตือน', 'ผู้มาติดต่อและการแจ้งเตือน', 'ภาพผู้ไม่ลงทะเบียนและเหตุการณ์ผิดปกติ'],
  ['content', '🎨 เนื้อหาและธีม', 'เนื้อหาและธีม', 'ชื่อโรงเรียน โลโก้ สี และข้อความบนหน้าจอ'],
  ['settings', '⚙️ ตั้งค่าระบบ', 'ตั้งค่าระบบ', 'เวลาเข้า-ออก การจำใบหน้า เสียงพูด'],
  ['device', '🚪 ประตู / พลังงาน', 'ประตูอัจฉริยะและพลังงาน', 'ทดสอบไม้กั้นและสั่งปิด-เปิดเครื่อง'],
  ['devices', '🖥️ ตู้สแกนในวง LAN', 'ตู้สแกนในวง LAN', 'เพิ่มตู้สแกนหลายเครื่องที่ใช้ข้อมูลชุดเดียวกัน'],
  ['health', '❤️ สุขภาพระบบ', 'สุขภาพระบบ', 'พื้นที่ว่าง ขนาดข้อมูล และการล้างข้อมูลเก่า'],
  ['backup', '💾 สำรองข้อมูล', 'สำรองและกู้คืนข้อมูล', 'ไฟล์เดียวย้ายเครื่องได้ทั้งระบบ'],
  ['audit', '🧾 บันทึกการใช้งาน', 'บันทึกการใช้งาน', 'ใครแก้ไขอะไร เมื่อไร'],
];

async function api(path, options = {}) {
  const res = await fetch('/local' + path, { ...options,
    headers: { 'content-type': 'application/json', 'x-local-token': TOKEN, ...(options.headers || {}) } });
  if (res.status === 401) { TOKEN = ''; localStorage.removeItem('facegate_token'); location.reload(); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'ทำรายการไม่สำเร็จ');
  return res.json();
}
const esc = (v) => String(v ?? '').replace(/[<>&"']/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const timeText = (v) => new Date(v).toLocaleString('th-TH');

async function boot() {
  const status = await (await fetch('/local/api/local/auth/status')).json();
  window.__configured = status.configured;
  $('#gateTitle').textContent = status.configured ? 'เข้าสู่ระบบผู้ดูแล' : 'ตั้งรหัสผู้ดูแลครั้งแรก';
  $('#gateHint').textContent = status.configured
    ? 'ใส่รหัสผ่านผู้ดูแลของเครื่องนี้' : 'เครื่องนี้ยังไม่มีรหัสผู้ดูแล ตั้งรหัสอย่างน้อย 6 ตัวอักษร';
  if (TOKEN) { try { await api('/api/local/overview'); return show(); } catch (e) {} }
  $('#gate').classList.remove('hide'); $('#app').classList.add('hide');
}
async function enter() {
  const password = $('#pw').value;
  const path = window.__configured ? '/api/local/auth/login' : '/api/local/auth/setup';
  const res = await fetch('/local' + path, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = $('#gateErr'); e.textContent = data.detail || 'ไม่สำเร็จ'; e.classList.remove('hide'); return; }
  TOKEN = data.token; localStorage.setItem('facegate_token', TOKEN); show();
}
function logout() { localStorage.removeItem('facegate_token'); location.reload(); }

async function show() {
  $('#gate').classList.add('hide'); $('#app').classList.remove('hide');
  $('#menu').innerHTML = TABS.map(([k, label]) =>
    `<button class="${k === TAB ? 'on' : ''}" onclick="go('${k}')">${label}</button>`).join('');
  const tab = TABS.find((t) => t[0] === TAB) || TABS[0];
  $('#pageTitle').textContent = tab[2]; $('#pageSub').textContent = tab[3];
  loadBrand(); render();
}
function go(tab) { TAB = tab; show(); window.scrollTo(0, 0); }
async function loadBrand() {
  try {
    const { content } = await api('/api/local/content');
    document.documentElement.style.setProperty('--primary', content.theme_primary || '#1d6fe0');
    document.documentElement.style.setProperty('--accent', content.theme_accent || '#0ea5e9');
    $('#brandName').textContent = content.brand_name || 'FaceGate';
    if (content.logo_url) { $('#brandLogo').src = content.logo_url; $('#brandLogo').style.display = 'block'; }
  } catch (e) {}
}

async function render() {
  const view = $('#view');
  view.innerHTML = '<div class="card">กำลังโหลด…</div>';
  const map = { overview: renderOverview, people: renderPeople, import: renderImport, enroll: renderEnroll,
    history: renderHistory, report: renderReport, class_report: renderClassReport, certificate: renderCertificate, visitors: renderVisitors,
    content: renderContent, settings: renderSettings, device: renderDevice, devices: renderDevices,
    health: renderHealth,
    backup: renderBackup, audit: renderAudit };
  try { await (map[TAB] || renderOverview)(view); }
  catch (e) { view.innerHTML = `<div class="card msg bad">${esc(e.message)}</div>`; }
}

/* ---------------------------------------------------------------- overview */
async function renderOverview(view) {
  const d = await api('/api/local/overview');
  $('#dataDir').textContent = 'ข้อมูล: ' + d.data_dir;
  const s = d.stats;
  view.innerHTML = `
    <div class="card"><h3>${esc(s.school_name || '')} — สถิติวันนี้</h3><div class="kpi">
      <div><b>${s.present}</b><span>มาแล้ว</span></div><div><b>${s.late}</b><span>มาสาย</span></div>
      <div><b>${s.absent}</b><span>ขาด</span></div><div><b>${s.left}</b><span>กลับแล้ว</span></div>
      <div><b>${s.people}</b><span>รายชื่อทั้งหมด</span></div><div><b>${d.faces}</b><span>ภาพใบหน้าที่ใช้จำ</span></div>
    </div></div>
    <div class="card"><h3>สถานะเครื่องนี้</h3>
      <p class="sub">ระบบนี้ทำงานในเครื่องทั้งหมด ไม่ต้องต่ออินเทอร์เน็ต</p>
      <div class="kpi"><div><b>${(d.disk_free_mb/1024).toFixed(1)}</b><span>พื้นที่ว่าง (GB)</span></div>
      <div><b>${d.db_size_mb}</b><span>ขนาดข้อมูล (MB)</span></div>
      <div><b>${s.is_workday ? 'วันทำการ' : 'วันหยุด'}</b><span>สถานะวันนี้</span></div></div></div>
    <div class="card"><h3>เริ่มต้นใช้งาน</h3><ol class="sub" style="line-height:1.9">
      <li>ตั้งชื่อโรงเรียน โลโก้ และสี ที่ “เนื้อหาและธีม”</li>
      <li>ตั้งเวลาเข้า-ออกที่ “ตั้งค่าระบบ”</li>
      <li>นำเข้ารายชื่อทั้งห้องที่ “นำเข้ารายชื่อ”</li>
      <li>ลงทะเบียนใบหน้าทีละคนที่ “ลงทะเบียนใบหน้า”</li>
      <li>สำรองข้อมูลไว้เป็นระยะที่ “สำรองข้อมูล”</li>
    </ol></div>`;
}

/* ------------------------------------------------------------------ people */
async function renderPeople(view) {
  const q = window.__q || '', cls = window.__cls || '';
  const [d, classes] = await Promise.all([
    api('/api/local/people?q=' + encodeURIComponent(q)), api('/api/local/classes')]);
  const rows = d.items.filter((p) => !cls || (p.class_room || p.department) === cls);
  view.innerHTML = `
    <div class="card"><h3>เพิ่ม / แก้ไขรายชื่อ</h3><div class="grid2">
      <div><label>รหัส *</label><input id="f_code" /></div>
      <div><label>ชื่อ-นามสกุล *</label><input id="f_name" /></div>
      <div><label>ชื่อเล่น</label><input id="f_nick" /></div>
      <div><label>ระดับชั้น / ห้อง</label><input id="f_class" /></div>
      <div><label>เพศ</label><select id="f_gender"><option value="unspecified">ไม่ระบุ</option><option value="male">ชาย</option><option value="female">หญิง</option></select></div>
      <div><label>เบอร์ผู้ปกครอง</label><input id="f_phone" /></div>
      <div><label>ประเภท</label><select id="f_type">
        <option value="student">นักเรียน</option><option value="staff">บุคลากร</option></select></div>
    </div><input id="f_id" type="hidden" />
    <p><button class="btn" onclick="savePerson()">บันทึก</button>
       <button class="btn ghost" onclick="clearPerson()">ล้างฟอร์ม</button></p></div>
    <div class="card"><div class="row">
      <div style="flex:1;min-width:200px"><label>ค้นหา (รหัส / ชื่อ / ชั้น)</label>
        <input id="q" value="${esc(q)}" onkeydown="if(event.key==='Enter')applyFilter()" /></div>
      <div><label>กรองตามระดับชั้น</label><select id="cls">
        <option value="">ทั้งหมด</option>
        ${classes.items.map((c) => `<option${c === cls ? ' selected' : ''}>${esc(c)}</option>`).join('')}
      </select></div>
      <button class="btn ghost" onclick="applyFilter()">ค้นหา</button></div>
      <p class="sub">พบ ${rows.length} รายชื่อ</p>
      <table><thead><tr><th>ชื่อ</th><th>รหัส</th><th>ชั้น/แผนก</th><th>เพศ</th><th>ใบหน้า</th><th></th></tr></thead><tbody>
      ${rows.map((p) => `<tr><td>${esc(p.full_name)}</td><td>${esc(p.student_code)}</td>
        <td>${esc(p.class_room || p.department || '-')}</td>
        <td>${p.gender === 'male' ? 'ชาย' : p.gender === 'female' ? 'หญิง' : 'ไม่ระบุ'}</td>
        <td><span class="pill ${p.faces ? 'good' : 'bad'}">${p.faces}</span></td>
        <td style="white-space:nowrap"><button class="btn ghost sm" onclick='editPerson(${JSON.stringify(p)})'>แก้ไข</button>
        <button class="btn danger sm" onclick="delPerson('${p.id}')">ลบ</button></td></tr>`).join('')}
      </tbody></table></div>`;
}
function applyFilter() { window.__q = $('#q').value; window.__cls = $('#cls').value; render(); }
function editPerson(p) {
  $('#f_id').value = p.id; $('#f_code').value = p.student_code; $('#f_name').value = p.full_name;
  $('#f_nick').value = p.nickname || ''; $('#f_class').value = p.class_room || '';
  $('#f_phone').value = p.guardian_phone || ''; $('#f_gender').value = p.gender || 'unspecified';
  $('#f_type').value = p.person_type || 'student';
  window.scrollTo(0, 0);
}
function clearPerson() { ['f_id','f_code','f_name','f_nick','f_class','f_phone'].forEach((id) => $('#' + id).value = ''); $('#f_gender').value = 'unspecified'; }
async function savePerson() {
  await api('/api/local/people', { method: 'POST', body: JSON.stringify({
    id: $('#f_id').value || null, student_code: $('#f_code').value, full_name: $('#f_name').value,
    nickname: $('#f_nick').value, class_room: $('#f_class').value,
    guardian_phone: $('#f_phone').value, gender: $('#f_gender').value, person_type: $('#f_type').value }) });
  clearPerson(); render();
}
async function delPerson(id) {
  if (!confirm('ลบรายชื่อนี้และภาพใบหน้าทั้งหมด?')) return;
  await api('/api/local/people/' + id, { method: 'DELETE' }); render();
}

/* ------------------------------------------------------------------ import */
async function renderImport(view) {
  view.innerHTML = `
    <div class="card"><h3>นำเข้ารายชื่อหลายคนพร้อมกัน</h3>
      <p class="sub">คัดลอกจาก Excel แล้ววางลงช่องนี้ได้เลย (คั่นด้วย Tab หรือคอมมา) หนึ่งบรรทัดหนึ่งคน<br />
      ลำดับคอลัมน์: <b>รหัส, ชื่อ-นามสกุล, ระดับชั้น, เพศ, ชื่อเล่น (ไม่ใส่ก็ได้), เบอร์ผู้ปกครอง (ไม่ใส่ก็ได้)</b><br />
      ถ้ามีหัวตาราง เช่น รหัส/ชื่อ/ชั้น ระบบจะข้ามให้เอง และรหัสที่มีอยู่แล้วจะถูกอัปเดตทับ</p>
      <div class="row"><div><label>เลือกไฟล์ CSV</label><input type="file" accept=".csv,.txt" onchange="loadCsv(this)" /></div>
        <div><label>ประเภท</label><select id="i_type">
          <option value="student">นักเรียน</option><option value="staff">บุคลากร</option></select></div></div>
      <p><label>วางข้อมูลที่นี่</label>
      <textarea id="i_text" placeholder="10001&#9;สมชาย ใจดี&#9;ป.1/1&#9;ชาย&#10;10002&#9;สมหญิง รักเรียน&#9;ป.1/1&#9;หญิง"></textarea></p>
      <p><button class="btn" onclick="doImport()">ตรวจและนำเข้า</button>
         <button class="btn ghost" onclick="$('#i_text').value=''">ล้าง</button></p>
      <div id="i_msg"></div></div>`;
}
function loadCsv(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { $('#i_text').value = String(reader.result || ''); };
  reader.readAsText(file, 'utf-8');
}
function parseRows(text, personType) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split(/\t|,|;/).map((c) => c.trim().replace(/^"|"$/g, ''));
    const [code, name, cls, genderText, nick, phone] = cells;
    if (!code || !name) continue;
    if (/รหัส|code/i.test(code) && /ชื่อ|name/i.test(name)) continue; // header row
    const gender = ['ชาย','ช','male','m'].includes((genderText || '').toLowerCase()) ? 'male'
      : ['หญิง','ญ','female','f'].includes((genderText || '').toLowerCase()) ? 'female' : 'unspecified';
    rows.push({ student_code: code, full_name: name, class_room: cls || null, gender,
      nickname: nick || null, guardian_phone: phone || null, person_type: personType });
  }
  return rows;
}
async function doImport() {
  const rows = parseRows($('#i_text').value, $('#i_type').value);
  const box = $('#i_msg');
  if (!rows.length) { box.className = 'msg bad'; box.textContent = 'ไม่พบรายชื่อที่อ่านได้ ตรวจรูปแบบอีกครั้ง'; return; }
  box.className = 'msg'; box.textContent = `กำลังนำเข้า ${rows.length} รายชื่อ…`;
  const r = await api('/api/local/people/import', { method: 'POST', body: JSON.stringify({ rows }) });
  box.className = 'msg good';
  box.innerHTML = `นำเข้าเสร็จ • เพิ่มใหม่ ${r.added} คน • อัปเดต ${r.updated} คน • ข้าม ${r.skipped} บรรทัด`
    + (r.errors.length ? '<br />' + r.errors.map(esc).join('<br />') : '');
}

/* ------------------------------------------------------------------ enroll */
async function renderEnroll(view) {
  const [d, classes] = await Promise.all([api('/api/local/people'), api('/api/local/classes')]);
  window.__people = d.items;
  view.innerHTML = `
    <div class="card"><h3>เลือกคนที่จะลงทะเบียนใบหน้า</h3>
      <div class="row">
        <div style="flex:1;min-width:220px"><label>ค้นหาด้วยรหัส หรือชื่อ</label>
          <input id="e_q" placeholder="เช่น 10001 หรือ สมชาย" oninput="fillPeople()" /></div>
        <div><label>ระดับชั้น</label><select id="e_cls" onchange="fillPeople()">
          <option value="">ทั้งหมด</option>
          ${classes.items.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div><label>เฉพาะคนที่ยัง</label><select id="e_only" onchange="fillPeople()">
          <option value="">ทั้งหมด</option><option value="none">ยังไม่มีใบหน้า</option>
          <option value="some">มีใบหน้าแล้ว</option></select></div>
      </div>
      <p><label>รายชื่อที่ตรงกับตัวกรอง</label><select id="e_person" size="8" onchange="loadFaces()"></select></p>
    </div>
    <div class="card"><h3>ถ่ายภาพหรืออัปโหลดรูป</h3>
      <div class="row"><button class="btn ghost" onclick="camOn()">เปิดกล้อง</button>
        <button class="btn" onclick="capture()">ถ่ายและบันทึกใบหน้า</button>
        <div><label>อัปโหลดรูปจากไฟล์</label><input type="file" accept="image/*" onchange="upload(this)" /></div></div>
      <p><video id="e_cam" autoplay playsinline muted></video></p>
      <p class="sub">ถ่าย 3–5 รูปต่อคน มองตรง หันซ้าย-ขวาเล็กน้อย แสงสว่างพอ จะจำได้แม่นขึ้น</p>
      <div id="e_msg"></div><div class="faces" id="e_faces"></div></div>`;
  fillPeople();
}
function fillPeople() {
  const q = ($('#e_q').value || '').toLowerCase().trim();
  const cls = $('#e_cls').value, only = $('#e_only').value;
  const rows = (window.__people || []).filter((p) => {
    const text = `${p.student_code} ${p.full_name} ${p.nickname || ''} ${p.class_room || ''} ${p.department || ''}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (cls && (p.class_room || p.department) !== cls) return false;
    if (only === 'none' && p.faces > 0) return false;
    if (only === 'some' && p.faces === 0) return false;
    return true;
  });
  const select = $('#e_person');
  select.innerHTML = rows.map((p) => `<option value="${p.id}">${esc(p.full_name)} • ${esc(p.student_code)}`
    + ` • ${esc(p.class_room || p.department || '-')} • ใบหน้า ${p.faces}</option>`).join('')
    || '<option value="">— ไม่พบรายชื่อที่ตรงกับตัวกรอง —</option>';
  loadFaces();
}
async function camOn() {
  try { $('#e_cam').srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640 } }); }
  catch (e) { $('#e_msg').className = 'msg bad'; $('#e_msg').textContent = 'เปิดกล้องไม่ได้'; }
}
function grab(video) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = Math.round(640 * video.videoHeight / video.videoWidth);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}
async function sendFace(dataUrl, source) {
  const id = $('#e_person').value;
  const box = $('#e_msg');
  if (!id) { box.className = 'msg bad'; box.textContent = 'กรุณาเลือกคนก่อน'; return; }
  box.className = 'msg'; box.textContent = 'กำลังประมวลผลใบหน้า…';
  try {
    const r = await api(`/api/local/people/${id}/faces`, { method: 'POST', body: JSON.stringify({ image: dataUrl, source }) });
    box.className = 'msg good';
    box.textContent = `บันทึกใบหน้าแล้ว • คุณภาพภาพ ${Number(r.quality ?? 0).toFixed(2)}`;
    const person = (window.__people || []).find((p) => p.id === id);
    if (person) person.faces += 1;
    loadFaces();
  } catch (e) { box.className = 'msg bad'; box.textContent = e.message; }
}
async function capture() { const v = $('#e_cam'); if (!v.videoWidth) return camOn(); sendFace(grab(v), 'liveness'); }
function upload(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => sendFace(String(reader.result), 'upload');
  reader.readAsDataURL(file);
}
async function loadFaces() {
  const id = $('#e_person') ? $('#e_person').value : '';
  if (!id) { if ($('#e_faces')) $('#e_faces').innerHTML = ''; return; }
  const d = await api(`/api/local/people/${id}/faces`);
  $('#e_faces').innerHTML = d.items.map((f) => `<figure><img src="${f.url}" alt="" />
    <figcaption><button class="btn danger sm" onclick="delFace('${f.id}')">ลบ</button></figcaption></figure>`).join('');
}
async function delFace(id) { await api('/api/local/faces/' + id, { method: 'DELETE' }); loadFaces(); }

/* ----------------------------------------------------------------- history */
async function renderHistory(view) {
  const d = await api(`/api/local/attendance?start=${window.__hs || ''}&end=${window.__he || ''}&q=${encodeURIComponent(window.__hq || '')}`);
  window.__rows = d.items;
  view.innerHTML = `<div class="card"><div class="row">
      <div><label>จากวันที่</label><input id="h_s" type="date" value="${d.start}" /></div>
      <div><label>ถึงวันที่</label><input id="h_e" type="date" value="${d.end}" /></div>
      <div><label>ค้นหาชื่อ / รหัส</label><input id="h_q" value="${esc(window.__hq || '')}" /></div>
      <button class="btn ghost" onclick="window.__hs=$('#h_s').value;window.__he=$('#h_e').value;window.__hq=$('#h_q').value;render()">ดูข้อมูล</button>
      <button class="btn ghost" onclick="csv()">ส่งออก CSV</button></div>
    <p class="sub">${d.items.length} รายการ</p>
    <table><thead><tr><th>เวลา</th><th>ชื่อ</th><th>รหัส</th><th>ชั้น</th><th>ทิศทาง</th><th>ตู้สแกน</th><th>สถานะ</th><th></th></tr></thead><tbody>
    ${d.items.map((r) => `<tr><td>${timeText(r.scanned_at)}</td><td>${esc(r.full_name || '-')}</td>
      <td>${esc(r.student_code || '')}</td><td>${esc(r.class_room || '')}</td>
      <td><span class="pill ${r.direction === 'out' ? 'bad' : 'good'}">${r.direction === 'out' ? 'ออก' : 'เข้า'}</span></td>
      <td>${esc(r.device_name || 'ตู้สแกนเครื่องแม่')}</td>
      <td>${esc(r.status)}</td>
      <td><button class="btn danger sm" onclick="delLog('${r.id}')">ลบ</button></td></tr>`).join('')}
    </tbody></table></div>`;
}
async function delLog(id) { await api('/api/local/attendance/' + id, { method: 'DELETE' }); render(); }
function csv() {
  const rows = window.__rows || [];
  const body = rows.map((r) => [timeText(r.scanned_at), r.full_name || '', r.student_code || '',
    r.class_room || '', r.direction === 'out' ? 'ออก' : 'เข้า', r.device_name || 'ตู้สแกนเครื่องแม่',
    r.status].join(',')).join('\n');
  const blob = new Blob(['\ufeff' + 'เวลา,ชื่อ,รหัส,ชั้น,ทิศทาง,ตู้สแกน,สถานะ\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'facegate-attendance.csv'; a.click();
}

/* ------------------------------------------------------------------ report */
async function renderReport(view) {
  const d = await api(`/api/local/report?start=${window.__rs || ''}&end=${window.__re || ''}`);
  view.innerHTML = `<div class="card"><div class="row noprint">
      <div><label>จากวันที่</label><input id="r_s" type="date" value="${d.start}" /></div>
      <div><label>ถึงวันที่</label><input id="r_e" type="date" value="${d.end}" /></div>
      <button class="btn ghost" onclick="window.__rs=$('#r_s').value;window.__re=$('#r_e').value;render()">สร้างรายงาน</button>
      <button class="btn ghost" onclick="window.print()">พิมพ์</button></div>
    <h3>สรุปรายวัน (รายชื่อทั้งหมด ${d.people} คน)</h3>
    <table><thead><tr><th>วันที่</th><th>มาแล้ว</th><th>มาสาย</th><th>ขาด</th></tr></thead><tbody>
      ${d.days.map((x) => `<tr><td>${x.date}</td><td>${x.present}</td><td>${x.late}</td><td>${x.absent}</td></tr>`).join('')
        || '<tr><td colspan="4">ไม่มีข้อมูลในช่วงนี้</td></tr>'}</tbody></table></div>
    <div class="card"><h3>อันดับมาสาย</h3>
    <table><thead><tr><th>ชื่อ</th><th>ชั้น</th><th>มาสาย (วัน)</th><th>มาเรียน (วัน)</th></tr></thead><tbody>
      ${d.top_late.map((p) => `<tr><td>${esc(p.name || '')}</td><td>${esc(p.class_room || '')}</td>
        <td>${p.late}</td><td>${p.present}</td></tr>`).join('') || '<tr><td colspan="4">ไม่มีคนมาสายในช่วงนี้</td></tr>'}
    </tbody></table></div>`;
}

async function renderClassReport(view) {
  const date = window.__crd || new Date().toISOString().slice(0, 10);
  const d = await api(`/api/local/report/class?date=${date}`);
  window.__classReport = d;
  const g = (x, k) => x[k] || 0;
  view.innerHTML = `<div class="card"><div class="row noprint">
    <div><label>วันที่รายงาน</label><input id="cr_date" type="date" value="${d.date}" /></div>
    <button class="btn ghost" onclick="window.__crd=$('#cr_date').value;render()">ดูรายงาน</button>
    <button class="btn ghost" onclick="classCsv()">ส่งออก CSV</button>
    <button class="btn ghost" onclick="window.print()">พิมพ์</button></div>
    <h2>${esc(d.school_name)} • รายงานการมาโรงเรียน</h2><p class="sub">ประจำวันที่ ${esc(d.date)} • รวม ${d.classes.length} ห้องเรียน</p>
    <div style="overflow:auto"><table><thead><tr><th rowspan="2">ชั้น</th><th colspan="3">นักเรียน</th><th colspan="3">มาเรียน</th><th colspan="3">สาย</th><th colspan="3">ขาด</th><th rowspan="2">% เข้าเรียน</th></tr>
    <tr><th>ช</th><th>ญ</th><th>รวม</th><th>ช</th><th>ญ</th><th>รวม</th><th>ช</th><th>ญ</th><th>รวม</th><th>ช</th><th>ญ</th><th>รวม</th></tr></thead><tbody>
    ${d.classes.map((x) => `<tr><td><b>${esc(x.class_room)}</b></td><td>${g(x.total,'male')}</td><td>${g(x.total,'female')}</td><td><b>${x.total.all}</b></td><td>${g(x.present,'male')}</td><td>${g(x.present,'female')}</td><td><b>${x.present.all}</b></td><td>${g(x.late,'male')}</td><td>${g(x.late,'female')}</td><td>${x.late.all}</td><td>${g(x.absent,'male')}</td><td>${g(x.absent,'female')}</td><td><b>${x.absent.all}</b></td><td><span class="pill ${x.rate >= 80 ? 'good' : 'bad'}">${x.rate}%</span></td></tr>`).join('')}
    <tr><td><b>รวมทั้งหมด</b></td><td>${g(d.totals.total,'male')}</td><td>${g(d.totals.total,'female')}</td><td><b>${d.totals.total.all}</b></td><td>${g(d.totals.present,'male')}</td><td>${g(d.totals.present,'female')}</td><td><b>${d.totals.present.all}</b></td><td>${g(d.totals.late,'male')}</td><td>${g(d.totals.late,'female')}</td><td>${d.totals.late.all}</td><td>${g(d.totals.absent,'male')}</td><td>${g(d.totals.absent,'female')}</td><td><b>${d.totals.absent.all}</b></td><td><b>${d.totals.rate}%</b></td></tr>
    </tbody></table></div>${d.totals.total.unspecified ? `<p class="sub">มีนักเรียนไม่ระบุเพศ ${d.totals.total.unspecified} คน (รวมอยู่ในยอดรวม)</p>` : ''}</div>
    <div class="card"><h3>รายชื่อนักเรียนที่ขาด <span class="pill bad">${d.absent_people.length} คน</span></h3>
      ${d.absent_people.length ? `<table><thead><tr><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ชั้น</th><th>เพศ</th></tr></thead><tbody>${d.absent_people.map((p) => `<tr><td>${esc(p.student_code)}</td><td>${esc(p.full_name)}</td><td>${esc(p.class_room)}</td><td>${p.gender === 'male' ? 'ชาย' : p.gender === 'female' ? 'หญิง' : 'ไม่ระบุ'}</td></tr>`).join('')}</tbody></table>` : '<p class="msg good">ไม่มีนักเรียนขาดในวันนี้</p>'}</div>`;
}
function classCsv() {
  const d = window.__classReport; if (!d) return;
  const lines = d.classes.map((x) => [x.class_room,x.total.all,x.present.all,x.late.all,x.absent.all,x.rate].join(','));
  const absent = d.absent_people.map((p) => [p.student_code,p.full_name,p.class_room,p.gender].join(','));
  const blob = new Blob(['\ufeffชั้น,นักเรียนทั้งหมด,มาเรียน,สาย,ขาด,% เข้าเรียน\n'+lines.join('\n')+'\n\nรายชื่อผู้ขาด\nรหัส,ชื่อ,ชั้น,เพศ\n'+absent.join('\n')], {type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`รายงานการมาโรงเรียน-${d.date}.csv`; a.click();
}

/* ------------------------------------------------------------- certificate */
async function renderCertificate(view) {
  const d = await api('/api/local/people');
  view.innerHTML = `<div class="card noprint"><div class="row">
      <div style="flex:1;min-width:220px"><label>ค้นหา / เลือกคน</label>
        <input id="c_q" placeholder="รหัส ชื่อ หรือชั้น" oninput="fillCert()" />
        <select id="c_person" size="6" style="margin-top:8px"></select></div>
      <div><label>จากวันที่</label><input id="c_s" type="date" /></div>
      <div><label>ถึงวันที่</label><input id="c_e" type="date" /></div>
      <button class="btn" onclick="makeCert()">ออกใบรับรอง</button></div></div>
    <div id="c_out"></div>`;
  window.__cpeople = d.items;
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  $('#c_s').value = monthAgo; $('#c_e').value = today;
  fillCert();
}
function fillCert() {
  const q = ($('#c_q').value || '').toLowerCase();
  const rows = (window.__cpeople || []).filter((p) =>
    `${p.student_code} ${p.full_name} ${p.class_room || ''}`.toLowerCase().includes(q));
  $('#c_person').innerHTML = rows.map((p) =>
    `<option value="${p.id}">${esc(p.full_name)} • ${esc(p.student_code)} • ${esc(p.class_room || '-')}</option>`).join('');
}
async function makeCert() {
  const id = $('#c_person').value;
  if (!id) return;
  const d = await api(`/api/local/certificate?person_id=${id}&start=${$('#c_s').value}&end=${$('#c_e').value}`);
  $('#c_out').innerHTML = `<div class="card" style="text-align:center">
    <h2 style="margin:6px 0">${esc(d.content.certificate_title)}</h2>
    <p class="sub">${esc(d.content.report_title)} • ${d.start} ถึง ${d.end}</p>
    <h3 style="font-size:1.2rem">${esc(d.person.full_name)} (${esc(d.person.student_code)})</h3>
    <p>ระดับชั้น ${esc(d.person.class_room || '-')}</p>
    <div class="kpi" style="margin:18px 0">
      <div><b>${d.working_days}</b><span>วันทำการ</span></div>
      <div><b>${d.present}</b><span>มาเรียน</span></div>
      <div><b>${d.late}</b><span>มาสาย</span></div>
      <div><b>${d.absent}</b><span>ขาด</span></div>
      <div><b>${d.percent}%</b><span>คิดเป็นร้อยละ</span></div></div>
    <p class="sub">${esc(d.content.report_footer)}</p>
    <p style="margin-top:40px">..............................................<br />${esc(d.content.signer_line)}</p>
    <p class="noprint"><button class="btn ghost" onclick="window.print()">พิมพ์ใบรับรอง</button></p></div>`;
}

/* ---------------------------------------------------------------- visitors */
async function renderVisitors(view) {
  const d = await api('/api/local/visitors');
  const shots = (rows) => rows.map((r) => `<figure><img src="${r.snapshot_url || ''}" alt="" />
    <figcaption class="sub">${new Date(r.created_at).toLocaleString('th-TH')}<br />${esc(r.kind || r.direction || '')}</figcaption></figure>`).join('')
    || '<p class="sub">ยังไม่มีข้อมูล</p>';
  view.innerHTML = `<div class="card"><h3>ผู้มาติดต่อ (ไม่ได้ลงทะเบียน)</h3><div class="faces">${shots(d.visitors)}</div></div>
    <div class="card"><h3>การแจ้งเตือนความปลอดภัย</h3><div class="faces">${shots(d.alerts)}</div></div>`;
}

/* ----------------------------------------------------------------- content */
const CONTENT_TEXT = [
  ['brand_name', 'ชื่อระบบที่แสดง'], ['kiosk_title', 'หัวข้อหน้าตู้สแกน'],
  ['kiosk_subtitle', 'ข้อความแนะนำใต้ชื่อ'], ['kiosk_footer', 'ข้อความท้ายหน้าจอ'],
  ['report_title', 'ชื่อรายงาน'], ['report_footer', 'ข้อความท้ายรายงาน'],
  ['signer_line', 'ช่องลงชื่อผู้รับรอง'], ['certificate_title', 'ชื่อใบรับรอง'],
];
async function renderContent(view) {
  const [{ content }, { settings }] = await Promise.all([api('/api/local/content'), api('/api/local/settings')]);
  view.innerHTML = `<div class="card"><h3>ชื่อโรงเรียนและโลโก้</h3><div class="grid2">
      <div><label>ชื่อโรงเรียน (แสดงบนหน้าจอและรายงาน)</label>
        <input id="k_school" value="${esc(settings.school_name || '')}" /></div>
      <div><label>โลโก้ (ไฟล์รูป)</label><input id="k_logo" type="file" accept="image/*" /></div>
      <div>${content.logo_url ? `<img src="${content.logo_url}" style="height:56px" alt="" />` : '<span class="sub">ยังไม่มีโลโก้</span>'}</div>
    </div></div>
    <div class="card"><h3>ข้อความบนหน้าจอและรายงาน</h3><div class="grid2">
      ${CONTENT_TEXT.map(([k, l]) => `<div><label>${l}</label><input id="k_${k}" value="${esc(content[k] || '')}" /></div>`).join('')}
    </div></div>
    <div class="card"><h3>สีของระบบ</h3><div class="grid2">
      <div><label>สีหลัก</label><input id="k_theme_primary" type="color" value="${content.theme_primary}" /></div>
      <div><label>สีรอง</label><input id="k_theme_accent" type="color" value="${content.theme_accent}" /></div>
      <div><label>สีตัวอักษร</label><input id="k_theme_ink" type="color" value="${content.theme_ink}" /></div>
    </div>
    <p><button class="btn" onclick="saveContent()">บันทึกเนื้อหาและธีม</button></p><div id="k_msg"></div></div>`;
}
async function saveContent() {
  const patch = {};
  CONTENT_TEXT.forEach(([k]) => { patch[k] = $('#k_' + k).value; });
  ['theme_primary', 'theme_accent', 'theme_ink'].forEach((k) => { patch[k] = $('#k_' + k).value; });
  const file = $('#k_logo').files[0];
  if (file) {
    patch.logo_image = await new Promise((done) => {
      const reader = new FileReader();
      reader.onload = () => done(String(reader.result));
      reader.readAsDataURL(file);
    });
  }
  await api('/api/local/content', { method: 'POST', body: JSON.stringify(patch) });
  await api('/api/local/settings', { method: 'POST', body: JSON.stringify({ school_name: $('#k_school').value }) });
  const box = $('#k_msg'); box.className = 'msg good'; box.textContent = 'บันทึกแล้ว หน้าตู้สแกนจะเปลี่ยนตามภายใน 2 นาที';
  loadBrand();
}

/* ---------------------------------------------------------------- settings */
const FIELDS = [
  ['checkin_start', 'เริ่มสแกนเข้า', 'time'], ['checkin_end', 'ปิดสแกนเข้า', 'time'],
  ['checkout_start', 'เริ่มสแกนออก', 'time'], ['checkout_end', 'ปิดสแกนออก', 'time'],
  ['late_after', 'ถือว่าสายหลังเวลา', 'time'], ['late_grace_minutes', 'ผ่อนผัน (นาที)', 'number'],
  ['early_leave_before', 'ออกก่อนเวลา ก่อน', 'time'], ['work_days', 'วันทำการ (0=อาทิตย์)', 'text'],
  ['match_threshold', 'ความเข้มงวดการจำหน้า (0.3–0.6)', 'number'],
  ['geometry_min_score', 'ความเข้มงวดสัดส่วนใบหน้า', 'number'],
  ['duplicate_cooldown_minutes', 'กันสแกนซ้ำ (นาที)', 'number'],
  ['next_person_delay_seconds', 'เว้นก่อนคนถัดไป (วินาที)', 'number'],
  ['kiosk_recent_limit', 'จำนวนรายการล่าสุดบนจอ', 'number'],
  ['kiosk_news_text', 'ข้อความข่าววิ่ง', 'text'],
  ['voice_template', 'ข้อความเสียงเมื่อสแกนผ่าน', 'text'],
  ['voice_late_suffix', 'ต่อท้ายเสียงเมื่อมาสาย', 'text'],
  ['voice_denied_text', 'ข้อความเสียงเมื่อไม่ผ่าน', 'text'],
  ['snapshot_retention_days', 'เก็บรูปการสแกน (วัน)', 'number'],
  ['retention_days', 'เก็บประวัติการสแกน (วัน)', 'number'],
  ['door_open_seconds', 'ยกไม้กั้นค้าง (วินาที)', 'number'],
  ['door_angle_down', 'องศาตอนลง', 'number'], ['door_angle_up', 'องศาตอนขึ้น', 'number'],
  ['door_move_step', 'ขยับทีละกี่องศา', 'number'], ['door_move_delay_ms', 'หน่วงระหว่างจังหวะ (ms)', 'number'],
  ['screen_idle_minutes', 'พักหน้าจอเมื่อไม่ใช้งาน (นาที)', 'number'],
  ['auto_power_off_time', 'เวลาปิดเครื่องอัตโนมัติ', 'time'],
];
const FLAGS = [
  ['block_non_work_days', 'ปิดรับสแกนวันหยุด'], ['require_liveness', 'ตรวจว่าเป็นคนจริง'],
  ['save_snapshots', 'เก็บภาพตอนสแกน'], ['auto_enroll', 'เรียนรู้ใบหน้าเพิ่มอัตโนมัติ'],
  ['visitor_mode', 'บันทึกภาพผู้ไม่ลงทะเบียน'],
  ['kiosk_show_recent', 'แสดงรายการล่าสุด'], ['kiosk_mirror', 'กลับภาพกล้องเหมือนกระจก'],
  ['kiosk_show_clock', 'แสดงเวลา'], ['kiosk_news_enabled', 'เปิดข้อความข่าววิ่ง'],
  ['voice_enabled', 'เปิดเสียงพูด'], ['door_enabled', 'เปิดใช้ประตูอัจฉริยะ'],
  ['door_hold_power', 'จ่ายไฟเซอร์โวค้างไว้'], ['door_invert_servo', 'สลับทิศการหมุน'],
  ['door_buzzer_enabled', 'เสียงเตือนที่ประตู'], ['door_use_relay', 'ใช้กลอนไฟฟ้า (รีเลย์)'],
  ['power_saving_enabled', 'เปิดโหมดประหยัดพลังงาน'],
  ['auto_power_off_enabled', 'ปิดเครื่องอัตโนมัติตามเวลา'],
  ['power_off_workdays_only', 'ปิดเครื่องอัตโนมัติเฉพาะวันทำการ'],
];
async function renderSettings(view) {
  const { settings: s } = await api('/api/local/settings');
  view.innerHTML = `<div class="card"><h3>เวลา การจำใบหน้า และหน้าจอ</h3><div class="grid2">
      ${FIELDS.map(([k, l, t]) => `<div><label>${l}</label>
        <input id="s_${k}" type="${t}" ${t === 'number' ? 'step="any"' : ''} value="${esc(s[k] ?? '')}" /></div>`).join('')}
      <div><label>ภาพพักหน้าจอ</label><select id="s_screensaver_mode">
        <option value="stats"${s.screensaver_mode === 'stats' ? ' selected' : ''}>แสดงสถิติวันนี้</option>
        <option value="black"${s.screensaver_mode === 'black' ? ' selected' : ''}>จอดำ</option></select></div>
      <div><label>คำสั่งเมื่อปิดเครื่องอัตโนมัติ</label><select id="s_auto_power_off_action">
        <option value="shutdown"${s.auto_power_off_action === 'shutdown' ? ' selected' : ''}>ปิดเครื่อง</option>
        <option value="sleep"${s.auto_power_off_action === 'sleep' ? ' selected' : ''}>พักเครื่อง</option>
        <option value="screen_off"${s.auto_power_off_action === 'screen_off' ? ' selected' : ''}>ปิดแค่หน้าจอ</option></select></div>
    </div>
    <p>${FLAGS.map(([k, l]) => `<label style="display:inline-flex;gap:6px;align-items:center;margin:6px 18px 6px 0;font-weight:600">
      <input id="s_${k}" type="checkbox" style="width:auto" ${s[k] ? 'checked' : ''} /> ${l}</label>`).join('')}</p>
    <p><button class="btn" onclick="saveSettings()">บันทึกการตั้งค่า</button>
       <button class="btn ghost" onclick="testVoice()">ทดสอบเสียงพูด</button>
       <button class="btn ghost" onclick="changePw()">เปลี่ยนรหัสผู้ดูแล</button></p>
    <div id="s_msg"></div></div>`;
}
async function testVoice() {
  const box = $('#s_msg'); box.className = 'msg'; box.textContent = 'กำลังทดสอบเสียง…';
  const text = 'ทดสอบเสียง สแกนสำเร็จ ยินดีต้อนรับ';
  const voices = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  const thai = voices.find((v) => (v.lang || '').toLowerCase().startsWith('th'));
  if (thai) {
    const u = new SpeechSynthesisUtterance(text); u.voice = thai; u.lang = 'th-TH';
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    box.className = 'msg good'; box.textContent = 'ใช้เสียงในเครื่อง (' + thai.name + ') เรียบร้อย';
    return;
  }
  try {
    const res = await fetch('/local/api/public/kiosk/tts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('no engine');
    await new Audio(URL.createObjectURL(await res.blob())).play();
    box.className = 'msg good'; box.textContent = 'ระบบพูดเองได้ เสียงพร้อมใช้งาน';
  } catch (e) {
    box.className = 'msg bad';
    box.textContent = 'ยังไม่มีเสียงพูดในเครื่องนี้ กรุณาติดตั้งเสียงไทย (Windows: ตั้งค่า > เวลาและภาษา > ภาษา > ไทย > ตัวเลือก > เสียงพูด) แล้วทดสอบอีกครั้ง';
  }
}

async function saveSettings() {
  const patch = {};
  FIELDS.forEach(([k, , t]) => {
    const v = $('#s_' + k).value;
    patch[k] = t === 'number' ? (v === '' ? null : Number(v)) : (v === '' ? null : v);
  });
  FLAGS.forEach(([k]) => { patch[k] = $('#s_' + k).checked; });
  patch.screensaver_mode = $('#s_screensaver_mode').value;
  patch.auto_power_off_action = $('#s_auto_power_off_action').value;
  await api('/api/local/settings', { method: 'POST', body: JSON.stringify(patch) });
  const box = $('#s_msg'); box.className = 'msg good';
  box.textContent = 'บันทึกแล้ว ตู้สแกนจะใช้ค่าใหม่ภายใน 30 วินาที';
}
async function changePw() {
  const password = prompt('รหัสผู้ดูแลใหม่ (อย่างน้อย 6 ตัวอักษร)');
  if (!password) return;
  await api('/api/local/auth/password', { method: 'POST', body: JSON.stringify({ password }) });
  alert('เปลี่ยนรหัสแล้ว');
}

/* ------------------------------------------------------------------ device */
async function renderDevice(view) {
  view.innerHTML = `<div class="card"><h3>ประตูอัจฉริยะ (micro:bit)</h3>
      <p><button class="btn" onclick="door('open')">ทดลองยกขึ้น</button>
         <button class="btn ghost" onclick="door('close')">ลดลง</button>
         <button class="btn ghost" onclick="door('deny')">เสียงปฏิเสธ</button></p>
      <p class="sub">ต่อ micro:bit เข้าพอร์ต USB ของเครื่องนี้ • P2 → สัญญาณเซอร์โว • P1 → ลำโพง • P0 → รีเลย์<br />
      จ่ายไฟ 5V แยกให้เซอร์โว และต่อ GND ร่วมกับ micro:bit เพื่อให้ยกได้นิ่ง</p>
      <p class="sub">ปรับองศาและความเร็วได้ที่ “ตั้งค่าระบบ”</p></div>
    <div class="card"><h3>สั่งงานเครื่องนี้</h3>
      <p><button class="btn ghost" onclick="power('screen_off')">ปิดหน้าจอ</button>
         <button class="btn ghost" onclick="power('screen_on')">เปิดหน้าจอ</button>
         <button class="btn ghost" onclick="power('sleep')">พักเครื่อง</button>
         <button class="btn danger" onclick="power('shutdown')">ปิดเครื่อง</button>
         <button class="btn ghost" onclick="power('cancel')">ยกเลิกคำสั่ง</button></p>
      <p class="sub">โหมดจบในเครื่องสั่งงานได้จากเครื่องนี้เท่านั้น (ไม่มีการสั่งงานผ่านอินเทอร์เน็ต)</p></div>`;
}
async function door(action, device_id) { await api('/api/local/door/command', { method: 'POST', body: JSON.stringify({ action, device_id: device_id || 'local' }) }); alert('ส่งคำสั่งแล้ว'); }
async function power(action, device_id) { await api('/api/local/power/command', { method: 'POST', body: JSON.stringify({ action, device_id: device_id || 'local' }) }); alert('ส่งคำสั่งแล้ว'); }

/* ----------------------------------------------------------- LAN kiosks */
const DIRECTION_LABEL = { in: 'เข้าเท่านั้น', out: 'ออกเท่านั้น', auto: 'อัตโนมัติตามเวลา' };
async function renderDevices(view) {
  const d = await api('/api/local/devices');
  const address = (d.addresses || [])[0] || `http://<ไอพีเครื่องนี้>:${d.lan_port}`;
  view.innerHTML = `<div class="card"><h3>เปิดให้ตู้สแกนอื่นเชื่อมต่อ</h3>
      <p><label><input id="d_lan" type="checkbox" ${d.lan_enabled ? 'checked' : ''} />
        เปิดโหมดวง LAN (เครื่องนี้เป็นเครื่องแม่เก็บข้อมูลทั้งหมด)</label></p>
      <div class="row"><div><label>พอร์ต</label><input id="d_port" type="number" value="${d.lan_port}" /></div>
        <button class="btn" onclick="saveLan()">บันทึก</button></div>
      <p class="sub">ที่อยู่ของเครื่องแม่: <b>${esc(address)}</b><br />
      หลังเปิดหรือปิดโหมดนี้ ต้องปิดและเปิดโปรแกรมใหม่หนึ่งครั้ง<br />
      บนตู้สแกนลูก ให้กรอกที่อยู่นี้พร้อม “รหัสเชื่อมต่อ” ของตู้นั้น</p></div>

    <div class="card"><h3>เพิ่มตู้สแกน</h3>
      <div class="row"><div><label>ชื่อตู้</label><input id="d_name" placeholder="ประตูหน้า" /></div>
        <div><label>จุดติดตั้ง</label><input id="d_loc" placeholder="อาคาร 1" /></div>
        <div><label>ทิศทาง</label><select id="d_dir">
          <option value="auto">อัตโนมัติตามเวลา</option><option value="in">เข้าเท่านั้น</option>
          <option value="out">ออกเท่านั้น</option></select></div>
        <button class="btn" onclick="addDevice()">เพิ่มตู้สแกน</button></div></div>

    <div class="card"><h3>ตู้สแกนทั้งหมด</h3>
      <table><thead><tr><th>ชื่อ</th><th>จุดติดตั้ง</th><th>ทิศทาง</th><th>สถานะ</th>
        <th>สแกนล่าสุด</th><th>รหัสเชื่อมต่อ</th><th></th></tr></thead><tbody>
      <tr><td><b>${esc(d.hub.name)}</b></td><td>เครื่องนี้</td><td>อัตโนมัติตามเวลา</td>
        <td><span class="pill good">เครื่องแม่</span></td><td>-</td><td>-</td>
        <td><button class="btn ghost sm" onclick="door('open')">ทดสอบไม้กั้น</button></td></tr>
      ${(d.items || []).map((r) => `<tr>
        <td><b>${esc(r.name)}</b></td><td>${esc(r.location || '-')}</td>
        <td><select onchange="setDir('${r.id}', this.value)">
          ${['auto','in','out'].map((v) => `<option value="${v}" ${r.direction === v ? 'selected' : ''}>${DIRECTION_LABEL[v]}</option>`).join('')}
        </select></td>
        <td><span class="pill ${r.online ? 'good' : 'bad'}">${r.online ? 'ออนไลน์' : 'ออฟไลน์'}</span></td>
        <td>${r.last_scan_at ? timeText(r.last_scan_at) : '-'}</td>
        <td><code style="font-size:.78rem">${esc(r.device_key)}</code>
          <button class="btn ghost sm" onclick="copyKey('${esc(r.device_key)}')">คัดลอก</button>
          <button class="btn ghost sm" onclick="newKey('${r.id}')">ออกรหัสใหม่</button></td>
        <td><button class="btn ghost sm" onclick="door('open','${r.id}')">ทดสอบไม้กั้น</button>
          <button class="btn ghost sm" onclick="power('screen_off','${r.id}')">ปิดหน้าจอ</button>
          <button class="btn danger sm" onclick="delDevice('${r.id}')">ลบ</button></td></tr>`).join('')}
      </tbody></table>
      ${(d.items || []).length ? '' : '<p class="sub">ยังไม่มีตู้สแกนลูก</p>'}</div>

    <div class="card"><h3>วิธีตั้งค่าตู้สแกนลูก</h3>
      <p class="sub">1) ติดตั้งชุดโปรแกรม FaceGate ตัวเดียวกันบนเครื่องลูก<br />
      2) เปิดโปรแกรม แล้วเลือกโหมด “ตู้สแกนลูก”<br />
      3) กรอกที่อยู่เครื่องแม่ <b>${esc(address)}</b> และรหัสเชื่อมต่อของตู้นั้น<br />
      4) ประวัติทั้งหมดจะรวมอยู่ที่เครื่องแม่ และกันสแกนซ้ำข้ามตู้ให้อัตโนมัติ</p></div>`;
}
async function saveLan() {
  await api('/api/local/settings', { method: 'POST', body: JSON.stringify({
    lan_enabled: $('#d_lan').checked, lan_port: Number($('#d_port').value) || 8899 }) });
  alert('บันทึกแล้ว — ปิดและเปิดโปรแกรมอีกครั้งเพื่อเริ่มใช้งาน');
  render();
}
async function addDevice() {
  const name = $('#d_name').value.trim();
  if (!name) return alert('กรุณาตั้งชื่อตู้สแกน');
  await api('/api/local/devices', { method: 'POST', body: JSON.stringify({
    name, location: $('#d_loc').value.trim(), direction: $('#d_dir').value }) });
  render();
}
async function setDir(id, direction) {
  await api('/api/local/devices', { method: 'POST', body: JSON.stringify({ id, direction }) });
  render();
}
async function newKey(id) {
  if (!confirm('ออกรหัสใหม่? ตู้เดิมจะเชื่อมต่อไม่ได้จนกรอกรหัสใหม่')) return;
  await api(`/api/local/devices/${id}/key`, { method: 'POST' });
  render();
}
async function delDevice(id) {
  if (!confirm('ลบตู้สแกนนี้ออกจากระบบ?')) return;
  await api('/api/local/devices/' + id, { method: 'DELETE' });
  render();
}
function copyKey(key) { navigator.clipboard.writeText(key); alert('คัดลอกรหัสแล้ว'); }

/* ------------------------------------------------------------------ health */
async function renderHealth(view) {
  const [d, agent] = await Promise.all([
    api('/api/local/overview'),
    fetch('/health').then((r) => r.json()).catch(() => null)]);
  view.innerHTML = `<div class="card"><h3>สถานะโปรแกรม</h3><div class="kpi">
      <div><b>${agent ? agent.known_faces : '-'}</b><span>ใบหน้าที่โหลดไว้</span></div>
      <div><b>${agent ? agent.students : '-'}</b><span>รายชื่อในหน่วยความจำ</span></div>
      <div><b>${agent && agent.engine_ready ? 'พร้อม' : 'กำลังโหลด'}</b><span>ตัวจำใบหน้า</span></div>
      <div><b>${(d.disk_free_mb / 1024).toFixed(1)}</b><span>พื้นที่ว่าง (GB)</span></div>
      <div><b>${d.db_size_mb}</b><span>ขนาดข้อมูล (MB)</span></div></div>
      <p class="sub">${agent && agent.door ? 'ประตู: ' + esc(JSON.stringify(agent.door)) : ''}</p></div>
    <div class="card"><h3>ล้างข้อมูลเก่า</h3>
      <p class="sub">ลบรูปการสแกนและประวัติที่เกินจำนวนวันที่ตั้งไว้ในหน้าตั้งค่าระบบ</p>
      <p><button class="btn ghost" onclick="runCleanup()">ล้างข้อมูลเก่าเดี๋ยวนี้</button></p>
      <div id="cl_msg"></div></div>`;
}
async function runCleanup() {
  const r = await api('/api/local/cleanup', { method: 'POST' });
  const box = $('#cl_msg'); box.className = 'msg good';
  box.textContent = `ลบรูป ${r.removed_photos} ไฟล์ และประวัติ ${r.removed_logs} รายการ`;
}

/* ------------------------------------------------------------------ backup */
async function renderBackup(view) {
  view.innerHTML = `<div class="card"><h3>สำรองข้อมูล</h3>
      <p class="sub">ไฟล์สำรองรวมรายชื่อ ใบหน้า ประวัติการสแกน เนื้อหา และการตั้งค่าทั้งหมดของเครื่องนี้</p>
      <p><button class="btn" onclick="downloadBackup()">ดาวน์โหลดไฟล์สำรอง</button></p></div>
    <div class="card"><h3>กู้คืนข้อมูล / ย้ายเครื่อง</h3>
      <p class="sub">ติดตั้งโปรแกรมบนเครื่องใหม่ แล้วเลือกไฟล์สำรอง (.zip) ที่นี่ ข้อมูลจะกลับมาทั้งหมด</p>
      <input type="file" accept=".zip" onchange="restore(this)" /><div id="b_msg"></div></div>`;
}
function downloadBackup() { location.href = '/local/api/local/backup?token=' + encodeURIComponent(TOKEN); }
async function restore(input) {
  const file = input.files[0]; if (!file) return;
  if (!confirm('กู้คืนจะเขียนทับข้อมูลปัจจุบัน ต้องการทำต่อ?')) return;
  const res = await fetch('/local/api/local/restore', { method: 'POST', headers: { 'x-local-token': TOKEN }, body: file });
  const data = await res.json().catch(() => ({}));
  const box = $('#b_msg');
  box.className = 'msg ' + (res.ok ? 'good' : 'bad');
  box.textContent = res.ok ? 'กู้คืนแล้ว กรุณาปิดและเปิดโปรแกรมใหม่' : (data.detail || 'กู้คืนไม่สำเร็จ');
}

/* ------------------------------------------------------------------- audit */
async function renderAudit(view) {
  const d = await api('/api/local/audit');
  view.innerHTML = `<div class="card"><table><thead><tr><th>เวลา</th><th>การกระทำ</th><th>รายละเอียด</th></tr></thead><tbody>
    ${d.items.map((r) => `<tr><td>${timeText(r.created_at)}</td><td>${esc(r.action)}</td>
      <td>${esc(r.detail || r.target || '')}</td></tr>`).join('') || '<tr><td colspan="3">ยังไม่มีบันทึก</td></tr>'}
    </tbody></table></div>`;
}

boot();
</script>
</body>
</html>
"""
