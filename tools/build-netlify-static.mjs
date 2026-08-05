import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const distDir = join(root, "dist");
const vinextCli = join(root, "node_modules", "vinext", "dist", "cli.js");
const windowsStaticExportShutdownError =
  "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)";

function validateStaticExport(output) {
  const indexPath = join(distDir, "client", "index.html");
  const rscPath = join(distDir, "client", "index.rsc");

  if (!existsSync(indexPath) || !existsSync(rscPath)) {
    return false;
  }

  const html = readFileSync(indexPath, "utf8");
  return (
    html.includes("<title>Jason + Ania | Globe</title>") &&
    html.includes("__VINEXT_RSC_NAV__") &&
    html.includes('href="/assets/') &&
    output.includes("Build complete")
  );
}

rmSync(distDir, { recursive: true, force: true });

const child = spawn(process.execPath, [vinextCli, "build"], {
  cwd: root,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

const exitCode = await new Promise((resolve) => {
  child.on("close", resolve);
});

if (exitCode === 0) {
  process.exit(0);
}

if (
  process.platform === "win32" &&
  output.includes(windowsStaticExportShutdownError) &&
  validateStaticExport(output)
) {
  console.warn(
    "[build] Vinext completed the static export, then hit a Windows-only shutdown assertion. Verified dist/client/index.html and continuing.",
  );
  process.exit(0);
}

process.exit(exitCode ?? 1);
