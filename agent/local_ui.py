"""
Offline kiosk screen for the standalone build.
Same look as the online kiosk page (white/blue, big camera, live list),
but served by the program itself so it works with no internet.
"""

from local_admin_ui import ADMIN_HTML  # re-exported for agent.py  # noqa: F401

KIOSK_HTML = r"""<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FaceGate — ตู้สแกนใบหน้า</title>
<style>
  :root { --primary:#123b67; --accent:#2f76b7; --ink:#17263a; --success:#15965f; --danger:#dc3545; --soft:#eef4fa; }
  * { box-sizing:border-box; }
  html, body { height:100%; }
  body { margin:0; overflow:hidden; color:var(--ink); font-family:"Figtree","Noto Sans Thai","Segoe UI",system-ui,sans-serif; background:#f8fafc; }
  button,input { font:inherit; }
  .top { height:82px; display:flex; align-items:center; justify-content:space-between; gap:18px; padding:12px 24px; background:#fff; border-bottom:1px solid #dce8f5; }
  .brand { display:flex; align-items:center; gap:12px; min-width:0; }
  .brand img,.brandMark { width:48px;height:48px;border-radius:12px;object-fit:contain;background:var(--primary);color:#fff;display:grid;place-items:center;font-size:22px; }
  .brand b { display:block;font-family:Outfit,"Noto Sans Thai",sans-serif;font-size:1.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
  .brand span { display:block;color:#64748b;font-size:.76rem; }
  .today { border:1px solid #dce8f5;background:#f6f9fc;border-radius:999px;padding:10px 20px;font-weight:700;white-space:nowrap; }
  .today b { color:var(--primary);font-size:1.12rem; }
  .timebox { display:flex;align-items:center;gap:12px;text-align:right; }
  .clock { font-family:Outfit,sans-serif;font-size:1.7rem;font-weight:800;line-height:1; }
  .date { color:#64748b;font-size:.7rem;font-weight:600;margin-top:4px; }
  .adminBtn { border:0;cursor:pointer;background:#eef4fa;color:var(--primary);font-weight:800;padding:10px 14px;border-radius:10px; }
  .app { display:grid;grid-template-columns:3fr 2fr;height:calc(100vh - 82px);min-height:0; }
  .stage { position:relative;overflow:hidden;background:#111c2c; }
  video { width:100%;height:100%;object-fit:cover; }
  .mirror video { transform:scaleX(-1); }
  .shade { position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,18,34,.42),transparent 42%,rgba(7,18,34,.48));pointer-events:none; }
  .live { position:absolute;top:20px;left:20px;display:flex;align-items:center;gap:8px;background:rgba(7,18,34,.72);color:#fff;border-radius:999px;padding:7px 12px;font-size:.72rem;font-weight:800; }
  .live i { width:8px;height:8px;border-radius:50%;background:#ef4444;animation:pulse 1.3s infinite; }
  .guide { position:absolute;left:50%;top:47%;transform:translate(-50%,-50%);width:min(38vh,44%);aspect-ratio:1;border:1px solid rgba(255,255,255,.15);border-radius:24px;color:#34d399; }
  .corner { position:absolute;width:46px;height:46px;filter:drop-shadow(0 0 7px currentColor); }
  .c1{left:-3px;top:-3px;border-left:4px solid;border-top:4px solid;border-radius:16px 0 0}.c2{right:-3px;top:-3px;border-right:4px solid;border-top:4px solid;border-radius:0 16px 0 0}.c3{left:-3px;bottom:-3px;border-left:4px solid;border-bottom:4px solid;border-radius:0 0 0 16px}.c4{right:-3px;bottom:-3px;border-right:4px solid;border-bottom:4px solid;border-radius:0 0 16px}
  .banner { position:absolute;bottom:22px;left:50%;transform:translateX(-50%);max-width:80%;text-align:center;padding:10px 18px;border-radius:12px;font-size:.95rem;font-weight:700;color:#fff;background:rgba(7,18,34,.75);border:1px solid rgba(255,255,255,.15);backdrop-filter:blur(8px); }
  .banner.ok { background:rgba(12,107,66,.88); }.banner.bad { background:rgba(145,26,38,.9); }
  .side { display:flex;flex-direction:column;min-height:0;padding:24px 28px;background:#fff;border-left:1px solid #dce8f5; }
  .welcome { display:flex;align-items:center;gap:12px;font-family:Outfit,"Noto Sans Thai",sans-serif;font-size:1.55rem;font-weight:800; }.welcome i{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:#e8f0f8;color:var(--primary);font-style:normal}.profile{display:none;flex:1;min-height:0;flex-direction:column;align-items:center;padding-top:20px}.profile.show{display:flex;animation:rise .35s ease-out}.profile .avatar{width:136px;height:136px;border:7px solid #fff;box-shadow:0 0 0 4px #dce8f5,0 18px 35px rgba(18,59,103,.2);border-radius:50%;object-fit:cover;background:#e8eef5}.profile h2{font-family:Outfit,"Noto Sans Thai",sans-serif;text-align:center;font-size:1.65rem;margin:18px 0 4px}.profile .role{color:var(--primary);font-weight:700}.facts{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;margin-top:20px}.fact{padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}.fact small{display:block;color:#64748b;font-weight:700}.fact b{display:block;margin-top:4px;font-size:1.1rem}.resultTime{width:100%;display:flex;justify-content:space-between;margin-top:auto;padding:14px;border-radius:12px;background:#eef4fa}.resultBar{width:100%;padding:16px;margin-top:12px;border-radius:14px;text-align:center;background:var(--success);color:#fff;font-size:1.15rem;font-weight:800}.resultBar.bad{background:var(--danger)}
  .waiting { flex:1;min-height:0;display:flex;flex-direction:column;margin-top:20px; }.ready{padding:18px;border-radius:16px;background:var(--primary);color:#fff}.ready h2{font-family:Outfit,"Noto Sans Thai",sans-serif;margin:4px 0;font-size:1.4rem}.ready p{margin:0;opacity:.8;font-size:.84rem}.listTitle{display:flex;justify-content:space-between;margin:18px 0 10px;font-weight:800}.list { min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px; }.item{display:flex;align-items:center;gap:10px;border:1px solid #e2e8f0;border-radius:12px;padding:8px}.item img{width:42px;height:42px;border-radius:9px;object-fit:cover;background:#e6edf5}.item div{min-width:0;flex:1}.item b,.item span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.item span{font-size:.72rem;color:#64748b}.tag{font-size:.7rem;font-weight:800;color:var(--primary)}
  .news{position:fixed;bottom:8px;left:20px;right:20px;z-index:10;overflow:hidden;white-space:nowrap;border-radius:10px;padding:8px;background:var(--primary);color:#fff;font-weight:700}.news div{display:inline-block;animation:run 30s linear infinite}@keyframes run{to{transform:translateX(-50%)}}@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@keyframes pulse{50%{opacity:.35}}
  .saver{position:fixed;inset:0;z-index:60;display:none;flex-direction:column;gap:26px;align-items:center;justify-content:center;color:#fff;background:#111c2c}.saver.show{display:flex}.saver .grid{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:18px}.saver .grid div{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:24px;text-align:center}.saver .grid b{display:block;font-size:3rem;color:#70dda7}
  @media(max-width:850px){.today{display:none}.top{padding:10px 14px}.app{grid-template-columns:1fr;height:calc(100vh - 82px);overflow:auto}.stage{min-height:55vh}.side{min-height:45vh}.brand span{display:none}}
  @media(prefers-reduced-motion:reduce){*{animation-duration:.001ms!important;transition-duration:.001ms!important}}
.visitorBox{margin-bottom:12px;padding:12px;border-radius:16px;border:2px solid rgba(37,99,235,.35);background:#fff;text-align:center;display:flex;flex-direction:column;gap:6px;align-items:center}
.visitorBox b{color:#1d4ed8;font-size:1rem}
.visitorBox small{color:#64748b;font-size:.78rem}
.visitorBox img{width:150px;height:150px;border-radius:12px;border:1px solid #e2e8f0;background:#fff;padding:6px}
</style>
</head>
<body>
<header class="top">
  <div class="brand"><div class="brandMark" id="logoFallback">✦</div><img id="logo" alt="" style="display:none"/><div><b id="school">FaceGate</b><span id="kioskTitle">ระบบสแกนใบหน้าเข้า-ออกโรงเรียน</span></div></div>
  <div class="today"><span id="todayLabel">วันนี้</span> · นักเรียน <b id="sStudents">0</b> คน · บุคลากร <b id="sStaff">0</b> คน</div>
  <div class="timebox"><div><div class="clock" id="clock">--:--:--</div><div class="date" id="date"></div></div><button class="adminBtn" onclick="location.href='/admin'">หลังบ้าน (F9)</button></div>
</header>
<div class="app">
  <div class="stage" id="stage"><video id="cam" autoplay playsinline muted></video><div class="shade"></div><div class="live"><i></i><span id="liveLabel">กล้องสด</span></div><div class="guide"><i class="corner c1"></i><i class="corner c2"></i><i class="corner c3"></i><i class="corner c4"></i></div><div class="banner" id="banner">กรุณามองกล้องในกรอบ</div>
  </div>
  <aside class="side"><div class="welcome"><i>✦</i><span id="welcome">ยินดีต้อนรับเข้าสู่โรงเรียนของเรา</span></div>
    <div class="profile" id="profile"><img class="avatar" id="profileAvatar" alt=""/><h2 id="profileName">—</h2><div class="role" id="profileRole">—</div><div class="facts"><div class="fact"><small id="classLabel">ชั้นเรียน</small><b id="profileClass">—</b></div><div class="fact"><small id="idLabel">รหัส</small><b id="profileId">—</b></div></div><div class="resultTime"><span id="timeLabel">เวลาเข้า-ออก</span><b id="scanTime">--:--:-- น.</b></div><div class="resultBar" id="resultBar">บันทึกสำเร็จ</div></div>
    <div class="visitorBox" id="visitorBox" style="display:none">
      <b>ผู้มาเยือน / บุคลากรภายนอก</b>
      <small>สแกน QR code นี้เพื่อลงทะเบียนเข้าโรงเรียน</small>
      <img id="visitorQr" alt="QR code ลงทะเบียนผู้มาเยือน"/>
      <small id="visitorUrl"></small>
      <small>วันนี้เข้าแล้ว <b id="visitorCount">0</b> คน</small>
    </div>
    <div class="waiting" id="waiting"><div class="ready"><small>FACEGATE READY</small><h2 id="subtitle">กรุณามองกล้องในกรอบ</h2><p id="readyDetail">ระบบพร้อมสำหรับการสแกน</p></div><div class="listTitle"><span>สแกนเข้าล่าสุด</span><small>วันนี้</small></div><div class="list" id="list"></div></div>
  </aside>
</div>
<div class="news" id="newsBox" style="display:none"><div id="news"></div></div>
<div class="saver" id="saver" onclick="wake()"><div style="font-size:1.5rem;font-weight:700" id="saverTitle">สถิติวันนี้</div><div class="grid"><div><b id="vPresent">0</b>มาแล้ว</div><div><b id="vLate">0</b><span id="saverLateLabel">มาสาย</span></div><div><b id="vAbsent">0</b><span id="saverAbsentLabel">ขาด</span></div><div><b id="vLeft">0</b><span id="saverLeftLabel">กลับแล้ว</span></div></div><div style="opacity:.65">แตะหน้าจอเพื่อกลับสู่การสแกน</div></div>
<script>
const $ = (id) => document.getElementById(id);
let display = { mirror: true, voice_enabled: true, next_delay_seconds: 5 };
let content = {};
let busy = false, pausedUntil = 0;

async function startCamera() {
  try { $('cam').srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }); }
  catch (e) { say('ไม่พบกล้อง กรุณาตรวจสายกล้องแล้วเปิดโปรแกรมใหม่', 'bad'); }
}
var lastStatusText = '';
function say(text, kind) { const b = $('banner'); b.textContent = text; b.className = 'banner' + (kind ? ' ' + kind : ''); lastStatusText = text || ''; }
function showResult(d, captured) {
  const student = d.student || {};
  const ok = d.result === 'ok';
  $('waiting').style.display = 'none'; $('profile').className = 'profile show';
  $('profileAvatar').src = d.avatar_url || d.snapshot_url || '';
  $('profileName').textContent = student.full_name || d.message || 'ไม่พบข้อมูล';
  $('profileRole').textContent = student.person_type === 'staff'
    ? ['บุคลากร', student.department, student.position].filter(Boolean).join(' • ')
    : ['นักเรียน', student.class_room ? 'ชั้น ' + student.class_room : ''].filter(Boolean).join(' • ');
  $('profileClass').textContent = student.class_room || student.department || '—';
  $('profileId').textContent = student.student_code || '—';
  $('scanTime').textContent = new Date().toLocaleTimeString('th-TH-u-ca-buddhist-nu-latn',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) + ' น.';
  $('resultBar').className = 'resultBar' + (ok ? '' : ' bad');
  $('resultBar').textContent = ok ? (content.kiosk_success_label || 'บันทึกสำเร็จ') : d.message;
  setTimeout(() => { $('profile').className = 'profile'; $('waiting').style.display = ''; }, (d.next_delay_seconds || 5) * 1000);
}
let audioReady = false, thaiVoice = null, browserVoiceOk = false;
const clipCache = new Map();

function unlockAudio() {
  if (audioReady) return;
  audioReady = true;
  try { new AudioContext().resume(); } catch (e) {}
  if (window.speechSynthesis) speechSynthesis.resume();
}
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });

function pickVoice() {
  if (!window.speechSynthesis) return;
  const voices = speechSynthesis.getVoices() || [];
  thaiVoice = voices.find((v) => (v.lang || '').toLowerCase().startsWith('th')) || null;
  browserVoiceOk = !!thaiVoice;
}
if (window.speechSynthesis) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

function chime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = 880; gain.gain.value = 0.12;
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.18);
  } catch (e) {}
}

async function speakOnDevice(text) {
  try {
    let url = clipCache.get(text);
    if (!url) {
      const res = await fetch('/local/api/public/kiosk/tts', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return false;
      url = URL.createObjectURL(await res.blob());
      if (clipCache.size > 60) clipCache.clear();
      clipCache.set(text, url);
    }
    const audio = new Audio(url);
    audio.volume = Math.min(Math.max(Number(display.voice_volume || 1), 0), 1);
    audio.playbackRate = Math.min(Math.max(Number(display.voice_rate || 1), 0.5), 2);
    await audio.play();
    return true;
  } catch (e) { return false; }
}

async function speak(text) {
  if (!display.voice_enabled || !text) return;
  if (browserVoiceOk) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'th-TH'; u.voice = thaiVoice;
      u.rate = Number(display.voice_rate || 1); u.volume = Number(display.voice_volume || 1);
      speechSynthesis.cancel(); speechSynthesis.speak(u);
      return;
    } catch (e) {}
  }
  const played = await speakOnDevice(text);
  if (!played) chime();
}

function frame() {
  const v = $('cam'); if (!v.videoWidth) return null;
  const c = document.createElement('canvas');
  c.width = 640; c.height = Math.round(640 * v.videoHeight / v.videoWidth);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82).split(',')[1];
}
// Live view: a small preview frame for the admin page, sent from the kiosk so
// staff can watch the queue over the school LAN. No video is stored.
function previewFrame(wide) {
  const v = $('cam'); if (!v.videoWidth) return null;
  const w = wide ? 480 : 320;
  const c = document.createElement('canvas');
  c.width = w; c.height = Math.round(w * v.videoHeight / v.videoWidth);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', wide ? 0.6 : 0.5);
}
// While staff are watching the live page the server asks for many more frames
// per second, so the admin sees smooth motion instead of a slideshow.
let previewDelay = 2000, previewSending = false, previewOkAt = 0, previewLoops = 0;
async function sendPreview() {
  if (display.live_view === false || previewSending) return;
  previewSending = true;
  try {
    const v = $('cam');
    // A paused or stalled camera is the usual reason the picture freezes on the
    // admin screen, so nudge it back to life before grabbing the frame.
    if (v && v.paused) { try { await v.play(); } catch (e) {} }
    const image = previewFrame(previewDelay < 500);
    if (image) {
      const res = await fetch('/local/api/public/kiosk/live', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image, status: lastStatusText }),
      });
      const d = await res.json();
      previewDelay = Math.min(Math.max(Number(d.interval_ms) || 2000, 100), 5000);
      previewOkAt = Date.now();
    }
  } catch (e) { previewDelay = 2000; }
  previewSending = false;
}
async function previewLoop() {
  const mine = ++previewLoops;
  for (;;) {
    if (mine !== previewLoops) return;  // a newer loop took over
    await sendPreview();
    await new Promise((r) => setTimeout(r, previewDelay));
  }
}
previewLoop();
// Watchdog: if no frame reached the server for a while (stalled camera, a
// hung request, a browser that froze our timer) start the sender again so the
// admin page never sits on a frozen picture.
setInterval(() => {
  if (display.live_view === false) return;
  if (previewOkAt && Date.now() - previewOkAt < 12000) return;
  previewSending = false;
  previewDelay = 1000;
  previewLoop();
}, 8000);

async function tick() {
  if (busy || Date.now() < pausedUntil) return;
  const image = frame(); if (!image) return;
  busy = true;
  try {
    const res = await fetch('/scan', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image }) });
    const d = await res.json();
    // Any face at the screen counts as activity, so the stats board steps
    // aside and the camera keeps scanning without a manual touch.
    if (d.result !== 'no_face') bumpActivity();
    if (d.result === 'ok') {
      say(d.message, 'ok'); showResult(d, 'data:image/jpeg;base64,' + image); speak(d.speak); loadRecent(); loadStats();
      pausedUntil = Date.now() + (d.next_delay_seconds || 5) * 1000;
    } else if (d.result === 'duplicate' || d.result === 'denied') {
      say(d.message, 'bad'); showResult(d, 'data:image/jpeg;base64,' + image); speak(d.speak); pausedUntil = Date.now() + 3000;
    } else if (d.message && d.result !== 'no_face') { say(d.message); }
    else { say($('subtitle').textContent); }
  } catch (e) {}
  busy = false;
}
async function loadBrand() {
  try {
    const c = await (await fetch('/local/api/public/kiosk/content')).json(); content = c;
    document.documentElement.style.setProperty('--primary', c.theme_primary || '#1d6fe0');
    document.documentElement.style.setProperty('--accent', c.theme_accent || '#0ea5e9');
    document.documentElement.style.setProperty('--ink', c.theme_ink || '#132a4f');
    $('school').textContent = c.school_name || c.brand_name || 'FaceGate';
    $('kioskTitle').textContent = c.kiosk_title || 'ระบบสแกนใบหน้าเข้า-ออกโรงเรียน';
    const sub = c.kiosk_subtitle || 'กรุณามองกล้องในกรอบวงรี';
    $('subtitle').textContent = c.device_name ? `${c.device_name} • ${sub}` : sub;
    const school = c.school_name || c.brand_name || 'โรงเรียนของเรา';
    let welcome = c.kiosk_welcome || 'ยินดีต้อนรับเข้าสู่';
    if (welcome === 'ยินดีต้อนรับกลับโรงเรียน!' || welcome === 'ยินดีต้อนรับกลับโรงเรียน') welcome = 'ยินดีต้อนรับเข้าสู่';
    $('welcome').textContent = welcome.includes('{school}') ? welcome.replaceAll('{school}', school) : welcome + school;
    $('liveLabel').textContent = c.kiosk_live_label || 'กล้องสด';
    $('todayLabel').textContent = c.kiosk_today_label === 'เข้าเรียนวันนี้' ? 'วันนี้' : (c.kiosk_today_label || 'วันนี้');
    $('classLabel').textContent = c.kiosk_class_label || 'ชั้นเรียน'; $('idLabel').textContent = c.kiosk_id_label || 'รหัส'; $('timeLabel').textContent = c.kiosk_time_label || 'เวลาเข้า-ออก';
    $('saverTitle').textContent = (c.school_name || '') + ' — สถิติวันนี้';
    if (c.logo_url) { $('logo').src = c.logo_url; $('logo').style.display = 'block'; $('logoFallback').style.display = 'none'; }
  } catch (e) {}
}
async function loadRecent() {
  try {
    const data = await (await fetch('/local/api/public/kiosk/recent')).json();
    display = data.display || display;
    $('stage').className = 'stage' + (display.mirror ? ' mirror' : '');
    if (display.news_enabled && display.news_text) {
      $('newsBox').style.display = 'block';
      $('news').textContent = (display.news_text + '   •   ').repeat(8);
    } else { $('newsBox').style.display = 'none'; }
    $('list').innerHTML = (display.show_recent ? (data.items || []) : []).map((i) => `
      <div class="item"><img src="${i.snapshot_url || i.avatar_url || ''}" alt="" />
        <div><b>${i.name}</b><span>${i.detail || ''} • ${new Date(i.scanned_at).toLocaleTimeString('th-TH-u-ca-buddhist-nu-latn',{hour:'2-digit',minute:'2-digit'})}</span></div>
        <div class="tag ${i.direction === 'out' ? 'out' : ''}">${i.direction === 'out' ? 'ออก' : 'เข้า'}</div></div>`).join('')
      || '<div style="color:#94a3b8;font-size:.9rem">ยังไม่มีการสแกนวันนี้</div>';
  } catch (e) {}
}
async function loadStats() {
  try {
    const s = await (await fetch('/local/api/public/kiosk/today-stats')).json();
    $('sStudents').textContent = s.students_present || 0;
    $('sStaff').textContent = s.staff_present || 0;
    // Visitor QR code: only shown while the admin keeps the mode open.
    const vBox = $('visitorBox');
    if (s.visitor_register_enabled) {
      const url = location.origin + '/visit';
      $('visitorQr').src = '/local/api/public/visit/qr.svg';
      $('visitorUrl').textContent = url;
      $('visitorCount').textContent = s.visitors_present || 0;
      vBox.style.display = 'flex';
    } else {
      vBox.style.display = 'none';
    }
    $('vPresent').textContent = s.present; $('vLate').textContent = s.late;
    $('vAbsent').textContent = s.absent; $('vLeft').textContent = s.left;
    checkinOnly = !!s.checkin_only;
    idleMinutes = Number(s.idle_stats_minutes || 0);
    if (checkinOnly) {
      // Check-in only schools have no late count and no check-out count.
      $('saverLateLabel').textContent = 'ยังไม่มา';
      $('vLate').textContent = s.absent;
      $('saverAbsentLabel').textContent = 'ทั้งหมด';
      $('vAbsent').textContent = s.people;
      $('saverLeftLabel').textContent = 'วันทำการ';
      $('vLeft').textContent = s.is_workday ? 'เปิด' : 'ปิด';
    }
    statsMode = s.screensaver_mode === 'stats';
    windowsClosed = !!s.windows_closed;
    applySaver();
    // CCTV mode: the screen may rest, but the camera keeps watching and keeps
    // feeding the live page, so make sure the video never pauses.
    const v = $('cam');
    if (v && v.paused) { try { await v.play(); } catch (e) {} }
  } catch (e) {}
}
let statsMode = true, windowsClosed = false, checkinOnly = false, idleMinutes = 0;
let lastActivity = Date.now();
function bumpActivity() { lastActivity = Date.now(); applySaver(); }
function applySaver() {
  const idle = idleMinutes > 0 && Date.now() - lastActivity > idleMinutes * 60000;
  const show = statsMode && (windowsClosed || idle);
  $('saver').className = 'saver' + (show ? ' show' : '');
}
function wake() { lastActivity = Date.now(); $('saver').className = 'saver'; }
window.addEventListener('pointerdown', bumpActivity);
window.addEventListener('keydown', bumpActivity);
function clock() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString('th-TH-u-ca-buddhist-nu-latn', { hour: '2-digit', minute: '2-digit', second:'2-digit', hour12:false });
  $('date').textContent = now.toLocaleDateString('th-TH-u-ca-buddhist-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
loadBrand(); startCamera(); loadRecent(); loadStats(); clock();
setInterval(tick, 900); setInterval(loadRecent, 15000); setInterval(loadStats, 60000);
setInterval(applySaver, 5000);
setInterval(clock, 1000); setInterval(loadBrand, 120000);
</script>
</body>
</html>
"""


