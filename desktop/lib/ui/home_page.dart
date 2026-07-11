import 'dart:async';

import 'package:flutter/material.dart';

import '../data/models.dart';
import '../data/search.dart';
import '../main.dart';
import '../theme.dart';
import 'login_page.dart';
import 'player_page.dart';
import 'series_page.dart';
import 'widgets/stream_tile.dart';

const String _favoritesId = '__fav__';
const String _allId = '__all__';

/// The main browse screen, ported from `HomeActivity` / the web `homeView`.
/// Tabs (Live/Movies/Series) → category rail → grid, plus debounced search.
class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  StreamType _type = StreamType.live;
  List<Category> _categories = const [];
  Category? _currentCategory;
  List<Stream> _streams = const [];
  List<Stream>? _allStreamsCache; // full catalog for the tab, for search
  bool _searching = false;
  String _message = 'Loading…';
  bool _loading = true;

  final _searchController = TextEditingController();
  Timer? _searchTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _switchTab(StreamType.live));
  }

  @override
  void dispose() {
    _searchTimer?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  // ---------- Tabs ----------
  Future<void> _switchTab(StreamType type) async {
    _searchTimer?.cancel();
    setState(() {
      _type = type;
      _currentCategory = null;
      _allStreamsCache = null;
      _searching = false;
      _searchController.clear();
      _streams = const [];
      _loading = true;
      _message = 'Loading…';
    });
    await _loadCategories();
  }

  Future<void> _loadCategories() async {
    final client = AppScope.of(context).client;
    try {
      final cats = <Category>[const Category(_favoritesId, 'Favorites')];
      cats.addAll(await client.categories(_type));
      final defaultIndex = cats.length > 1 ? 1 : 0; // land on "All"
      if (!mounted) return;
      setState(() => _categories = cats);
      await _loadStreams(cats[defaultIndex]);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _message = 'Error: $e';
      });
    }
  }

  Future<void> _loadStreams(Category cat) async {
    setState(() {
      _currentCategory = cat;
      _searching = false;
      _loading = true;
      _message = 'Loading ${cat.name}…';
    });
    if (cat.id == _favoritesId) {
      _showFavorites();
      return;
    }
    final client = AppScope.of(context).client;
    try {
      final list = await client.streams(_type, cat.id);
      if (!mounted || _currentCategory?.id != cat.id) return;
      setState(() {
        _streams = list;
        _loading = false;
        _message = list.isEmpty ? 'Empty category' : '';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _message = 'Error: $e';
      });
    }
  }

  void _showFavorites() {
    final favs = AppScope.of(context).favorites.all(_type);
    setState(() {
      _streams = favs;
      _loading = false;
      _message = favs.isEmpty ? 'No favorites yet' : '';
    });
  }

  // ---------- Search ----------
  void _onSearchChanged(String query) {
    _searchTimer?.cancel();
    if (Search.normalize(query).length < Search.minQuery) {
      if (_searching) {
        _searching = false;
        final cat = _currentCategory;
        if (cat != null) _loadStreams(cat);
      }
      return;
    }
    _searching = true;
    _searchTimer = Timer(const Duration(milliseconds: 300), () => _runSearch(query));
  }

  Future<void> _runSearch(String query) async {
    setState(() {
      _loading = true;
      _message = 'Searching…';
    });
    final client = AppScope.of(context).client;
    try {
      _allStreamsCache ??= await client.streams(_type, _allId);
      if (!mounted || !_searching) return;
      final filtered = Search.search(query, _allStreamsCache!);
      setState(() {
        _streams = filtered;
        _loading = false;
        _message = filtered.isEmpty ? 'No results' : '';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _message = 'Error: $e';
      });
    }
  }

  // ---------- Interaction ----------
  void _onStreamTap(Stream s) {
    final client = AppScope.of(context).client;
    switch (s.type) {
      case StreamType.live:
        _openPlayer(client.liveUrl(s.id), s.name, live: true);
        break;
      case StreamType.vod:
        _openPlayer(client.vodUrl(s.id, s.containerExt), s.name, live: false);
        break;
      case StreamType.series:
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => SeriesPage(seriesId: s.id, title: s.name)),
        );
        break;
    }
  }

  void _openPlayer(String url, String title, {required bool live}) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PlayerPage(url: url, title: title, isLive: live),
      ),
    );
  }

  Future<void> _toggleFavorite(Stream s) async {
    await AppScope.of(context).favorites.toggle(s);
    if (_currentCategory?.id == _favoritesId) {
      _showFavorites();
    } else {
      setState(() {}); // repaint the badge
    }
  }

  Future<void> _logout() async {
    final scope = AppScope.of(context);
    await scope.prefs.clear();
    scope.reauth();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginPage()),
    );
  }

  // ---------- Build ----------
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          _topBar(),
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _categoryRail(),
                Expanded(child: _content()),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _topBar() {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.bg,
        border: Border(bottom: BorderSide(color: AppColors.lineStrong, width: 2)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 11,
            height: 11,
            decoration: BoxDecoration(
              color: AppColors.red,
              border: Border.all(color: AppColors.ink, width: 1.5),
            ),
          ),
          const SizedBox(width: 10),
          Text('IPTVy', style: displayStyle(size: 18)),
          const SizedBox(width: 24),
          _tabs(),
          const Spacer(),
          _searchBox(),
          const SizedBox(width: 14),
          _ghostButton('Logout', _logout),
        ],
      ),
    );
  }

  Widget _tabs() {
    const items = [
      (StreamType.live, 'Live TV'),
      (StreamType.vod, 'Movies'),
      (StreamType.series, 'Series'),
    ];
    return Container(
      decoration: BoxDecoration(border: Border.all(color: AppColors.ink, width: 2)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0)
              const SizedBox(
                width: 2,
                height: 34,
                child: ColoredBox(color: AppColors.ink),
              ),
            _tab(items[i].$1, items[i].$2),
          ],
        ],
      ),
    );
  }

  Widget _tab(StreamType type, String label) {
    final active = _type == type;
    return _Clickable(
      onTap: () => _switchTab(type),
      builder: (hover) => Container(
        color: active ? AppColors.ink : (hover ? AppColors.bg2 : AppColors.bg),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 9),
        child: Text(
          label.toUpperCase(),
          style: labelStyle(
            size: 12,
            tracking: 0.12,
            color: active ? AppColors.bg : (hover ? AppColors.ink : AppColors.mid),
          ),
        ),
      ),
    );
  }

  Widget _searchBox() {
    return SizedBox(
      width: 230,
      height: 40,
      child: TextField(
        controller: _searchController,
        onChanged: _onSearchChanged,
        style: labelStyle(size: 13, weight: FontWeight.w500, color: AppColors.ink, tracking: 0),
        cursorColor: AppColors.red,
        decoration: InputDecoration(
          isDense: true,
          prefixIcon: const Icon(Icons.search, size: 17, color: AppColors.mid),
          prefixIconConstraints: const BoxConstraints(minWidth: 38),
          hintText: 'Search…',
          hintStyle: labelStyle(size: 13, weight: FontWeight.w500, color: AppColors.dim, tracking: 0),
          filled: true,
          fillColor: AppColors.surface,
          contentPadding: const EdgeInsets.symmetric(vertical: 10),
          border: _inputBorder(AppColors.ink),
          enabledBorder: _inputBorder(AppColors.ink),
          focusedBorder: _inputBorder(AppColors.red, width: 3),
        ),
      ),
    );
  }

  OutlineInputBorder _inputBorder(Color color, {double width = 2}) => OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: color, width: width),
      );

  Widget _ghostButton(String label, VoidCallback onTap) {
    return _Clickable(
      onTap: onTap,
      builder: (hover) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        decoration: BoxDecoration(
          color: hover ? AppColors.ink : AppColors.surface,
          border: Border.all(color: AppColors.ink, width: 2),
        ),
        child: Text(
          label.toUpperCase(),
          style: labelStyle(size: 12, tracking: 0.1, color: hover ? AppColors.bg : AppColors.ink),
        ),
      ),
    );
  }

  Widget _categoryRail() {
    return Container(
      width: 268,
      decoration: const BoxDecoration(
        border: Border(right: BorderSide(color: AppColors.lineStrong, width: 2)),
      ),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        itemCount: _categories.length,
        itemBuilder: (context, i) {
          final cat = _categories[i];
          final active = _currentCategory?.id == cat.id && !_searching;
          return _CategoryButton(
            label: cat.name,
            active: active,
            onTap: () => _loadStreams(cat),
          );
        },
      ),
    );
  }

  Widget _content() {
    if (_loading || _message.isNotEmpty) {
      return Center(
        child: Text(
          _loading && _message.isEmpty ? 'Loading…' : _message,
          style: labelStyle(size: 14, weight: FontWeight.w500, tracking: 0.12),
        ),
      );
    }
    final live = _type == StreamType.live;
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 42),
      gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: live ? 260 : 210,
        mainAxisSpacing: 20,
        crossAxisSpacing: 20,
        // Tile aspect: poster + a 2-line label below it. Live tiles use 16:10
        // art (shorter); VOD/series use 2:3 posters (taller). The extra height
        // over the raw poster ratio leaves room for the label without overflow.
        childAspectRatio: live ? 260 / 232 : 200 / 362,
      ),
      itemCount: _streams.length,
      itemBuilder: (context, i) {
        final s = _streams[i];
        return StreamTile(
          stream: s,
          isFavorite: AppScope.of(context).favorites.isFavorite(s),
          onTap: () => _onStreamTap(s),
          onToggleFavorite: () => _toggleFavorite(s),
        );
      },
    );
  }
}

