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
  :root { --primary:#1d6fe0; --accent:#0ea5e9; --ink:#132a4f; }
  * { box-sizing:border-box; }
  html, body { height:100%; }
  body { margin:0; overflow:hidden; color:var(--ink);
    font-family:"IBM Plex Sans Thai","Noto Sans Thai","Segoe UI",system-ui,sans-serif;
    background:
      radial-gradient(1200px 600px at 8% -10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent),
      radial-gradient(900px 500px at 100% 0%, color-mix(in srgb, var(--primary) 18%, transparent), transparent),
      #f4f8fe; }
  .app { display:grid; grid-template-columns:1fr 360px; gap:18px; height:100vh; padding:18px; }
  .panel { background:rgba(255,255,255,.86); backdrop-filter:blur(8px);
    border:1px solid #dbe6fa; border-radius:26px; box-shadow:0 24px 60px rgba(15,50,120,.13); }
  .stage { position:relative; overflow:hidden; display:grid; place-items:center; background:#08101f; }
  video { width:100%; height:100%; object-fit:cover; }
  .mirror video { transform:scaleX(-1); }
  .guide { position:absolute; width:min(48vh,62%); aspect-ratio:.82; border:4px solid rgba(255,255,255,.9);
    border-radius:50%; box-shadow:0 0 0 9999px rgba(6,14,32,.5), 0 0 40px rgba(120,190,255,.5); }
  .head { position:absolute; top:0; left:0; right:0; display:flex; align-items:center; gap:12px;
    padding:16px 22px; color:#fff; background:linear-gradient(180deg, rgba(6,14,32,.62), transparent); }
  .head img { width:42px; height:42px; border-radius:12px; object-fit:contain; background:#fff; }
  .head b { font-size:1.15rem; } .head span { opacity:.85; font-size:.85rem; display:block; }
  .banner { position:absolute; bottom:26px; left:50%; transform:translateX(-50%); min-width:64%;
    text-align:center; padding:16px 30px; border-radius:20px; font-size:1.35rem; font-weight:700;
    background:rgba(255,255,255,.95); box-shadow:0 18px 44px rgba(4,14,40,.4); transition:.2s; }
  .banner.ok { background:#dcfce7; color:#14532d; } .banner.bad { background:#fee2e2; color:#7f1d1d; }
  .side { display:flex; flex-direction:column; gap:14px; padding:18px; overflow:hidden; }
  .clock { font-size:2.8rem; font-weight:800; line-height:1; letter-spacing:.5px; }
  .date { color:#64748b; font-weight:600; font-size:.9rem; }
  .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .stats div { background:#f2f7ff; border:1px solid #e0eaff; border-radius:14px; padding:10px; text-align:center; }
  .stats b { display:block; font-size:1.45rem; color:var(--primary); }
  .stats span { font-size:.72rem; color:#64748b; }
  .title { font-weight:800; font-size:.98rem; display:flex; align-items:center; gap:8px; }
  .title i { width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 0 4px #dcfce7; }
  .list { flex:1; overflow:hidden auto; display:flex; flex-direction:column; gap:8px; padding-right:4px; }
  .item { display:flex; gap:10px; align-items:center; background:#fff; border:1px solid #e6ecfa;
    border-radius:16px; padding:8px 10px; box-shadow:0 6px 16px rgba(20,60,140,.06); }
  .item img { width:46px; height:46px; border-radius:12px; object-fit:cover; background:#e6ecfa; }
  .item b { display:block; font-size:.94rem; } .item span { font-size:.75rem; color:#64748b; }
  .tag { margin-left:auto; font-size:.7rem; font-weight:700; padding:4px 9px; border-radius:999px;
    background:#e0edff; color:#14428e; }
  .tag.out { background:#fef3c7; color:#92400e; }
  .news { overflow:hidden; white-space:nowrap; border-radius:14px; padding:9px 0; color:#fff;
    background:linear-gradient(90deg, var(--primary), var(--accent)); font-weight:600; }
  .news div { display:inline-block; animation:run 30s linear infinite; }
  @keyframes run { from { transform:translateX(0); } to { transform:translateX(-50%); } }
  .saver { position:fixed; inset:0; z-index:60; display:none; flex-direction:column; gap:26px;
    align-items:center; justify-content:center; color:#fff;
    background:radial-gradient(900px 500px at 50% 0%, #123a7a, #050b18); }
  .saver.show { display:flex; }
  .saver .grid { display:grid; grid-template-columns:repeat(4,minmax(150px,1fr)); gap:20px; text-align:center; }
  .saver .grid div { background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14);
    border-radius:22px; padding:26px; }
  .saver .grid b { display:block; font-size:3.2rem; }
  .adminBtn { position:fixed; top:16px; right:20px; z-index:70; border:0; cursor:pointer;
    background:rgba(255,255,255,.92); color:var(--ink); font-weight:700; padding:9px 16px;
    border-radius:999px; box-shadow:0 10px 24px rgba(10,30,80,.2); }
</style>
</head>
<body>
<button class="adminBtn" onclick="location.href='/admin'">หลังบ้าน (F9)</button>
<div class="app">
  <div class="panel stage" id="stage">
    <video id="cam" autoplay playsinline muted></video>
    <div class="guide"></div>
    <div class="head"><img id="logo" alt="" style="display:none" />
      <div><b id="school">FaceGate</b><span id="subtitle">กรุณามองกล้องในกรอบวงรี</span></div></div>
    <div class="banner" id="banner">กรุณามองกล้องในกรอบวงรี</div>
  </div>
  <div class="panel side">
    <div><div class="clock" id="clock">--:--</div><div class="date" id="date"></div></div>
    <div class="stats">
      <div><b id="sPresent">0</b><span>มาแล้ว</span></div>
      <div><b id="sLate">0</b><span>มาสาย</span></div>
      <div><b id="sAbsent">0</b><span>ขาด</span></div>
    </div>
    <div class="news" id="newsBox" style="display:none"><div id="news"></div></div>
    <div class="title"><i></i> สแกนล่าสุด (วันนี้)</div>
    <div class="list" id="list"></div>
  </div>
</div>
<div class="saver" id="saver" onclick="wake()">
  <div style="font-size:1.5rem;font-weight:700" id="saverTitle">สถิติวันนี้</div>
  <div class="grid">
    <div><b id="vPresent">0</b>มาแล้ว</div><div><b id="vLate">0</b>มาสาย</div>
    <div><b id="vAbsent">0</b>ขาด</div><div><b id="vLeft">0</b>กลับแล้ว</div>
  </div>
  <div style="opacity:.65">แตะหน้าจอเพื่อกลับสู่การสแกน</div>
</div>
<script>
const $ = (id) => document.getElementById(id);
let display = { mirror: true, voice_enabled: true, next_delay_seconds: 5 };
let busy = false, pausedUntil = 0;

async function startCamera() {
  try { $('cam').srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }); }
  catch (e) { say('ไม่พบกล้อง กรุณาตรวจสายกล้องแล้วเปิดโปรแกรมใหม่', 'bad'); }
}
var lastStatusText = '';
function say(text, kind) { const b = $('banner'); b.textContent = text; b.className = 'banner' + (kind ? ' ' + kind : ''); lastStatusText = text || ''; }
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
let previewDelay = 2000, previewSending = false;
async function sendPreview() {
  if (display.live_view === false || previewSending) return;
  const image = previewFrame(previewDelay < 500); if (!image) return;
  previewSending = true;
  try {
    const res = await fetch('/local/api/public/kiosk/live', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image, status: lastStatusText }),
    });
    const d = await res.json();
    previewDelay = Math.min(Math.max(Number(d.interval_ms) || 2000, 100), 5000);
  } catch (e) { previewDelay = 2000; }
  previewSending = false;
}
async function previewLoop() {
  for (;;) { await sendPreview(); await new Promise((r) => setTimeout(r, previewDelay)); }
}
previewLoop();

async function tick() {
  if (busy || Date.now() < pausedUntil) return;
  const image = frame(); if (!image) return;
  busy = true;
  try {
    const res = await fetch('/scan', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image }) });
    const d = await res.json();
    if (d.result === 'ok') {
      say(d.message, 'ok'); speak(d.speak); loadRecent(); loadStats();
      pausedUntil = Date.now() + (d.next_delay_seconds || 5) * 1000;
    } else if (d.result === 'duplicate' || d.result === 'denied') {
      say(d.message, 'bad'); speak(d.speak); pausedUntil = Date.now() + 3000;
    } else if (d.message && d.result !== 'no_face') { say(d.message); }
    else { say($('subtitle').textContent); }
  } catch (e) {}
  busy = false;
}
async function loadBrand() {
  try {
    const c = await (await fetch('/local/api/public/kiosk/content')).json();
    document.documentElement.style.setProperty('--primary', c.theme_primary || '#1d6fe0');
    document.documentElement.style.setProperty('--accent', c.theme_accent || '#0ea5e9');
    document.documentElement.style.setProperty('--ink', c.theme_ink || '#132a4f');
    $('school').textContent = c.school_name || c.brand_name || 'FaceGate';
    const sub = c.kiosk_subtitle || 'กรุณามองกล้องในกรอบวงรี';
    $('subtitle').textContent = c.device_name ? `${c.device_name} • ${sub}` : sub;
    $('saverTitle').textContent = (c.school_name || '') + ' — สถิติวันนี้';
    if (c.logo_url) { $('logo').src = c.logo_url; $('logo').style.display = 'block'; }
  } catch (e) {}
}
async function loadRecent() {
  try {
    const data = await (await fetch('/local/api/public/kiosk/recent')).json();
    display = data.display || display;
    $('stage').className = 'panel stage' + (display.mirror ? ' mirror' : '');
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
    $('sPresent').textContent = s.present; $('sLate').textContent = s.late; $('sAbsent').textContent = s.absent;
    $('vPresent').textContent = s.present; $('vLate').textContent = s.late;
    $('vAbsent').textContent = s.absent; $('vLeft').textContent = s.left;
    $('saver').className = 'saver' + (s.screensaver_mode === 'stats' && s.windows_closed ? ' show' : '');
  } catch (e) {}
}
function wake() { $('saver').className = 'saver'; }
function clock() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString('th-TH-u-ca-buddhist-nu-latn', { hour: '2-digit', minute: '2-digit' });
  $('date').textContent = now.toLocaleDateString('th-TH-u-ca-buddhist-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
loadBrand(); startCamera(); loadRecent(); loadStats(); clock();
setInterval(tick, 900); setInterval(loadRecent, 15000); setInterval(loadStats, 60000);
setInterval(clock, 5000); setInterval(loadBrand, 120000);
</script>
</body>
</html>
"""
