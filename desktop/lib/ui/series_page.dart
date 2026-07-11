import 'package:flutter/material.dart';

import '../data/models.dart';
import '../main.dart';
import '../theme.dart';
import 'player_page.dart';

/// Series → episodes browser, ported from `SeriesDetailActivity` / `seriesView`.
class SeriesPage extends StatefulWidget {
  final String seriesId;
  final String title;
  const SeriesPage({super.key, required this.seriesId, required this.title});

  @override
  State<SeriesPage> createState() => _SeriesPageState();
}

class _SeriesPageState extends State<SeriesPage> {
  List<Episode>? _episodes;
  String _message = 'Loading episodes…';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final client = AppScope.of(context).client;
    try {
      final eps = await client.seriesEpisodes(widget.seriesId);
      if (!mounted) return;
      setState(() {
        _episodes = eps;
        _message = eps.isEmpty ? 'No episodes found' : '';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _message = 'Error: $e');
    }
  }

  void _play(Episode ep) {
    final client = AppScope.of(context).client;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PlayerPage(
          url: client.seriesUrl(ep.id, ep.containerExt),
          title: ep.title,
          isLive: false,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          _header(),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _header() {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.bg,
        border: Border(bottom: BorderSide(color: AppColors.lineStrong, width: 2)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 12),
      child: Row(
        children: [
          _backButton(),
          const SizedBox(width: 16),
          Expanded(
            child: Text(
              widget.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: displayStyle(size: 19),
            ),
          ),
        ],
      ),
    );
  }

  Widget _backButton() {
    return _HoverButton(
      onTap: () => Navigator.of(context).pop(),
      builder: (hover) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        decoration: BoxDecoration(
          color: hover ? AppColors.ink : AppColors.surface,
          border: Border.all(color: AppColors.ink, width: 2),
        ),
        child: Text(
          '← Back'.toUpperCase(),
          style: labelStyle(size: 12, tracking: 0.1, color: hover ? AppColors.bg : AppColors.ink),
        ),
      ),
    );
  }

  Widget _body() {
    final eps = _episodes;
    if (eps == null || _message.isNotEmpty) {
      return Center(
        child: Text(_message, style: labelStyle(size: 14, weight: FontWeight.w500, tracking: 0.12)),
      );
    }
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 980),
        child: ListView.builder(
          padding: const EdgeInsets.fromLTRB(28, 20, 28, 42),
          itemCount: eps.length,
          itemBuilder: (context, i) => _episodeRow(eps[i]),
        ),
      ),
    );
  }

  Widget _episodeRow(Episode ep) {
    return _HoverButton(
      onTap: () => _play(ep),
      builder: (hover) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 17, vertical: 15),
        decoration: BoxDecoration(
          color: hover ? AppColors.bg2 : AppColors.surface,
          border: Border.all(color: AppColors.ink, width: 2),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              ep.title,
              style: labelStyle(size: 14, weight: FontWeight.w600, color: AppColors.ink, tracking: 0),
            ),
            const SizedBox(height: 4),
            Text('Season ${ep.season}'.toUpperCase(), style: labelStyle(size: 11, tracking: 0.1)),
          ],
        ),
      ),
    );
  }
}

class _HoverButton extends StatefulWidget {
  final VoidCallback onTap;
  final Widget Function(bool hover) builder;
  const _HoverButton({required this.onTap, required this.builder});

  @override
  State<_HoverButton> createState() => _HoverButtonState();
}

class _HoverButtonState extends State<_HoverButton> {
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
