/*
 * Spatial D-pad navigation. Android gave focus traversal for free via focusable
 * views; on the web we implement it. Arrow keys move focus to the nearest
 * visible .focusable element in that direction (by geometry), Enter activates,
 * Back goes up a level. Works identically for a TV remote and a keyboard:
 * webOS maps remote arrows/OK/Back to the same keycodes (Back = 461).
 */
(function (IPTVy) {
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK_WEBOS: 461, ESC: 27, BACKSPACE: 8 };
  var backHandler = function () {};
  var suspended = false; // the player takes over key handling while open

  function visibleFocusables() {
    var nodes = document.querySelectorAll('.focusable');
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && el.offsetParent !== null) out.push(el);
    }
    return out;
  }

  function center(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r };
  }

  function current() {
    var a = document.activeElement;
    if (a && a.classList && a.classList.contains('focusable')) return a;
    return document.querySelector('.focusable.is-focused');
  }

  function setFocus(el) {
    if (!el) return;
    var prev = document.querySelector('.focusable.is-focused');
    if (prev) prev.classList.remove('is-focused');
    el.classList.add('is-focused');
    try { el.focus({ preventScroll: false }); } catch (e) { try { el.focus(); } catch (e2) {} }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // Picks the closest candidate that lies in the requested direction from `from`.
  function move(dir) {
    var from = current();
    var list = visibleFocusables();
    if (!from) { setFocus(list[0]); return; }
    var c = center(from);
    var best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === from) continue;
      var t = center(list[i]);
      var dx = t.x - c.x, dy = t.y - c.y;
      var inDir =
        dir === KEY.LEFT ? dx < -1 :
        dir === KEY.RIGHT ? dx > 1 :
        dir === KEY.UP ? dy < -1 : dy > 1;
      if (!inDir) continue;
      // Distance along the travel axis dominates; off-axis drift is penalised
      // so we prefer the element most directly in line.
      var along = (dir === KEY.LEFT || dir === KEY.RIGHT) ? Math.abs(dx) : Math.abs(dy);
      var off = (dir === KEY.LEFT || dir === KEY.RIGHT) ? Math.abs(dy) : Math.abs(dx);
      var sscore = along + off * 2;
      if (sscore < bestScore) { bestScore = sscore; best = list[i]; }
    }
    if (best) setFocus(best);
  }

  function onKeyDown(e) {
    if (suspended) return;
    var code = e.keyCode || e.which;
    var el = current();
    var typing = el && el.tagName === 'INPUT' && (code === KEY.LEFT || code === KEY.RIGHT);
    switch (code) {
      case KEY.LEFT: case KEY.RIGHT:
        if (typing) return; // let the caret move inside text fields
        e.preventDefault(); move(code); break;
      case KEY.UP: case KEY.DOWN:
        e.preventDefault(); move(code); break;
      case KEY.ENTER:
        if (el) {
          if (el.tagName === 'INPUT') return; // Enter in a field submits via app logic
          e.preventDefault(); el.click();
        }
        break;
      case KEY.BACK_WEBOS: case KEY.ESC:
        e.preventDefault(); backHandler(); break;
      case KEY.BACKSPACE:
        if (!(el && el.tagName === 'INPUT')) { e.preventDefault(); backHandler(); }
        break;
    }
  }

  IPTVy.nav = {
    init: function () { document.addEventListener('keydown', onKeyDown, true); },
    suspend: function (on) { suspended = !!on; },
    setFocus: setFocus,
    // Focus the first focusable inside a freshly shown view.
    focusFirst: function (root) {
      var el = (root || document).querySelector('.focusable');
      setFocus(el);
    },
    onBack: function (fn) { backHandler = fn || function () {}; }
  };
})(window.IPTVy = window.IPTVy || {});
