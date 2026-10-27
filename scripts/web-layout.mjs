// Vercel only: make the splash page the site's homepage.
// The game's page moves to play.html (served at /play); landing.html becomes index.html.
// The iPhone/Android builds use the normal `npm run build` and keep the game at index.html.
import { copyFileSync, renameSync } from "node:fs";
renameSync("dist/index.html", "dist/play.html");
copyFileSync("dist/landing.html", "dist/index.html");
console.log("web layout: / = splash page, /play = game");
