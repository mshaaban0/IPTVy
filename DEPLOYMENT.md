# Deployment

IPTVy ships two artifacts from one repo:

- **The Android APK** — built from `app/`, signed, and published as a GitHub Release asset.
- **The download page** — the static site in `web/` (`iptvy.space`), hosted on Vercel,
  which serves the latest `iptvy.apk`.

Both are produced automatically by CI on every push to `main`. Manual steps are
documented below as a fallback.

## Automated release (CI)

The workflow lives at [`.github/workflows/release.yml`](.github/workflows/release.yml)
and runs on every push to `main`:

1. **build** — sets up JDK 17 + Android SDK 34 and runs `./gradlew assembleRelease`.
   The signed APK is uploaded as a workflow artifact.
2. **release** — if a tag `v<versionName>` does **not** already exist, creates that
   tag and a GitHub Release with auto-generated notes and the APK attached. If the
   version is unchanged from a previous release, this job is skipped — so routine
   pushes don't spam releases.
3. **deploy** — copies the fresh APK into `web/iptvy.apk`, syncs the version label in
   `web/index.html`, and deploys `web/` to Vercel production.

### Cutting a new release

Bump the version and push to `main`:

```kotlin
// app/build.gradle.kts
versionCode = 8        // increment by 1
versionName = "1.7"    // user-facing version
```

```bash
git commit -am "fix: <what changed>; release v1.7"
git push origin main
```

CI builds, creates Release **v1.7** with the APK, and redeploys the download page.
No manual tagging or APK uploads needed.

> The version is read from `versionName` in `app/build.gradle.kts` — that file is the
> single source of truth. The APK filename, the git tag, the GitHub Release name, and
> the version label on the download page are all derived from it in CI.

## Required configuration

### Repository secret

| Secret | Where to get it | Used for |
| --- | --- | --- |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens | Authenticating the production deploy |

Add it under **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**.

The Vercel org/project IDs are set as plain `env` in the workflow (they identify the
project, they don't authorize anything):

- `VERCEL_ORG_ID = team_Zz5TijIwy2xJGwSxjHfVLPtO`
- `VERCEL_PROJECT_ID = prj_xDm0KZTQIKGzuxpNiSULaHsppJNk`

### Signing

No CI secrets are needed for signing: the keystore `iptvy-release.jks` and its
passwords are committed and referenced directly from the `signingConfigs` block in
`app/build.gradle.kts`.

> **Security note:** committing a release keystore and its passwords means anyone with
> repo access can sign builds as IPTVy. That's acceptable for a hobby/internal app but
> is not best practice. To harden it later: remove the keystore from the repo, store a
> base64 copy plus the passwords as GitHub secrets, and decode them in the build job.

## Manual fallback

If you need to build and deploy by hand (e.g. CI is down), from the repo root with the
[userspace toolchain](README.md) available:

```bash
# Build the signed APK into dist/ (also copies to web/iptvy.apk)
./build.sh

# Deploy the download page to Vercel production
cd web
vercel deploy --prod --yes
```

Then create the GitHub Release manually:

```bash
VERSION=$(grep -oP 'versionName\s*=\s*"\K[^"]+' app/build.gradle.kts)
git tag "v$VERSION" && git push origin "v$VERSION"
gh release create "v$VERSION" "dist/IPTVy-$VERSION-release.apk" --generate-notes
```

> `build.sh` hardcodes the APK filename version — keep it in sync with `versionName`
> when releasing manually. CI derives everything automatically and has no such gotcha.

## Verifying a deploy

```bash
curl -s https://iptvy.space/ | grep -o 'v[0-9.]*'                 # version label
curl -sI https://iptvy.space/iptvy.apk | grep -i content-length   # APK is served
```
