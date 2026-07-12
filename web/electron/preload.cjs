/*
 * Preload — deliberately minimal. The app is the unmodified web build and needs
 * no privileged bridge; context isolation stays on and no Node APIs are exposed
 * to the renderer. This file exists only so webPreferences.preload has a target
 * (and gives us a seam if the desktop app ever needs a native capability).
 */
