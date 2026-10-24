// DOCUMENTS: the editable filesystem renderer — every WebServer card's
// filesystem list (#server-fs-list / #server-2-fs-list) renders its own
// snapshot server's live fs Map (insertion order: "/", "/about"), so the
// panel rows are the sim's view, not static markup. Rows are a two-column
// grid (path sized to content; body single-line with ellipsis and the full
// text on the row's title tooltip) and carry a hover/focus-revealed pencil
// that swaps that row into an inline editor: "<input> + save + cancel",
// Enter commits, Escape cancels, and save is disabled while the draft is
// unchanged or empty. Commit writes through engine.setWebFile
// (invalidating nothing — the cache ages out by TTL), then re-renders from
// the fresh snapshot. All behavior is delegated with addEventListener (no
// inline handlers — AGENTS.md CSP rule) and lives in this module; panel.js
// supplies only the engine accessor and the re-render callback.
//
// CHECKS: one edit in flight per card max; route-id attribute parity with
// the static rows — stage-1 server rows keep id + `data-file="route-*"`,
// the server-2 card keeps `data-file-2="route-*"` — so renderRoutes()'s
// .matched-route good-soft highlight behaves on rendered rows exactly as
// on the old static markup. Counter-example (pinned): an Escape or a
// saved-empty draft never reaches the engine — setWebFile is called only
// for a changed, non-empty draft.

const CARDS = [
  { listId: 'server-fs-list', serverIndex: 0, serverAttr: 'data-file' },
  { listId: 'server-2-fs-list', serverIndex: 1, serverAttr: 'data-file-2' },
];

// routeIdFor mirrors the sim's routeId rule (webserver.js routeIdFor): the
// served GET's routeId is what renderRoutes() matches against the row.
const routeIdFor = (path) => (path === '/' ? 'route-home' : `route-${path.slice(1)}`);

// One edit in flight per card: the fs path being edited. The draft lives in
// the input element itself, so crowd-tick re-renders mid-edit keep typing,
// focus and caret — the mount keeps the live editor row element across
// render passes instead of rebuilding it.
const editingPath = {};
for (const card of CARDS) editingPath[card.listId] = null;

let lastSnapshot = null;

function displayRowFor(path, body, { serverAttr, isServer1 }) {
  const li = document.createElement('li');
  li.className = 'route-item';
  li.dataset.fsPath = path;
  const routeId = routeIdFor(path);
  if (isServer1) {
    li.id = routeId;
    li.setAttribute(serverAttr, routeId);
  } else {
    li.setAttribute(serverAttr, routeId);
  }

  const pathSpan = document.createElement('span');
  pathSpan.className = 'fs-path';
  pathSpan.textContent = path;

  const bodySpan = document.createElement('span');
  bodySpan.className = 'fs-body';
  bodySpan.textContent = body;
  bodySpan.title = body;

  const pencil = document.createElement('button');
  pencil.type = 'button';
  pencil.className = 'fs-edit';
  pencil.textContent = '✎';
  pencil.title = 'Edit file body';
  pencil.setAttribute('aria-label', `Edit ${path}`);

  li.append(pathSpan, bodySpan, pencil);
  return li;
}

