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
  .compare { display:none;position:absolute;right:20px;bottom:20px;width:min(430px,calc(100% - 40px));background:rgba(255,255,255,.96);border:1px solid rgba(255,255,255,.4);border-radius:22px;padding:18px;box-shadow:0 22px 54px rgba(5,18,40,.4); }
  .compare.show { display:block;animation:rise .3s ease-out; }.compare h3{text-align:center;margin:0 0 14px;font-family:Outfit,"Noto Sans Thai",sans-serif}.comparePics{display:grid;grid-template-columns:1fr 44px 1fr;align-items:center;gap:10px}.compare figure{margin:0;text-align:center}.compare img{width:100%;height:104px;object-fit:cover;border-radius:12px;background:#e6edf5}.compare figcaption{font-size:.7rem;color:#64748b;margin-top:5px}.verifyIcon{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--success);color:#fff;font-size:22px}.score{margin-top:12px;background:#f1f5f9;border-radius:12px;padding:10px}.scoreline{height:7px;border-radius:99px;background:#dce5ee;overflow:hidden;margin-top:7px}.scoreline i{display:block;height:100%;background:var(--success)}
  .side { display:flex;flex-direction:column;min-height:0;padding:24px 28px;background:#fff;border-left:1px solid #dce8f5; }
  .welcome { display:flex;align-items:center;gap:12px;font-family:Outfit,"Noto Sans Thai",sans-serif;font-size:1.55rem;font-weight:800; }.welcome i{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:#e8f0f8;color:var(--primary);font-style:normal}.profile{display:none;flex:1;min-height:0;flex-direction:column;align-items:center;padding-top:20px}.profile.show{display:flex;animation:rise .35s ease-out}.profile .avatar{width:136px;height:136px;border:7px solid #fff;box-shadow:0 0 0 4px #dce8f5,0 18px 35px rgba(18,59,103,.2);border-radius:50%;object-fit:cover;background:#e8eef5}.profile h2{font-family:Outfit,"Noto Sans Thai",sans-serif;text-align:center;font-size:1.65rem;margin:18px 0 4px}.profile .role{color:var(--primary);font-weight:700}.facts{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;margin-top:20px}.fact{padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}.fact small{display:block;color:#64748b;font-weight:700}.fact b{display:block;margin-top:4px;font-size:1.1rem}.resultTime{width:100%;display:flex;justify-content:space-between;margin-top:auto;padding:14px;border-radius:12px;background:#eef4fa}.resultBar{width:100%;padding:16px;margin-top:12px;border-radius:14px;text-align:center;background:var(--success);color:#fff;font-size:1.15rem;font-weight:800}.resultBar.bad{background:var(--danger)}
  .waiting { flex:1;min-height:0;display:flex;flex-direction:column;margin-top:20px; }.ready{padding:18px;border-radius:16px;background:var(--primary);color:#fff}.ready h2{font-family:Outfit,"Noto Sans Thai",sans-serif;margin:4px 0;font-size:1.4rem}.ready p{margin:0;opacity:.8;font-size:.84rem}.listTitle{display:flex;justify-content:space-between;margin:18px 0 10px;font-weight:800}.list { min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px; }.item{display:flex;align-items:center;gap:10px;border:1px solid #e2e8f0;border-radius:12px;padding:8px}.item img{width:42px;height:42px;border-radius:9px;object-fit:cover;background:#e6edf5}.item div{min-width:0;flex:1}.item b,.item span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.item span{font-size:.72rem;color:#64748b}.tag{font-size:.7rem;font-weight:800;color:var(--primary)}
  .news{position:fixed;bottom:8px;left:20px;right:20px;z-index:10;overflow:hidden;white-space:nowrap;border-radius:10px;padding:8px;background:var(--primary);color:#fff;font-weight:700}.news div{display:inline-block;animation:run 30s linear infinite}@keyframes run{to{transform:translateX(-50%)}}@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@keyframes pulse{50%{opacity:.35}}
  .saver{position:fixed;inset:0;z-index:60;display:none;flex-direction:column;gap:26px;align-items:center;justify-content:center;color:#fff;background:#111c2c}.saver.show{display:flex}.saver .grid{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:18px}.saver .grid div{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:24px;text-align:center}.saver .grid b{display:block;font-size:3rem;color:#70dda7}
  @media(max-width:850px){.today{display:none}.top{padding:10px 14px}.app{grid-template-columns:1fr;height:calc(100vh - 82px);overflow:auto}.stage{min-height:55vh}.side{min-height:45vh}.compare{width:360px}.brand span{display:none}}
  @media(prefers-reduced-motion:reduce){*{animation-duration:.001ms!important;transition-duration:.001ms!important}}
</style>
</head>
<body>
<header class="top">
  <div class="brand"><div class="brandMark" id="logoFallback">✦</div><img id="logo" alt="" style="display:none"/><div><b id="school">FaceGate</b><span id="kioskTitle">ระบบสแกนใบหน้าเข้า-ออกโรงเรียน</span></div></div>
  <div class="today"><span id="todayLabel">เข้าเรียนวันนี้</span> : <b id="sPresent">0</b> คน</div>
  <div class="timebox"><div><div class="clock" id="clock">--:--:--</div><div class="date" id="date"></div></div><button class="adminBtn" onclick="location.href='/admin'">หลังบ้าน (F9)</button></div>
</header>
<div class="app">
  <div class="stage" id="stage"><video id="cam" autoplay playsinline muted></video><div class="shade"></div><div class="live"><i></i><span id="liveLabel">กล้องสด</span></div><div class="guide"><i class="corner c1"></i><i class="corner c2"></i><i class="corner c3"></i><i class="corner c4"></i></div><div class="banner" id="banner">กรุณามองกล้องในกรอบ</div>
    <div class="compare" id="compare"><h3 id="comparisonTitle">ผลการเปรียบเทียบใบหน้า</h3><div class="comparePics"><figure><img id="cameraShot" alt=""/><figcaption id="cameraLabel">ภาพจากกล้อง</figcaption></figure><div class="verifyIcon">✓</div><figure><img id="registeredShot" alt=""/><figcaption id="registeredLabel">ภาพลงทะเบียน</figcaption></figure></div><div class="score"><b><span id="matchLabel">คะแนนตรงกัน</span>: <span id="matchScore">—</span></b><div class="scoreline"><i id="scoreFill" style="width:0"></i></div><small id="verifiedLabel">ยืนยันตัวตนแล้ว</small></div></div>
  </div>
  <aside class="side"><div class="welcome"><i>✦</i><span id="welcome">ยินดีต้อนรับกลับโรงเรียน!</span></div>
    <div class="profile" id="profile"><img class="avatar" id="profileAvatar" alt=""/><h2 id="profileName">—</h2><div class="role" id="profileRole">—</div><div class="facts"><div class="fact"><small id="classLabel">ชั้นเรียน</small><b id="profileClass">—</b></div><div class="fact"><small id="idLabel">รหัส</small><b id="profileId">—</b></div></div><div class="resultTime"><span id="timeLabel">เวลาเข้า-ออก</span><b id="scanTime">--:--:-- น.</b></div><div class="resultBar" id="resultBar">บันทึกสำเร็จ</div></div>
    <div class="waiting" id="waiting"><div class="ready"><small>FACEGATE READY</small><h2 id="subtitle">กรุณามองกล้องในกรอบ</h2><p id="readyDetail">ระบบพร้อมสำหรับการสแกน</p></div><div class="listTitle"><span>สแกนเข้าล่าสุด</span><small>วันนี้</small></div><div class="list" id="list"></div></div>
  </aside>
</div>
<div class="news" id="newsBox" style="display:none"><div id="news"></div></div>
<div class="saver" id="saver" onclick="wake()"><div style="font-size:1.5rem;font-weight:700" id="saverTitle">สถิติวันนี้</div><div class="grid"><div><b id="vPresent">0</b>มาแล้ว</div><div><b id="vLate">0</b>มาสาย</div><div><b id="vAbsent">0</b>ขาด</div><div><b id="vLeft">0</b>กลับแล้ว</div></div><div style="opacity:.65">แตะหน้าจอเพื่อกลับสู่การสแกน</div></div>
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
    // CCTV mode: the screen may rest, but the camera keeps watching and keeps
    // feeding the live page, so make sure the video never pauses.
    const v = $('cam');
    if (v && v.paused) { try { await v.play(); } catch (e) {} }
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