VISIT_HTML = r"""<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ลงทะเบียนผู้มาเยือน</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:"Noto Sans Thai",system-ui,sans-serif;background:#f1f5f9;color:#0f172a}
.wrap{max-width:520px;margin:0 auto;padding:18px}
h1{font-size:1.3rem;margin:.2rem 0}
p.lead{color:#64748b;font-size:.9rem;margin-top:0}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:16px;margin-bottom:14px}
label{display:block;font-size:.82rem;color:#475569;margin:10px 0 4px}
input,select,textarea{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:12px;font:inherit}
video,canvas,img#shot{width:100%;border-radius:14px;background:#0f172a;aspect-ratio:4/3;object-fit:cover}
button{width:100%;padding:13px;border:0;border-radius:14px;background:#1d4ed8;color:#fff;font:inherit;font-weight:700;margin-top:12px}
button.ghost{background:#e2e8f0;color:#0f172a}
.msg{margin-top:10px;font-size:.88rem}
.bad{color:#dc2626}
.ok{background:#dcfce7;border:1px solid #16a34a;border-radius:14px;padding:14px;text-align:center}
.code{font-size:1.6rem;font-weight:800;color:#15803d;letter-spacing:1px}
</style>
</head>
<body>
<div class="wrap">
  <h1 id="title">ลงทะเบียนเข้าโรงเรียน</h1>
  <p class="lead">สำหรับผู้มาเยือนและบุคลากรภายนอก ใช้ได้เฉพาะวันนี้</p>
  <div id="closed" class="card" style="display:none">ขณะนี้ยังไม่เปิดรับลงทะเบียนผู้มาเยือน กรุณาติดต่อเจ้าหน้าที่</div>
  <div id="done" class="card" style="display:none">
    <div class="ok"><div>ลงทะเบียนสำเร็จ</div><div class="code" id="doneCode"></div>
    <div id="doneName"></div><small>กรุณาไปสแกนใบหน้าที่ตู้สแกนหน้าโรงเรียน</small></div>
  </div>
  <form id="form" class="card" style="display:none" onsubmit="return submitForm(event)">
    <label>ชื่อ-นามสกุล *</label><input id="full_name" required maxlength="120"/>
    <label>เพศ</label>
    <select id="gender"><option value="">ไม่ระบุ</option><option value="male">ชาย</option><option value="female">หญิง</option></select>
    <label>สังกัด / อาชีพ</label><input id="affiliation" maxlength="120"/>
    <label>เหตุผลในการเข้าโรงเรียน</label><textarea id="reason" rows="2" maxlength="300"></textarea>
    <label>ภาพใบหน้า *</label>
    <video id="cam" autoplay playsinline muted></video>
    <img id="shot" style="display:none" alt="ภาพใบหน้าที่ถ่าย"/>
    <button type="button" class="ghost" id="shotBtn" onclick="takePhoto()">ถ่ายภาพใบหน้า</button>
    <button type="submit" id="send">ลงทะเบียน</button>
    <div class="msg bad" id="msg"></div>
  </form>
</div>
<canvas id="canvas" style="display:none"></canvas>
<script>
const $ = (id) => document.getElementById(id);
let photo = null;
async function boot() {
  try {
    const s = await (await fetch('/local/api/public/visit/status')).json();
    if (s.school_name) { $('title').textContent = 'ลงทะเบียนเข้า' + s.school_name; document.title = 'ลงทะเบียนผู้มาเยือน · ' + s.school_name; }
    if (!s.enabled) { $('closed').style.display = 'block'; return; }
  } catch (e) {}
  $('form').style.display = 'block';
  try { $('cam').srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } }); }
  catch (e) { $('msg').textContent = 'ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้อง'; }
}
function takePhoto() {
  const cam = $('cam'), c = $('canvas');
  c.width = cam.videoWidth || 640; c.height = cam.videoHeight || 480;
  c.getContext('2d').drawImage(cam, 0, 0, c.width, c.height);
  photo = c.toDataURL('image/jpeg', 0.9);
  $('shot').src = photo; $('shot').style.display = 'block'; $('cam').style.display = 'none';
  $('shotBtn').textContent = 'ถ่ายใหม่';
  $('cam').style.display = 'none';
}
async function submitForm(e) {
  e.preventDefault();
  $('msg').textContent = '';
  if (!photo) { $('msg').textContent = 'กรุณาถ่ายภาพใบหน้าก่อนลงทะเบียน'; return false; }
  $('send').disabled = true; $('send').textContent = 'กำลังลงทะเบียน…';
  try {
    const res = await fetch('/local/api/public/visit/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: $('full_name').value, gender: $('gender').value,
        affiliation: $('affiliation').value, reason: $('reason').value, photo,
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail || 'ลงทะเบียนไม่สำเร็จ');
    $('form').style.display = 'none';
    $('doneCode').textContent = d.code; $('doneName').textContent = d.full_name;
    $('done').style.display = 'block';
    const cam = $('cam');
    if (cam.srcObject) cam.srcObject.getTracks().forEach((t) => t.stop());
  } catch (err) {
    $('msg').textContent = err.message || 'ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่';
    $('send').disabled = false; $('send').textContent = 'ลงทะเบียน';
  }
  return false;
}
boot();
</script>
</body>
</html>
"""
