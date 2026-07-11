/// Core domain types, ported from the Android app's `data/Models.kt` and the
/// web app's `xtream.js`. Kept deliberately small — a browsable [Stream] is a
/// live channel, a movie, or a series; [Episode] is one series episode.
enum StreamType { live, vod, series }

extension StreamTypeApi on StreamType {
  /// Stable string used for favorites persistence + equality across app runs.
  /// Matches the tokens the web/Android apps store ("LIVE"/"VOD"/"SERIES").
  String get wire {
    switch (this) {
      case StreamType.live:
        return 'LIVE';
      case StreamType.vod:
        return 'VOD';
      case StreamType.series:
        return 'SERIES';
    }
  }

  static StreamType fromWire(String s) {
    switch (s) {
      case 'VOD':
        return StreamType.vod;
      case 'SERIES':
        return StreamType.series;
      default:
        return StreamType.live;
    }
  }
}

class Category {
  final String id;
  final String name;
  const Category(this.id, this.name);
}

class Stream {
  final String id;
  final String name;
  final String? icon;
  final StreamType type;
  final String? containerExt;

  const Stream({
    required this.id,
    required this.name,
    required this.type,
    this.icon,
    this.containerExt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'icon': icon,
        'type': type.wire,
        'containerExt': containerExt,
      };

  factory Stream.fromJson(Map<String, dynamic> j) => Stream(
        id: (j['id'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        icon: j['icon'] as String?,
        type: StreamTypeApi.fromWire((j['type'] ?? 'LIVE').toString()),
        containerExt: j['containerExt'] as String?,
      );
}

class Episode {
  final String id;
  final String title;
  final int season;
  final String? containerExt;

  const Episode({
    required this.id,
    required this.title,
    required this.season,
    this.containerExt,
  });
}
