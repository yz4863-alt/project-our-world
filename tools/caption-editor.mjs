import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataPath = path.join(projectRoot, "app", "tripData.json");
const publicRoot = path.join(projectRoot, "public");
const port = Number(process.env.CAPTION_PORT ?? 8787);

async function readTripData() {
  const source = await readFile(dataPath, "utf8");
  return JSON.parse(source);
}

async function writeTripData(data) {
  await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function parseRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function servePhoto(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const filePath = path.resolve(publicRoot, requestUrl.pathname.slice(1));

  if (!filePath.startsWith(publicRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "content-type": "image/jpeg",
      "cache-control": "no-store",
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

function html() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Caption Editor</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #090c0d;
        --panel: #101616;
        --line: rgba(246, 240, 223, 0.14);
        --text: #f6f0df;
        --muted: rgba(246, 240, 223, 0.64);
        --accent: #f2bd6c;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: Arial, Helvetica, sans-serif;
      }

      button,
      textarea {
        font: inherit;
      }

      .shell {
        display: grid;
        grid-template-columns: 250px 1fr;
        min-height: 100vh;
      }

      .sidebar {
        border-right: 1px solid var(--line);
        background: #0c1111;
        padding: 18px;
      }

      .brand {
        margin-bottom: 18px;
      }

      .brand strong {
        display: block;
        color: var(--accent);
        font-size: 1.1rem;
        line-height: 1;
        text-transform: uppercase;
      }

      .brand span {
        display: block;
        margin-top: 6px;
        color: var(--muted);
        font-size: 0.78rem;
      }

      .locations {
        display: grid;
        gap: 6px;
      }

      .location-button {
        width: 100%;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        padding: 10px;
        text-align: left;
      }

      .location-button:hover,
      .location-button.is-active {
        border-color: rgba(242, 189, 108, 0.34);
        background: rgba(242, 189, 108, 0.1);
      }

      .location-button span {
        display: block;
        color: var(--muted);
        font-size: 0.75rem;
        margin-top: 3px;
      }

      .main {
        min-width: 0;
        padding: 22px;
      }

      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }

      .toolbar h1 {
        margin: 0;
        font-size: 1.8rem;
        line-height: 1;
      }

      .status {
        color: var(--muted);
        font-size: 0.86rem;
      }

      .save-button {
        min-height: 40px;
        border: 1px solid rgba(242, 189, 108, 0.58);
        border-radius: 6px;
        background: rgba(242, 189, 108, 0.13);
        color: var(--accent);
        cursor: pointer;
        padding: 0 14px;
      }

      .save-button:hover {
        background: rgba(242, 189, 108, 0.2);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 14px;
      }

      .photo-card {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        overflow: hidden;
      }

      .photo-card img {
        display: block;
        width: 100%;
        aspect-ratio: 4 / 5;
        object-fit: cover;
        background: rgba(246, 240, 223, 0.08);
      }

      .photo-fields {
        display: grid;
        gap: 8px;
        padding: 12px;
      }

      .photo-fields label {
        color: var(--muted);
        font-size: 0.78rem;
      }

      .photo-fields textarea {
        min-height: 92px;
        resize: vertical;
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.05);
        color: var(--text);
        outline: none;
        padding: 10px;
      }

      .photo-fields textarea:focus {
        border-color: rgba(242, 189, 108, 0.82);
        box-shadow: 0 0 0 3px rgba(242, 189, 108, 0.12);
      }

      @media (max-width: 760px) {
        .shell {
          grid-template-columns: 1fr;
        }

        .sidebar {
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }

        .locations {
          display: flex;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .location-button {
          flex: 0 0 190px;
        }

        .toolbar {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <strong>Jason + Ania</strong>
          <span>Caption editor</span>
        </div>
        <nav class="locations" id="locations"></nav>
      </aside>
      <main class="main">
        <div class="toolbar">
          <div>
            <h1 id="title"></h1>
            <div class="status" id="status">Loading</div>
          </div>
          <button class="save-button" id="save" type="button">Save captions</button>
        </div>
        <section class="grid" id="photos"></section>
      </main>
    </div>
    <script>
      let data;
      let activeLocationId;
      let dirty = false;

      const locationsEl = document.querySelector("#locations");
      const photosEl = document.querySelector("#photos");
      const titleEl = document.querySelector("#title");
      const statusEl = document.querySelector("#status");
      const saveEl = document.querySelector("#save");

      function setStatus(text) {
        statusEl.textContent = text;
      }

      function activeLocation() {
        return data.locations.find((location) => location.id === activeLocationId);
      }

      function renderLocations() {
        locationsEl.innerHTML = "";
        data.locations.forEach((location) => {
          const button = document.createElement("button");
          button.className = "location-button" + (location.id === activeLocationId ? " is-active" : "");
          button.type = "button";
          button.innerHTML = \`\${location.name}<span>\${location.photos.length} photos</span>\`;
          button.addEventListener("click", () => {
            activeLocationId = location.id;
            render();
          });
          locationsEl.append(button);
        });
      }

      function renderPhotos() {
        const location = activeLocation();
        titleEl.textContent = location.name;
        photosEl.innerHTML = "";

        location.photos.forEach((photo) => {
          const card = document.createElement("article");
          card.className = "photo-card";
          card.innerHTML = \`
            <img src="\${photo.thumb}" alt="" />
            <div class="photo-fields">
              <label for="\${photo.id}">\${photo.title}</label>
              <textarea id="\${photo.id}" data-photo-id="\${photo.id}" placeholder="Caption"></textarea>
            </div>
          \`;
          const textarea = card.querySelector("textarea");
          textarea.value = photo.caption || "";
          textarea.addEventListener("input", () => {
            photo.caption = textarea.value;
            dirty = true;
            setStatus("Unsaved changes");
          });
          photosEl.append(card);
        });
      }

      function render() {
        renderLocations();
        renderPhotos();
        setStatus(dirty ? "Unsaved changes" : "All captions saved");
      }

      async function load() {
        const response = await fetch("/api/data");
        data = await response.json();
        activeLocationId = data.locations[0]?.id;
        render();
      }

      async function save() {
        setStatus("Saving");
        const response = await fetch("/api/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          setStatus("Save failed");
          return;
        }
        dirty = false;
        setStatus("All captions saved");
      }

      saveEl.addEventListener("click", save);
      window.addEventListener("beforeunload", (event) => {
        if (!dirty) return;
        event.preventDefault();
        event.returnValue = "";
      });
      load();
    </script>
  </body>
</html>`;
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);

  try {
    if (request.method === "GET" && requestUrl.pathname === "/") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(html());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/data") {
      sendJson(response, 200, await readTripData());
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/save") {
      await writeTripData(await parseRequestBody(request));
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname.startsWith("/photos/")) {
      await servePhoto(request, response);
      return;
    }

    response.writeHead(404);
    response.end("Not found");
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Caption editor: http://127.0.0.1:${port}/`);
});
