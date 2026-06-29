/*
 * Xtream Codes client, ported from XtreamClient.kt. Same player_api.php actions
 * and the same /live, /movie, /series URL builders. JSON parsing goes through
 * the platform shim so it works direct on webOS and via proxy in the browser.
 */
(function (IPTVy) {
  var StreamType = { LIVE: 'LIVE', VOD: 'VOD', SERIES: 'SERIES' };

  function enc(s) { return encodeURIComponent(s); }
  function blankNull(s) {
    if (s == null) return null;
    s = String(s);
    return s.trim() === '' ? null : s;
  }

  function mapStream(o, type) {
    if (type === StreamType.SERIES) {
      return { id: String(o.series_id == null ? '' : o.series_id), name: o.name || '', icon: blankNull(o.cover), type: type, containerExt: null };
    }
    if (type === StreamType.VOD) {
      return { id: String(o.stream_id == null ? '' : o.stream_id), name: o.name || '', icon: blankNull(o.stream_icon), type: type, containerExt: blankNull(o.container_extension) || 'mp4' };
    }
    return { id: String(o.stream_id == null ? '' : o.stream_id), name: o.name || '', icon: blankNull(o.stream_icon), type: type, containerExt: null };
  }

  function Xtream(prefs) { this.prefs = prefs; }

  Xtream.prototype.apiUrl = function (action, extra) {
    var p = this.prefs;
    return p.server + '/player_api.php?username=' + enc(p.username) + '&password=' + enc(p.password) +
      '&action=' + action + (extra || '');
  };

  // Validates credentials. Returns true if the panel reports auth = 1.
  Xtream.prototype.login = async function () {
    var p = this.prefs;
    var url = p.server + '/player_api.php?username=' + enc(p.username) + '&password=' + enc(p.password);
    try {
      var obj = await IPTVy.platform.apiGetJson(url);
      return !!(obj && obj.user_info && Number(obj.user_info.auth) === 1);
    } catch (e) { return false; }
  };

  Xtream.prototype.categories = async function (type) {
    var action = type === StreamType.LIVE ? 'get_live_categories'
      : type === StreamType.VOD ? 'get_vod_categories' : 'get_series_categories';
    var arr = await IPTVy.platform.apiGetJson(this.apiUrl(action));
    var out = [{ id: '__all__', name: 'All' }];
    (arr || []).forEach(function (o) {
      out.push({ id: String(o.category_id), name: o.category_name || '' });
    });
    return out;
  };

  Xtream.prototype.streams = async function (type, categoryId) {
    var action = type === StreamType.LIVE ? 'get_live_streams'
      : type === StreamType.VOD ? 'get_vod_streams' : 'get_series';
    var filter = categoryId === '__all__' ? '' : ('&category_id=' + enc(categoryId));
    var arr = await IPTVy.platform.apiGetJson(this.apiUrl(action, filter));
    return (arr || []).map(function (o) { return mapStream(o, type); });
  };

  // Returns episodes flattened across seasons, in season then panel order.
  Xtream.prototype.seriesEpisodes = async function (seriesId) {
    var obj = await IPTVy.platform.apiGetJson(this.apiUrl('get_series_info', '&series_id=' + enc(seriesId)));
    var episodesObj = obj && obj.episodes;
    if (!episodesObj) return [];
    var out = [];
    var seasonKeys = Object.keys(episodesObj).sort(function (a, b) {
      return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
    });
    seasonKeys.forEach(function (key) {
      var seasonNum = parseInt(key, 10) || 0;
      var eps = episodesObj[key] || [];
      eps.forEach(function (e, i) {
        out.push({
          id: String(e.id),
          title: (e.title && e.title.trim()) ? e.title.trim() : ('Episode ' + (i + 1)),
          season: seasonNum,
          containerExt: (e.container_extension && e.container_extension.trim()) ? e.container_extension : 'mp4'
        });
      });
    });
    return out;
  };

  Xtream.prototype.liveUrl = function (streamId) {
    var p = this.prefs;
    return p.server + '/live/' + enc(p.username) + '/' + enc(p.password) + '/' + streamId + '.ts';
  };
  Xtream.prototype.vodUrl = function (streamId, ext) {
    var p = this.prefs;
    return p.server + '/movie/' + enc(p.username) + '/' + enc(p.password) + '/' + streamId + '.' + (ext || 'mp4');
  };
  Xtream.prototype.seriesUrl = function (episodeId, ext) {
    var p = this.prefs;
    return p.server + '/series/' + enc(p.username) + '/' + enc(p.password) + '/' + episodeId + '.' + (ext || 'mp4');
  };

  IPTVy.StreamType = StreamType;
  IPTVy.Xtream = Xtream;
})(window.IPTVy = window.IPTVy || {});
