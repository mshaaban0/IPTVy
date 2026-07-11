import 'package:flutter/material.dart';

/// The "warm risograph" palette, translated 1:1 from the web app's `style.css`.
/// Cream ink on a warm near-black ground, one brick-red accent, drawn 2px
/// borders, monospace type, uppercase wide-tracked labels. Keeping the exact
/// tokens means the desktop build reads as part of the same family as the
/// Android and web apps.
class AppColors {
  static const bg = Color(0xFF15120C);
  static const bg2 = Color(0xFF1C180F);
  static const surface = Color(0xFF221C12);
  static const sunk = Color(0xFF100D08);

  static const ink = Color(0xFFF2EFE6);
  static const mid = Color(0xFFB7B09A);
  static const dim = Color(0xFF837B66);
  static const line = Color(0xFF463F2E);
  static const lineStrong = Color(0xFF6B6047);

  static const red = Color(0xFFCE4524);
  static const redDeep = Color(0xFFE25A35);
  static const amber = Color(0xFFE8A948);
}

/// Monospace stack. If "IBM Plex Mono" isn't installed we fall through to the
/// platform's monospace so the typographic rhythm (tabular, even) survives.
const List<String> _monoFallback = <String>[
  'IBM Plex Mono',
  'Cascadia Mono',
  'Consolas',
  'Menlo',
  'DejaVu Sans Mono',
  'monospace',
];

const String _displayFamily = 'Martian Mono';

/// A label style: uppercase, wide letter-spacing, monospace — used for tabs,
/// buttons, field labels and section captions throughout the UI.
TextStyle labelStyle({
  double size = 12,
  FontWeight weight = FontWeight.w600,
  Color color = AppColors.mid,
  double tracking = 0.14,
}) =>
    TextStyle(
      fontFamilyFallback: _monoFallback,
      fontSize: size,
      fontWeight: weight,
      color: color,
      letterSpacing: size * tracking,
      height: 1.2,
    );

/// A "display" style for brand marks and titles — tighter, heavier.
TextStyle displayStyle({
  double size = 19,
  FontWeight weight = FontWeight.w700,
  Color color = AppColors.ink,
}) =>
    TextStyle(
      fontFamily: _displayFamily,
      fontFamilyFallback: _monoFallback,
      fontSize: size,
      fontWeight: weight,
      color: color,
      letterSpacing: -0.3,
      height: 1.1,
    );

ThemeData buildTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: AppColors.bg,
    canvasColor: AppColors.bg,
    colorScheme: base.colorScheme.copyWith(
      brightness: Brightness.dark,
      primary: AppColors.red,
      secondary: AppColors.amber,
      surface: AppColors.surface,
      onSurface: AppColors.ink,
    ),
    textTheme: base.textTheme.apply(
      fontFamilyFallback: _monoFallback,
      bodyColor: AppColors.ink,
      displayColor: AppColors.ink,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: const BoxDecoration(color: AppColors.surface),
      textStyle: labelStyle(color: AppColors.ink, tracking: 0.06),
    ),
    splashFactory: NoSplash.splashFactory,
    highlightColor: Colors.transparent,
  );
}

/// A hard red offset "plate" behind a surface — the risograph signature. Used
/// on the login card. Rendered as a Stack, not a blurred shadow.
class OffsetPlate extends StatelessWidget {
  final Widget child;
  final Offset offset;
  final Color color;
  const OffsetPlate({
    super.key,
    required this.child,
    this.offset = const Offset(8, 8),
    this.color = AppColors.red,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(
          child: Transform.translate(
            offset: offset,
            child: Container(color: color),
          ),
        ),
        child,
      ],
    );
  }
}
