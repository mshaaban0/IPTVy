import 'package:flutter/material.dart';

import '../../data/models.dart';
import '../../theme.dart';

/// One grid tile: poster (2:3 for VOD/series, 16:10 for live), a cream label,
/// and a red favorite badge. Focus/hover scales the poster and draws a red
/// inset ring — the same affordance as the web tiles. Right-click toggles a
/// favorite.
class StreamTile extends StatefulWidget {
  final Stream stream;
  final bool isFavorite;
  final VoidCallback onTap;
  final VoidCallback onToggleFavorite;

  const StreamTile({
    super.key,
    required this.stream,
    required this.isFavorite,
    required this.onTap,
    required this.onToggleFavorite,
  });

  @override
  State<StreamTile> createState() => _StreamTileState();
}

class _StreamTileState extends State<StreamTile> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final live = widget.stream.type == StreamType.live;
    final active = _hover;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        onSecondaryTap: widget.onToggleFavorite,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            AspectRatio(
              aspectRatio: live ? 16 / 10 : 2 / 3,
              child: AnimatedScale(
                scale: active ? 1.05 : 1.0,
                duration: const Duration(milliseconds: 120),
                curve: Curves.easeOut,
                child: Container(
                  decoration: BoxDecoration(
                    color: live ? AppColors.bg2 : AppColors.sunk,
                    border: Border.all(
                      color: active ? AppColors.red : AppColors.line,
                      width: active ? 3 : 2,
                    ),
                  ),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _poster(live),
                      if (active)
                        const DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.center,
                              end: Alignment.bottomCenter,
                              colors: [Colors.transparent, Color(0xB8080604)],
                            ),
                          ),
                        ),
                      if (widget.isFavorite) _favBadge(),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 9),
            Text(
              widget.stream.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: labelStyle(
                size: 12.5,
                weight: FontWeight.w500,
                color: active ? AppColors.ink : AppColors.mid,
                tracking: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _poster(bool live) {
    final icon = widget.stream.icon;
    final fallback = Center(
      child: Text(
        _initials(widget.stream.name),
        style: displayStyle(size: 34, color: AppColors.ink.withValues(alpha: 0.18)),
      ),
    );
    if (icon == null || icon.isEmpty) return fallback;
    return Image.network(
      icon,
      fit: live ? BoxFit.contain : BoxFit.cover,
      // Live channel logos are usually transparent PNGs — pad them like the web.
      errorBuilder: (_, _, _) => fallback,
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : fallback,
    );
  }

  Widget _favBadge() {
    return Align(
      alignment: Alignment.topRight,
      child: Container(
        width: 28,
        height: 28,
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          color: AppColors.red,
          border: Border(
            left: BorderSide(color: AppColors.ink, width: 2),
            bottom: BorderSide(color: AppColors.ink, width: 2),
          ),
        ),
        child: const Text('★', style: TextStyle(color: AppColors.ink, fontSize: 14)),
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    final first = parts[0][0];
    final second = parts.length > 1 ? parts[1][0] : '';
    return (first + second).toUpperCase();
  }
}
