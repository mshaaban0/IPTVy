import 'package:flutter/material.dart';

import '../data/prefs.dart';
import '../main.dart';
import '../theme.dart';
import 'home_page.dart';

/// Credentials screen, ported from `LoginActivity` / the web `loginView`.
/// Server URL + username + password, validated against `player_api.php`.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _server = TextEditingController();
  final _user = TextEditingController();
  final _pass = TextEditingController();
  bool _busy = false;
  String _status = '';

  @override
  void initState() {
    super.initState();
    // Prefill from whatever was last saved (e.g. after a logout).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final prefs = AppScope.of(context).prefs;
      _server.text = prefs.server;
      _user.text = prefs.username;
      _pass.text = prefs.password;
    });
  }

  @override
  void dispose() {
    _server.dispose();
    _user.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _attemptLogin() async {
    final scope = AppScope.of(context);
    final server = Prefs.normalize(_server.text);
    final user = _user.text.trim();
    final pass = _pass.text.trim();
    if (server.isEmpty || user.isEmpty) {
      setState(() => _status = 'Enter server and username');
      return;
    }
    setState(() {
      _busy = true;
      _status = 'Connecting…';
    });
    await scope.prefs.save(server, user, pass);
    // The client reads credentials from prefs live on each request, so saving is
    // enough — no need to rebuild it before validating.
    bool ok;
    try {
      ok = await scope.client.login();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _status = 'Error: $e';
      });
      return;
    }
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomePage()),
      );
    } else {
      setState(() {
        _busy = false;
        _status = 'Login failed — check credentials/server';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: OffsetPlate(
            child: Container(
              width: 452,
              padding: const EdgeInsets.fromLTRB(38, 40, 38, 34),
              decoration: BoxDecoration(
                color: AppColors.surface,
                border: Border.all(color: AppColors.ink, width: 2),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _brand(),
                  const SizedBox(height: 16),
                  Text(
                    'Xtream Codes player',
                    style: labelStyle(
                      size: 13.5,
                      weight: FontWeight.w500,
                      color: AppColors.mid,
                      tracking: 0,
                    ),
                  ),
                  const SizedBox(height: 28),
                  _field('Server', _server, hint: 'http://panel.example:8080'),
                  _field('Username', _user),
                  _field('Password', _pass, obscure: true, onSubmit: _attemptLogin),
                  const SizedBox(height: 10),
                  _loginButton(),
                  const SizedBox(height: 16),
                  SizedBox(
                    height: 20,
                    child: Center(
                      child: Text(
                        _status,
                        style: labelStyle(
                          size: 13,
                          weight: FontWeight.w500,
                          color: AppColors.mid,
                          tracking: 0,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _brand() {
    return Row(
      children: [
        Container(
          width: 50,
          height: 50,
          decoration: BoxDecoration(
            color: AppColors.red,
            border: Border.all(color: AppColors.ink, width: 2),
          ),
          child: const Icon(Icons.play_arrow_rounded, color: AppColors.ink, size: 26),
        ),
        const SizedBox(width: 13),
        Text('IPTVy', style: displayStyle(size: 27, weight: FontWeight.w700)),
      ],
    );
  }

  Widget _field(
    String label,
    TextEditingController controller, {
    String? hint,
    bool obscure = false,
    VoidCallback? onSubmit,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            label.toUpperCase(),
            style: labelStyle(size: 11, tracking: 0.16),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: controller,
            obscureText: obscure,
            enabled: !_busy,
            onSubmitted: (_) => onSubmit?.call(),
            style: labelStyle(
              size: 15,
              weight: FontWeight.w500,
              color: AppColors.ink,
              tracking: 0,
            ),
            cursorColor: AppColors.red,
            decoration: InputDecoration(
              isDense: true,
              hintText: hint,
              hintStyle: labelStyle(
                size: 15,
                weight: FontWeight.w500,
                color: AppColors.dim,
                tracking: 0,
              ),
              filled: true,
              fillColor: AppColors.bg,
              contentPadding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
              border: _border(AppColors.ink),
              enabledBorder: _border(AppColors.ink),
              focusedBorder: _border(AppColors.red, width: 3),
              disabledBorder: _border(AppColors.line),
            ),
          ),
        ],
      ),
    );
  }

  OutlineInputBorder _border(Color color, {double width = 2}) => OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: color, width: width),
      );

  Widget _loginButton() {
    return SizedBox(
      height: 48,
      child: FilledButton(
        onPressed: _busy ? null : _attemptLogin,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.red,
          disabledBackgroundColor: AppColors.red.withValues(alpha: 0.5),
          foregroundColor: AppColors.ink,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.zero,
            side: const BorderSide(color: AppColors.ink, width: 2),
          ),
        ),
        child: Text('Connect', style: displayStyle(size: 14, color: AppColors.ink)),
      ),
    );
  }
}
