import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../theme.dart';

/// Native playback screen, ported from `PlayerActivity` / the web `playerView`.
/// libmpv (via media_kit) decodes MPEG-TS live, HEVC, AC3, MKV and HLS with
/// hardware acceleration, so the same widget plays everything a panel serves.
///
/// Controls are a custom risograph overlay: title + back on top, a big
/// play/pause in the middle, and a seek row on the bottom (VOD only — live is
/// unseekable). The overlay auto-hides after a few idle seconds.
class PlayerPage extends StatefulWidget {
  final String url;
  final String title;
  final bool isLive;

  const PlayerPage({
    super.key,
    required this.url,
    required this.title,
    required this.isLive,
  });

  @override
  State<PlayerPage> createState() => _PlayerPageState();
}

class _PlayerPageState extends State<PlayerPage> {
  late final Player _player = Player();
  late final VideoController _controller = VideoController(_player);

  bool _controlsVisible = true;
  Timer? _hideTimer;

  bool _playing = true;
  bool _buffering = true;
  bool _muted = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  final List<StreamSubscription> _subs = [];

  @override
  void initState() {
    super.initState();
    _wireStreams();
    _player.open(
      Media(widget.url, httpHeaders: const {'User-Agent': 'IPTVy/1.0'}),
    );
    _scheduleHide();
  }

