# IPTVy Desktop (Electron)

A thin Electron wrapper that runs the **web build's own local host** in-process
and points a window at it. The renderer loads `http://127.0.0.1:<port>/app/` —
the same static app and the same `/api/proxy` handler that production (Vercel)
serves — so the desktop app is the web app, byte for byte. There is no separate
code path: `main.mjs` imports `createIptvyServer()` from `../dev-server.mjs`.

Because it serves over plain `http://127.0.0.1`, there's no mixed-content block,
so it talks to `http://` Xtream panels directly and only falls back to the proxy
for CORS-blocked ones — identical to running `node web/dev-server.mjs` in a
browser. The host binds to `127.0.0.1` on an OS-assigned free port, so nothing is
exposed off-machine and two instances never collide.

## Run

```sh
cd web/electron
npm install
npm start
```

## Package

```sh
npm run dist        # → web/electron/dist/ (AppImage / dmg / nsis)
```

Packaging copies `web/app`, `web/api`, and `web/dev-server.mjs` into the app's
resources (see `extraResources` in `package.json`); `main.mjs` resolves the host
from `resources/web/` when `app.isPackaged`.
