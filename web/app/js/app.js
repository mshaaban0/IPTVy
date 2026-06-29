/*
 * Main UI controller. Mirrors the Android app's LoginActivity / HomeActivity /
 * SeriesDetailActivity / PlayerActivity flow in a single-page web app.
 */
(function (IPTVy) {
  var StreamType = IPTVy.StreamType;
  var Prefs = IPTVy.Prefs;
  var Favorites = IPTVy.Favorites;
  var Search = IPTVy.Search;

  var FAVORITES_ID = '__fav__';
  var ALL_ID = '__all__';

  var client = null;
  var currentType = StreamType.LIVE;
  var currentCategory = null;
  var allStreamsCache = null; // full catalog for current tab, loaded lazily for search
  var searching = false;
  var searchTimer = null;
  var viewStack = [];

  var el = {};
  function $(id) { return document.getElementById(id); }

  // ---------- View switching ----------
  function show(viewId) {
    ['loginView', 'homeView', 'seriesView', 'playerView'].forEach(function (id) {
      $(id).classList.toggle('hidden', id !== viewId);
    });
  }

  // ---------- Login ----------
  function initLogin() {
    el.server = $('serverInput'); el.user = $('userInput'); el.pass = $('passInput');
    el.server.value = Prefs.server; el.user.value = Prefs.username; el.pass.value = Prefs.password;
    $('loginButton').addEventListener('click', attemptLogin);
    [el.server, el.user, el.pass].forEach(function (f) {
      f.addEventListener('keydown', function (e) { if ((e.keyCode || e.which) === 13) attemptLogin(); });
    });
  }

  async function attemptLogin() {
    var server = Prefs.normalize(el.server.value);
    var user = el.user.value.trim();
    var pass = el.pass.value.trim();
    if (!server || !user) { setLoginStatus('Enter server and username'); return; }
    $('loginButton').disabled = true;
    setLoginStatus('Connecting…');
    Prefs.save(server, user, pass);
    client = new IPTVy.Xtream(Prefs);
    var ok = false;
    try { ok = await client.login(); }
    catch (e) { setLoginStatus('Error: ' + e.message); $('loginButton').disabled = false; return; }
    $('loginButton').disabled = false;
    if (ok) enterHome();
    else setLoginStatus('Login failed — check credentials/server');
  }
  function setLoginStatus(t) { $('loginStatus').textContent = t; }

  // ---------- Home ----------
  function enterHome() {
    show('homeView');
    viewStack = ['homeView'];
    switchTab(StreamType.LIVE);
    IPTVy.nav.focusFirst($('homeView'));
  }

  function spanForType() { return currentType === StreamType.LIVE ? 5 : 6; }

  function switchTab(type) {
    currentType = type;
    currentCategory = null;
    allStreamsCache = null;
    searching = false;
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
    $('searchInput').value = '';
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-type') === type);
    });
    $('streamGrid').style.setProperty('--cols', spanForType());
    $('streamGrid').innerHTML = '';
    loadCategories();
  }

  async function loadCategories() {
    setMessage('Loading…');
    try {
      var cats = [{ id: FAVORITES_ID, name: 'Favorites' }].concat(await client.categories(currentType));
      var defaultIndex = cats.length > 1 ? 1 : 0; // land on "All", Favorites pinned on top
      renderCategories(cats, defaultIndex);
      loadStreams(cats[defaultIndex]);
    } catch (e) { setMessage('Error: ' + e.message); }
  }

  function renderCategories(cats, activeIndex) {
    var nav = $('categoryList');
    nav.innerHTML = '';
    cats.forEach(function (cat, i) {
      var btn = document.createElement('button');
      btn.className = 'cat focusable' + (i === activeIndex ? ' active' : '');
      btn.textContent = cat.name;
      btn.addEventListener('click', function () {
        nav.querySelectorAll('.cat').forEach(function (c) { c.classList.remove('active'); });
        btn.classList.add('active');
        loadStreams(cat);
      });
      nav.appendChild(btn);
    });
  }

  async function loadStreams(cat) {
    currentCategory = cat;
    if (cat.id === FAVORITES_ID) { showFavorites(); return; }
    setMessage('Loading ' + cat.name + '…');
    try {
      var list = await client.streams(currentType, cat.id);
      renderStreams(list);
      setMessage(list.length ? null : 'Empty category');
    } catch (e) { setMessage('Error: ' + e.message); }
  }

  function showFavorites() {
    var list = Favorites.all(currentType);
    renderStreams(list);
    setMessage(list.length ? null : 'No favorites yet');
  }

  // ---------- Infinite scroll ----------
  // Big catalogs (the "All" VOD list is thousands of items) used to render every
  // tile up front: huge DOM, microscopic scrollbar, slow on TV chips. Instead we
  // render in chunks and append more as the user nears the bottom. The same
  // handler fires for touch scroll (mobile), wheel/scrollbar (desktop) and the
  // D-pad's scrollIntoView (TV), so one code path covers every platform.
  var TILE_BATCH = 60;   // tiles rendered per chunk
  var PRELOAD_PX = 800;  // start the next chunk this far (~2 rows) from the bottom
  var inf = { list: [], count: 0, scheduled: false };

  function contentEl() { return el.content || (el.content = document.querySelector('.content')); }

  function renderStreams(list) {
    var grid = $('streamGrid');
    grid.innerHTML = '';
    inf.list = list || [];
    inf.count = 0;
    contentEl().scrollTop = 0;
    appendBatch();
    fillViewport(); // top up until the first screenful is covered
    setMessage(inf.list.length ? null : getMessageText());
  }

  function appendBatch() {
    var end = Math.min(inf.count + TILE_BATCH, inf.list.length);
    if (end <= inf.count) return false;
    var frag = document.createDocumentFragment();
    for (var i = inf.count; i < end; i++) frag.appendChild(makeTile(inf.list[i]));
    $('streamGrid').appendChild(frag);
    inf.count = end;
    return true;
  }

  // Keep appending while the scroll container isn't yet filled past the preload
  // threshold. Handles short viewports, the initial paint, and D-pad jumps.
  function fillViewport() {
    var c = contentEl();
    while (inf.count < inf.list.length &&
           c.scrollHeight - c.scrollTop - c.clientHeight < PRELOAD_PX) {
      if (!appendBatch()) break;
    }
  }

  function onContentScroll() {
    if (inf.scheduled || inf.count >= inf.list.length) return;
    inf.scheduled = true;
    requestAnimationFrame(function () { inf.scheduled = false; fillViewport(); });
  }
  function getMessageText() { return searching ? 'No results' : null; }

  function setMessage(t) {
    var m = $('message');
    if (t == null) m.classList.add('hidden');
    else { m.classList.remove('hidden'); m.textContent = t; }
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
  }

  function makeTile(stream) {
    var tile = document.createElement('div');
    tile.className = 'tile focusable' + (currentType === StreamType.LIVE ? ' live' : '') +
      (Favorites.isFavorite(stream) ? ' fav' : '');
    tile.tabIndex = 0;

    var poster = document.createElement('div');
    poster.className = 'poster';

    var fallback = document.createElement('div');
    fallback.className = 'poster-fallback';
    fallback.textContent = initials(stream.name);
    poster.appendChild(fallback);

    if (stream.icon) {
      var img = document.createElement('img');
      img.className = 'thumb';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = '';
      img.addEventListener('load', function () { tile.classList.add('has-art'); });
      img.addEventListener('error', function () { img.remove(); }); // fall back to the initial
      img.src = stream.icon;
      poster.appendChild(img);
    }

    var grad = document.createElement('div');
    grad.className = 'poster-grad';
    poster.appendChild(grad);

    var badge = document.createElement('div');
    badge.className = 'fav-badge';
    badge.textContent = '★';
    poster.appendChild(badge);

    var label = document.createElement('div');
    label.className = 'label';
    label.textContent = stream.name;

    tile.appendChild(poster); tile.appendChild(label);
    tile.addEventListener('click', function () { onStreamClicked(stream); });

    // Favorite toggle: long-press / right-click (remote-based toggle is a TODO).
    var lpTimer = null;
    tile.addEventListener('contextmenu', function (e) { e.preventDefault(); toggleFavorite(stream, tile); });
    tile.addEventListener('mousedown', function () { lpTimer = setTimeout(function () { toggleFavorite(stream, tile); }, 600); });
    ['mouseup', 'mouseleave'].forEach(function (ev) { tile.addEventListener(ev, function () { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }); });
    return tile;
  }

  function toggleFavorite(stream, tile) {
    var nowFav = Favorites.toggle(stream);
    if (currentCategory && currentCategory.id === FAVORITES_ID) showFavorites();
    else if (tile) tile.classList.toggle('fav', nowFav);
  }

  function onStreamClicked(stream) {
    if (stream.type === StreamType.LIVE) openPlayer(client.liveUrl(stream.id), stream.name, true);
    else if (stream.type === StreamType.VOD) openPlayer(client.vodUrl(stream.id, stream.containerExt), stream.name, false);
    else openSeries(stream.id, stream.name);
  }

  // ---------- Search ----------
  function scheduleSearch(query) {
    if (searchTimer) clearTimeout(searchTimer);
    if (Search.normalize(query).length < Search.MIN_QUERY) {
      if (searching) { searching = false; if (currentCategory) loadStreams(currentCategory); }
      return;
    }
    searching = true;
    searchTimer = setTimeout(function () { runSearch(query); }, 300);
  }

  async function runSearch(query) {
    setMessage('Searching…');
    try {
      if (!allStreamsCache) allStreamsCache = await client.streams(currentType, ALL_ID);
      var filtered = Search.search(query, allStreamsCache);
      renderStreams(filtered);
      setMessage(filtered.length ? null : 'No results');
    } catch (e) { setMessage('Error: ' + e.message); }
  }

  // ---------- Series detail ----------
  async function openSeries(seriesId, name) {
    show('seriesView');
    viewStack.push('seriesView');
    $('seriesTitle').textContent = name || 'Series';
    var listEl = $('episodeList');
    listEl.innerHTML = '';
    setSeriesMessage('Loading episodes…');
    IPTVy.nav.focusFirst($('seriesView'));
    try {
      var eps = await client.seriesEpisodes(seriesId);
      if (!eps.length) { setSeriesMessage('No episodes found'); return; }
      setSeriesMessage(null);
      var frag = document.createDocumentFragment();
      eps.forEach(function (ep) {
        var btn = document.createElement('button');
        btn.className = 'episode focusable';
        btn.innerHTML = '<div>' + escapeHtml(ep.title) + '</div><div class="season">Season ' + ep.season + '</div>';
        btn.addEventListener('click', function () { openPlayer(client.seriesUrl(ep.id, ep.containerExt), ep.title, false); });
        frag.appendChild(btn);
      });
      listEl.appendChild(frag);
      IPTVy.nav.focusFirst(listEl);
    } catch (e) { setSeriesMessage('Error: ' + e.message); }
  }
  function setSeriesMessage(t) {
    var m = $('seriesMessage');
    if (t == null) m.classList.add('hidden');
    else { m.classList.remove('hidden'); m.textContent = t; }
  }

  // ---------- Player ----------
  function openPlayer(url, title, live) {
    show('playerView');
    viewStack.push('playerView');
    IPTVy.player.open({ url: url, title: title, isLive: live });
  }

  // Called by the player module when it closes (back button / Back key).
  function afterPlayerClose() {
    viewStack.pop();
    var back = viewStack[viewStack.length - 1] || 'homeView';
    show(back);
    IPTVy.nav.focusFirst($(back));
  }

  function initPlayer() { IPTVy.player.init({ onClose: afterPlayerClose }); }

  // ---------- Back handling ----------
  function handleBack() {
    var top = viewStack[viewStack.length - 1];
    if (top === 'playerView') { IPTVy.player.close(); return; }
    if (top === 'seriesView') {
      viewStack.pop();
      show('homeView');
      IPTVy.nav.focusFirst($('homeView'));
      return;
    }
    // On home: do nothing (let the platform exit the app).
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- Boot ----------
  function boot() {
    initLogin();
    initPlayer();
    IPTVy.nav.init();
    IPTVy.nav.onBack(handleBack);

    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { switchTab(t.getAttribute('data-type')); });
    });
    $('searchInput').addEventListener('input', function (e) { scheduleSearch(e.target.value); });
    contentEl().addEventListener('scroll', onContentScroll, { passive: true });
    $('logoutButton').addEventListener('click', function () {
      Prefs.clear();
      show('loginView');
      viewStack = [];
      IPTVy.nav.focusFirst($('loginView'));
    });
    $('seriesBack').addEventListener('click', handleBack);

    if (Prefs.isLoggedIn) {
      client = new IPTVy.Xtream(Prefs);
      enterHome();
    } else {
      show('loginView');
      IPTVy.nav.focusFirst($('loginView'));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.IPTVy = window.IPTVy || {});