  void _wireStreams() {
    _subs.add(_player.stream.playing.listen((v) {
      if (mounted) setState(() => _playing = v);
    }));
    _subs.add(_player.stream.buffering.listen((v) {
      if (mounted) setState(() => _buffering = v);
    }));
    _subs.add(_player.stream.position.listen((v) {
      if (mounted) setState(() => _position = v);
    }));
    _subs.add(_player.stream.duration.listen((v) {
      if (mounted) setState(() => _duration = v);
    }));
    _subs.add(_player.stream.volume.listen((v) {
      if (mounted) setState(() => _muted = v <= 0.01);
    }));
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    _player.dispose();
    super.dispose();
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 3), () {
      if (mounted && _playing) setState(() => _controlsVisible = false);
    });
  }

  void _revealControls() {
    setState(() => _controlsVisible = true);
    _scheduleHide();
  }

  void _togglePlay() {
    _player.playOrPause();
    _revealControls();
  }

  void _toggleMute() {
    _player.setVolume(_muted ? 100 : 0);
    _revealControls();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Focus(
        autofocus: true,
        onKeyEvent: _onKey,
        child: MouseRegion(
          onHover: (_) => _revealControls(),
          child: GestureDetector(
            onTap: () => _controlsVisible ? _hideNow() : _revealControls(),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Video(
                  controller: _controller,
                  controls: NoVideoControls,
                  fit: BoxFit.contain,
                ),
                if (_buffering) _bufferingSpinner(),
                _overlay(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _hideNow() {
    _hideTimer?.cancel();
    setState(() => _controlsVisible = false);
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.escape) {
      Navigator.of(context).maybePop();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.space || key == LogicalKeyboardKey.mediaPlayPause) {
      _togglePlay();
      return KeyEventResult.handled;
    }
    if (!widget.isLive) {
      if (key == LogicalKeyboardKey.arrowRight) {
        _seekBy(const Duration(seconds: 10));
        return KeyEventResult.handled;
      }
      if (key == LogicalKeyboardKey.arrowLeft) {
        _seekBy(const Duration(seconds: -10));
        return KeyEventResult.handled;
      }
    }
    return KeyEventResult.ignored;
  }

  void _seekBy(Duration delta) {
    var target = _position + delta;
    if (target < Duration.zero) target = Duration.zero;
    if (_duration > Duration.zero && target > _duration) target = _duration;
    _player.seek(target);
    _revealControls();
  }

  Widget _bufferingSpinner() {
    return const Center(
      child: SizedBox(
        width: 50,
        height: 50,
        child: CircularProgressIndicator(
          strokeWidth: 3,
          color: AppColors.red,
          backgroundColor: Color(0x38F2EFE6),
        ),
      ),
    );
  }

  Widget _overlay() {
    return AnimatedOpacity(
      opacity: _controlsVisible ? 1 : 0,
      duration: const Duration(milliseconds: 160),
      child: IgnorePointer(
        ignoring: !_controlsVisible,
        child: Column(
          children: [
            _topBar(),
            Expanded(
              child: Center(
                child: _bigPlayButton(),
              ),
            ),
            if (!widget.isLive) _seekRow() else const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _topBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 22, 24, 48),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xB8000000), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          _circleButton(Icons.arrow_back, () => Navigator.of(context).maybePop()),
          const SizedBox(width: 16),
          Expanded(
            child: Text(
              widget.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: displayStyle(size: 19),
            ),
          ),
          if (widget.isLive) _liveBadge(),
        ],
      ),
    );
  }

  Widget _liveBadge() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 8, height: 8, color: AppColors.redDeep),
        const SizedBox(width: 7),
        Text('LIVE', style: labelStyle(size: 12, weight: FontWeight.w700, color: AppColors.redDeep, tracking: 0.16)),
      ],
    );
  }

  Widget _bigPlayButton() {
    return _CircleControl(
      size: 92,
      iconSize: 40,
      icon: _playing ? Icons.pause : Icons.play_arrow,
      onTap: _togglePlay,
    );
  }

  Widget _seekRow() {
    final dur = _duration.inMilliseconds;
    final pos = _position.inMilliseconds.clamp(0, dur == 0 ? 1 : dur);
    final value = dur > 0 ? pos / dur : 0.0;
    return Container(
      padding: const EdgeInsets.fromLTRB(34, 48, 34, 26),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Color(0xCC000000), Colors.transparent],
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Text(_fmt(_position), style: _timeStyle()),
              Expanded(
                child: SliderTheme(
                  data: SliderThemeData(
                    trackHeight: 5,
                    activeTrackColor: AppColors.red,
                    inactiveTrackColor: const Color(0x3DF2EFE6),
                    thumbColor: AppColors.ink,
                    overlayColor: const Color(0x33CE4524),
                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
                    trackShape: const RectangularSliderTrackShape(),
                  ),
                  child: Slider(
                    value: value.clamp(0.0, 1.0),
                    onChanged: dur > 0
                        ? (v) {
                            _revealControls();
                            _player.seek(Duration(milliseconds: (v * dur).round()));
                          }
                        : null,
                  ),
                ),
              ),
              Text(_fmt(_duration), style: _timeStyle()),
            ],
          ),
          Row(
            children: [
              _circleButton(_playing ? Icons.pause : Icons.play_arrow, _togglePlay),
              _circleButton(_muted ? Icons.volume_off : Icons.volume_up, _toggleMute),
            ],
          ),
        ],
      ),
    );
  }

  TextStyle _timeStyle() => labelStyle(
        size: 13,
        weight: FontWeight.w500,
        color: AppColors.ink,
        tracking: 0,
      );

  Widget _circleButton(IconData icon, VoidCallback onTap) {
    return _CircleControl(size: 46, iconSize: 23, icon: icon, onTap: onTap, subtle: true);
  }

  static String _fmt(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    final s = d.inSeconds.remainder(60);
    String two(int n) => n.toString().padLeft(2, '0');
    return h > 0 ? '$h:${two(m)}:${two(s)}' : '${two(m)}:${two(s)}';
  }
}

class _CircleControl extends StatefulWidget {
  final double size;
  final double iconSize;
  final IconData icon;
  final VoidCallback onTap;
  final bool subtle;
  const _CircleControl({
    required this.size,
    required this.iconSize,
    required this.icon,
    required this.onTap,
    this.subtle = false,
  });

  @override
  State<_CircleControl> createState() => _CircleControlState();
}

class _CircleControlState extends State<_CircleControl> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          width: widget.size,
          height: widget.size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: widget.subtle
                ? (_hover ? const Color(0x29F2EFE6) : Colors.transparent)
                : const Color(0x800A0907),
            border: widget.subtle
                ? null
                : Border.all(color: const Color(0x80F2EFE6), width: 2),
          ),
          child: Icon(widget.icon, size: widget.iconSize, color: AppColors.ink),
        ),
      ),
    );
  }
}
