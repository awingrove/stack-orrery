#!/bin/bash
# C19 wave driver — resumes the controller session whenever a wave lands.
# Local DB polling only. Stops when RESULTS.md exists, a curfew wrap fires,
# or 6 hours elapse (safety).
cd /home/awingrove/repos/stack-orrery/stack-orrery
CTL=ses_e173babcfffeMp7PJ8PEMd9k1M
LOG=experiments/ste-briefs/runs/C19/driver.log
echo "driver started $(date '+%H:%M')" >> "$LOG"

quiet () {
  node -e "
  const {DatabaseSync} = require('node:sqlite');
  const db = new DatabaseSync(process.env.HOME + '/.local/share/opencode/opencode.db', {readOnly: true});
  const rows = db.prepare('SELECT MAX(time_updated) t FROM session_message WHERE session_id = ?').get(process.argv[1]);
  const t = rows.t || 0;
  console.log((Date.now() - t) >= 360000 ? 'yes' : 'no');
  " "$1" 2>/dev/null
}

while true; do
  ALLQUIET=1
  while read -r run sid; do
    [ -z "$run" ] && continue
    [ -f "experiments/ste-briefs/runs/C19/$run/.measured" ] && continue
    if [ "$(quiet "$sid")" = "yes" ]; then
      echo "run $run quiet — marking" >> "$LOG"
      touch "experiments/ste-briefs/runs/C19/$run/.measured"
    else
      ALLQUIET=0
    fi
  done < experiments/ste-briefs/runs/C19/attempt-sessions.txt

  if [ -f experiments/ste-briefs/runs/C19/RESULTS.md ]; then
    echo "RESULTS.md exists — driver done $(date '+%H:%M')" >> "$LOG"
    break
  fi

  if [ "$ALLQUIET" = "1" ]; then
    MEASURED=$(grep -l . experiments/ste-briefs/runs/C19/*/.measured 2>/dev/null | wc -l)
    echo "wave landed ($MEASURED marked) — resuming controller $(date '+%H:%M')" >> "$LOG"
    opencode run --auto -s "$CTL" "Wave progress: runs have landed and gone quiet. Continue per STATE.md: audit each landed run (node experiments/ste-briefs/audit-session.mjs <sessionId>), measure the clean ones (STE_CHANGE=C19 node experiments/ste-briefs/pilot-harness.mjs measure <arm> <n> <sessionId>), touch experiments/ste-briefs/runs/C19/<run>/.measured for each measured run, then dispatch the next wave or scoring per the pacing rules. Remember the zero-discards rule: never dispatch a run whose budget crosses 23:30Z." >> "$LOG" 2>&1
  fi

  if [ "$(date '+%H%M')" -ge 2315 ] && [ "$(date '+%H%M')" -le 2330 ]; then
    echo "curfew wrap $(date '+%H:%M')" >> "$LOG"
    opencode run --auto -s "$CTL" "Curfew wrap-up: the wifi dies at 23:30Z. Do NOT dispatch any new run. Measure/audit anything landed, commit everything under experiments/ste-briefs/, write a handoff note in DEVIATIONS.md, and end." >> "$LOG" 2>&1
    break
  fi
  sleep 120
done
echo "driver finished $(date '+%H:%M')" >> "$LOG"
