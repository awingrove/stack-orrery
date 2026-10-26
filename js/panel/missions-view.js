// DOCUMENTS: the missions section of the teaching drawer (B-2) — the
// DOM-bound module owning the section's build, per-snapshot status refresh,
// and the verified-set lifecycle. Pure statuses come from missions.js
// (missionStatuses); completions (mission id -> completing tick) live in
// page memory only: a stage switch clears the whole verified set, a reload
// starts empty. panel.html stays untouched — the section is JS-built inside
// the existing .teaching-panel aside (the compare tray injection precedent),
// after the per-stage narrative a later renderTeaching repaints.
import { MISSIONS, missionStatuses } from './missions.js';

let stage = null;
const verified = new Map(); // mission id -> completing sim tick
let section = null;
const chips = new Map(); // mission id -> status chip element

function buildRow(mission) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'mission-item';
  item.dataset.testid = 'mission-item';
  const goal = document.createElement('span');
  goal.className = 'mission-goal';
  goal.textContent = mission.goal;
  const chip = document.createElement('span');
  chip.className = 'mission-chip';
  chip.dataset.testid = 'mission-status';
  item.append(goal, chip);
  chips.set(mission.id, chip);
  if (mission.url) {
    item.title = `Prefills the mini-browser: ${mission.url}`;
    // CHECKS: pre-fill is input-only — the click fills #url-input and
    // nothing else; dispatching the Go button (or any auto-send) is a
    // defect (named counter-example pinned in e2e/missions.spec.js).
    item.addEventListener('click', () => {
      const input = document.getElementById('url-input');
      if (input) input.value = mission.url;
    });
  }
  return item;
}

function rebuild() {
  section?.remove();
  section = null;
  chips.clear();
  const list = MISSIONS[stage] ?? [];
  // An unknown stage renders no rows at all: no section, no empty shell.
  const aside = list.length > 0 ? document.getElementById('teaching-panel') : null;
  if (!aside) return;
  const node = document.createElement('div');
  node.className = 'missions-section';
  node.dataset.testid = 'missions-section';
  const heading = document.createElement('p');
  heading.className = 'teaching-list-title';
  heading.textContent = 'Missions';
  node.append(heading);
  for (const mission of list) node.append(buildRow(mission));
  section = node;
  aside.append(section);
}

// CHECKS: cheap on every snapshot — rows persist across updates and a
// chip's text is written only when it changes, so crowd ticks leave a done
// row byte-identical and a pending row moves only when its readout moves.
// Statuses flip `○ <progress>` -> `✓ done · tick <N>`; completions latch
// into the verified Map first so a later, contradicting snapshot cannot
// un-verify them while the clock runs.
function refresh(snapshot) {
  if (!section || !section.isConnected) rebuild();
  if (!section) return;
  for (const status of missionStatuses(stage, snapshot, verified)) {
    const chip = chips.get(status.id);
    if (!chip) continue;
    if (status.done && !verified.has(status.id)) {
      verified.set(status.id, status.completedTick);
    }
    const text = status.done ? `✓ done · tick ${status.completedTick}` : `○ ${status.progress}`;
    if (chip.textContent !== text) chip.textContent = text;
    chip.classList.toggle('mission-done', status.done);
  }
}

// Called on every snapshot (per crowd tick and per hop). The stage comes
// from the snapshot itself, so stage switches are detected here — a stage
// change clears the verified set and rebuilds the list before refreshing.
export function updateMissions(snapshot) {
  if (!snapshot) return;
  if (stage !== snapshot.stage) resetMissions(snapshot.stage);
  refresh(snapshot);
}

// Clear + rebuild for the given stage (defaults to the current one); the
// stage-switch hook in the brief's contract, also reached from
// updateMissions' own stage detection.
export function resetMissions(nextStage = stage) {
  verified.clear();
  stage = nextStage;
  rebuild();
}