class _CategoryButton extends StatefulWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _CategoryButton({required this.label, required this.active, required this.onTap});

  @override
  State<_CategoryButton> createState() => _CategoryButtonState();
}

class _CategoryButtonState extends State<_CategoryButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final active = widget.active;
    final bg = active
        ? AppColors.surface
        : (_hover ? AppColors.bg2 : Colors.transparent);
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          margin: const EdgeInsets.only(bottom: 2),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(
            color: bg,
            border: Border(
              left: BorderSide(
                color: active ? AppColors.red : Colors.transparent,
                width: 4,
              ),
            ),
          ),
          child: Text(
            widget.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: labelStyle(
              size: 13,
              weight: active ? FontWeight.w600 : FontWeight.w500,
              color: active || _hover ? AppColors.ink : AppColors.mid,
              tracking: 0,
            ),
          ),
        ),
      ),
    );
  }
}

/// A hover-aware tap target that rebuilds its child with the current hover
/// state — used for tabs and ghost buttons.
class _Clickable extends StatefulWidget {
  final VoidCallback onTap;
  final Widget Function(bool hover) builder;
  const _Clickable({required this.onTap, required this.builder});

  @override
  State<_Clickable> createState() => _ClickableState();
}

class _ClickableState extends State<_Clickable> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(onTap: widget.onTap, child: widget.builder(_hover)),
    );
  }
}
