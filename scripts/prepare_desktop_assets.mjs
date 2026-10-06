import { existsSync, rmSync } from "node:fs";

// Native library reads use Rust's bundled resources. Keep one copy of the
// books instead of embedding another 1.2 GB into the frontend executable.
// This path is Vite's generated output; neither public/ nor user data is touched.
const index = new URL("../dist/index.html", import.meta.url);
if (!existsSync(index)) throw new Error("Build the frontend before preparing desktop assets.");
rmSync(new URL("../dist/books", import.meta.url), { recursive: true, force: true });
console.log("Desktop assets prepared; books remain in bundled native resources.");
