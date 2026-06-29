# Deployment

IPTVy ships two artifacts from one repo:

- **The Android APK** — built from `app/`, signed, and published as a **GitHub Release**
  asset. The release is the canonical home of the binary; no APK is committed to git.
- **The download page** — the static site in `web/` (`iptvy.space`), hosted on **Vercel**.
  Its `/iptvy.apk` link redirects to the APK on the latest GitHub Release.

The two halves are deployed by two independent automations, both triggered by a push to
`main`:

| Concern | Automation | Config |
| --- | --- | --- |
| Build + sign APK, publish GitHub Release | GitHub Actions | [`.github/workflows/release.yml`](.github/workflows/release.yml) |
| Deploy the `web/` download page | Vercel Git integration | Vercel dashboard (project `web`) |

They don't overlap: CI never touches Vercel, and Vercel never builds the APK.

## How a release works

1. Bump the version in `app/build.gradle.kts` and push to `main`:

   ```kotlin
   versionCode = 8        // increment by 1
   versionName = "1.7"    // user-facing version
   ```

   ```bash
   git commit -am "fix: <what changed>; release v1.7"
   git push origin main
   ```

2. **GitHub Actions** (`release.yml`):
   - `build` — sets up JDK 17 + Android SDK 34 and runs `./gradlew assembleRelease`.
     Runs on every push as a build check.
   - `release` — only if tag `v<versionName>` does **not** already exist: creates that
     tag and a GitHub Release with auto-generated notes and two assets —
     `IPTVy-<version>-release.apk` (versioned) and `iptvy.apk` (stable name). If the
     version is unchanged, this job is skipped, so routine pushes don't spam releases.

3. **Vercel** sees the same push and redeploys `web/` to production. Because
   `web/vercel.json` redirects `/iptvy.apk` → `releases/latest/download/iptvy.apk`, the
   download page automatically serves whatever the newest release contains — no APK is
   copied or committed.

> `versionName` in `app/build.gradle.kts` is the single source of truth. The APK
> filename, git tag, and GitHub Release name are all derived from it in CI.

## Required configuration

### GitHub Actions

No repository secrets are required. Signing uses the in-repo keystore
`iptvy-release.jks` with passwords in the `signingConfigs` block of
`app/build.gradle.kts`. The default `GITHUB_TOKEN` (granted `contents: write` in the
workflow) is enough to create tags and releases.

> **Security note:** committing a release keystore and its passwords means anyone with
> repo access can sign builds as IPTVy. Acceptable for a hobby/internal app, but not
> best practice. To harden later: remove the keystore from the repo, store a base64
> copy plus the passwords as GitHub secrets, and decode them in the build job.

### Vercel

The `web` project must be connected to this GitHub repo (done via the Vercel
dashboard → Project → Settings → Git). Two settings to verify:

- **Root Directory** = `web` (the site lives there, not at the repo root).
- **Production Branch** = `main`.

No `VERCEL_TOKEN` is needed anywhere — deployment is driven by Vercel's Git
integration, not by CI.

## Manual fallback

If CI is unavailable, from the repo root with the [userspace toolchain](README.md):

```bash
# 1. Build the signed APK into dist/
./build.sh

# 2. Publish a GitHub Release with BOTH the versioned and stable-named asset
VERSION=$(grep -oP 'versionName\s*=\s*"\K[^"]+' app/build.gradle.kts)
cp "dist/IPTVy-$VERSION-release.apk" /tmp/iptvy.apk
git tag "v$VERSION" && git push origin "v$VERSION"
gh release create "v$VERSION" \
  "dist/IPTVy-$VERSION-release.apk" /tmp/iptvy.apk \
  --title "IPTVy v$VERSION" --generate-notes
```

The download page needs no manual step — it always points at the latest release. If
you ever deploy the page by hand: `cd web && vercel deploy --prod --yes`.

> The `iptvy.apk` asset (stable name) is what `web/vercel.json` redirects to. Every
> release must include it, or the download link 404s. CI attaches it automatically.

## Verifying a deploy

```bash
curl -s https://iptvy.space/ | grep -o 'v[0-9.]*'                          # version label on the page
curl -sIL https://iptvy.space/iptvy.apk | grep -iE 'location|content-length' # redirect resolves to the APK
```