function editorRowFor(path, originalBody, { serverAttr, isServer1 }) {
  const li = document.createElement('li');
  li.className = 'route-item fs-editing';
  li.dataset.fsPath = path;
  const routeId = routeIdFor(path);
  if (isServer1) {
    li.id = routeId;
    li.setAttribute(serverAttr, routeId);
  } else {
    li.setAttribute(serverAttr, routeId);
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fs-input';
  input.value = originalBody;
  input.dataset.fsOriginal = originalBody;
  input.setAttribute('aria-label', `New content for ${path}`);

  const commit = document.createElement('button');
  commit.type = 'button';
  commit.className = 'fs-commit';
  commit.textContent = '✔';
  commit.title = 'Save file';
  commit.setAttribute('aria-label', `Save ${path}`);
  // Unchanged draft -> wait for a real edit; the input delegation flips it.
  commit.disabled = true;

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'fs-cancel';
  cancel.textContent = '✕';
  cancel.title = 'Cancel editing';
  cancel.setAttribute('aria-label', `Cancel editing ${path}`);

  li.append(input, commit, cancel);
  return li;
}

function renderCard(container, card, server, liveEditor) {
  const files = Object.entries(server?.files ?? {});
  const isNew = !liveEditor;
  container.replaceChildren(
    ...files.flatMap(([path, body]) => {
      if (editingPath[card.listId] !== path) {
        return [
          displayRowFor(path, body, {
            serverAttr: card.serverAttr,
            isServer1: card.serverIndex === 0,
          }),
        ];
      }
      // Edit in flight: keep the live editor row element across passes so
      // typing, focus and caret survive crowd ticks.
      return isNew
        ? [
            editorRowFor(path, body, {
              serverAttr: card.serverAttr,
              isServer1: card.serverIndex === 0,
            }),
          ]
        : [liveEditor];
    }),
  );
}

// Every render pass: both cards rebuild from the snapshot's own servers —
// on Stage 1 the second card renders empty (its server does not exist).
export function renderFilesystems(snapshot) {
  lastSnapshot = snapshot;
  const servers = snapshot.servers ?? [];
  for (const card of CARDS) {
    const container = document.getElementById(card.listId);
    if (!container) continue;
    const server = servers[card.serverIndex] ?? null;
    container.dataset.serverAddress = server ? server.address : '';
    const liveEditor = container.querySelector('.fs-editing');
    renderCard(container, card, server, liveEditor);
  }
}

function startEdit(listId, path) {
  editingPath[listId] = path;
  renderFilesystems(lastSnapshot);
  document.getElementById(listId)?.querySelector('.fs-input')?.focus();
}

function closeEdit(listId, rerender) {
  editingPath[listId] = null;
  // Escape re-renders from the EXISTING snapshot — the fs was not touched.
  rerender(lastSnapshot);
}

function commitEdit(listId, getEngine, rerender) {
  const container = document.getElementById(listId);
  const input = container?.querySelector('.fs-input');
  const commit = container?.querySelector('.fs-commit');
  if (!input || !commit || commit.disabled) return;
  getEngine().setWebFile(container.dataset.serverAddress, editingPath[listId], input.value);
  editingPath[listId] = null;
  rerender(getEngine().snapshot());
}

function wireCard(container, listId, getEngine, rerender) {
  container.addEventListener('click', (e) => {
    if (e.target.closest('.fs-edit')) {
      const path = e.target.closest('.route-item').dataset.fsPath;
      if (editingPath[listId] === null) startEdit(listId, path);
      return;
    }
    if (e.target.closest('.fs-cancel')) {
      closeEdit(listId, rerender);
      return;
    }
    if (e.target.closest('.fs-commit')) commitEdit(listId, getEngine, rerender);
  });

  container.addEventListener('input', (e) => {
    const input = e.target.closest('.fs-input');
    if (!input) return;
    const commit = container.querySelector('.fs-commit');
    // Disabled while the draft is unchanged or empty — an unchanged or
    // empty draft must not reach the sim.
    commit.disabled = input.value === input.dataset.fsOriginal || input.value.length === 0;
  });

  container.addEventListener('keydown', (e) => {
    if (e.target.closest('.fs-input') === null) return;
    if (e.key === 'Enter') {
      // commitEdit is a no-op while the save is disabled (unchanged/empty
      // draft) — the disabled control does not reach the engine.
      commitEdit(listId, getEngine, rerender);
      return;
    }
    if (e.key === 'Escape') closeEdit(listId, rerender);
  });
}

export function initFilesystemEditor({ getEngine, rerender }) {
  for (const card of CARDS) {
    const container = document.getElementById(card.listId);
    if (container) wireCard(container, card.listId, getEngine, rerender);
  }
}
