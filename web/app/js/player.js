/*
 * Modern video player UI: scrim + title, big center play/pause, a seek bar with
 * buffered + played + scrubber, time, skip ±10s, mute, fullscreen, and a LIVE
 * badge. Controls auto-hide during playback and are fully driveable by a TV
 * remote (it owns the keys while open, so spatial nav is suspended):
 *   OK/Space = play/pause · ◀ ▶ = seek 10s · ▲ ▼ = volume · Back = close.
 * Only transform/opacity animate, so it stays smooth on TV chips.
 */
(function (IPTVy) {
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, SPACE: 32, BACK_WEBOS: 461, ESC: 27, BACKSPACE: 8 };

  var video, ui, els = {};
  var isLive = false, onClose = null, hideTimer = null, scrubbing = false;
  var keyHandler = null;

  function $(id) { return document.getElementById(id); }

  function init(opts) {
    video = $('video');
    ui = $('playerUI');
    els = {
      back: $('plBack'), big: $('plBig'), play: $('plPlay'),
      back10: $('plBack10'), fwd10: $('plFwd10'), mute: $('plMute'), fs: $('plFs'),
      seek: $('plSeek'), seekRow: $('plSeekRow'), buffered: $('plBuffered'),
      played: $('plPlayed'), knob: $('plKnob'), cur: $('plCur'), dur: $('plDur'),
      live: $('plLive'), title: $('playerTitle'), buffering: $('buffering')
    };
    onClose = opts.onClose;

    els.back.addEventListener('click', close);
    els.big.addEventListener('click', togglePlay);
    els.play.addEventListener('click', togglePlay);
    els.back10.addEventListener('click', function () { seekBy(-10); });
    els.fwd10.addEventListener('click', function () { seekBy(10); });
    els.mute.addEventListener('click', toggleMute);
    els.fs.addEventListener('click', toggleFullscreen);
    video.addEventListener('click', function () { togglePlay(); reveal(); });
    els.seek.addEventListener('click', onSeekClick);

    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    video.addEventListener('timeupdate', updateProgress);
    video.addEventListener('progress', updateBuffered);
    video.addEventListener('waiting', function () { setBuffering(true); });
    video.addEventListener('playing', function () { setBuffering(false); });
    video.addEventListener('canplay', function () { setBuffering(false); });
    video.addEventListener('loadedmetadata', updateProgress);

    ui.addEventListener('mousemove', reveal);
  }

  function open(opts) {
    // opts: { url, title, isLive }
    isLive = !!opts.isLive;
    els.title.textContent = opts.title || '';
    els.live.classList.toggle('hidden', !isLive);
    els.seekRow.classList.toggle('hidden', isLive);     // no scrubbing live
    els.back10.classList.toggle('hidden', isLive);
    els.fwd10.classList.toggle('hidden', isLive);
    els.cur.textContent = '0:00'; els.dur.textContent = '0:00';
    els.played.style.width = '0%'; els.buffered.style.width = '0%'; els.knob.style.left = '0%';

    setBuffering(true);
    IPTVy.nav.suspend(true);
    IPTVy.platform.keepAwake(true);
    IPTVy.platform.playStream(video, opts.url, isLive);

    installKeys();
    reveal();
  }

  function close() {
    removeKeys();
    clearTimeout(hideTimer);
    IPTVy.platform.stop(video);
    IPTVy.platform.keepAwake(false);
    IPTVy.nav.suspend(false);
    if (onClose) onClose();
  }

  // ---------- transport ----------
  function togglePlay() { if (video.paused) video.play().catch(function () {}); else video.pause(); reveal(); }
  function seekBy(s) { if (isLive || !isFinite(video.duration)) return; video.currentTime = clamp(video.currentTime + s, 0, video.duration); reveal(); }
  function toggleMute() { video.muted = !video.muted; sync(); reveal(); }
  function changeVolume(d) { video.muted = false; video.volume = clamp(video.volume + d, 0, 1); sync(); reveal(); }
  function toggleFullscreen() {
    var el = $('playerView');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
    reveal();
  }

  function sync() {
    ui.classList.toggle('is-playing', !video.paused);
    ui.classList.toggle('is-muted', video.muted || video.volume === 0);
  }

  function updateProgress() {
    if (isLive) return;
    var d = video.duration, c = video.currentTime;
    els.cur.textContent = fmt(c);
    els.dur.textContent = isFinite(d) ? fmt(d) : '0:00';
    if (isFinite(d) && d > 0 && !scrubbing) {
      var pct = (c / d) * 100;
      els.played.style.width = pct + '%';
      els.knob.style.left = pct + '%';
    }
  }
  function updateBuffered() {
    if (isLive || !video.buffered.length || !isFinite(video.duration)) return;
    var end = video.buffered.end(video.buffered.length - 1);
    els.buffered.style.width = (end / video.duration * 100) + '%';
  }

  function onSeekClick(e) {
    if (isLive || !isFinite(video.duration)) return;
    var r = els.seek.getBoundingClientRect();
    video.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * video.duration;
    reveal();
  }

  function setBuffering(on) { els.buffering.classList.toggle('hidden', !on); }

  // ---------- auto-hide ----------
  function reveal() {
    ui.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (!video.paused) ui.classList.remove('show'); }, 3200);
  }

  // ---------- keys (remote owns them while open) ----------
  function installKeys() {
    keyHandler = function (e) {
      var code = e.keyCode || e.which;
      switch (code) {
        case KEY.BACK_WEBOS: case KEY.ESC: case KEY.BACKSPACE:
          e.preventDefault(); e.stopPropagation();
          if (ui.classList.contains('show') && document.activeElement && document.activeElement !== document.body) { /* let focus exist */ }
          close(); return;
        case KEY.ENTER: case KEY.SPACE:
          e.preventDefault(); e.stopPropagation(); togglePlay(); return;
        case KEY.LEFT: e.preventDefault(); e.stopPropagation(); seekBy(-10); return;
        case KEY.RIGHT: e.preventDefault(); e.stopPropagation(); seekBy(10); return;
        case KEY.UP: e.preventDefault(); e.stopPropagation(); changeVolume(0.1); return;
        case KEY.DOWN: e.preventDefault(); e.stopPropagation(); changeVolume(-0.1); return;
        default: reveal();
      }
    };
    document.addEventListener('keydown', keyHandler, true);
  }
  function removeKeys() { if (keyHandler) { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; } }

  // ---------- utils ----------
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var mm = h ? (m < 10 ? '0' + m : m) : m;
    var ss = sec < 10 ? '0' + sec : sec;
    return (h ? h + ':' : '') + mm + ':' + ss;
  }

  IPTVy.player = { init: init, open: open, close: close };
})(window.IPTVy = window.IPTVy || {});
