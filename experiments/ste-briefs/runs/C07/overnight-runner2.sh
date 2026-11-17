#!/bin/bash
# C07 attempt-2 measurement runner — reads session ids from attempt2-sessions.txt,
# measures each run once its session has been quiet >=6 min. Local-only operations.
cd /home/awingrove/repos/stack-orrery/stack-orrery
LOG=experiments/ste-briefs/runs/C07/attempt2-measure.log
echo "runner2 started $(date '+%H:%M:%S')" >> "$LOG"

last_msg_ts () {
  node -e "
  const {DatabaseSync} = require('node:sqlite');
  const db = new DatabaseSync(process.env.HOME + '/.local/share/opencode/opencode.db', {readOnly: true});
  const rows = db.prepare('SELECT MAX(time_updated) t FROM session_message WHERE session_id = ?').get(process.argv[1]);
  console.log(rows.t || 0);
  " "$1" 2>/dev/null
}

while true; do
  ALLDONE=1
  while read -r run sid; do
    [ -z "$run" ] && continue
    marker="experiments/ste-briefs/runs/C07/$run/.measured2"
    [ -f "$marker" ] && continue
    ALLDONE=0
    TS=$(last_msg_ts "$sid")
    NOW=$(date +%s)
    if [ "$TS" -gt 0 ] && [ $((NOW - TS / 1000)) -ge 360 ]; then
      echo "measuring $run (quiet since $(date -d @$((TS/1000)) '+%H:%M:%S')) $(date '+%H:%M:%S')" >> "$LOG"
      STE_CHANGE=C07 node experiments/ste-briefs/pilot-harness.mjs measure "${run%%-*}" "${run#*-}" "$sid" >> "$LOG" 2>&1
      touch "$marker"
    fi
  done < experiments/ste-briefs/runs/C07/attempt2-sessions.txt
  [ "$ALLDONE" -eq 1 ] && break
  sleep 60
done
echo "runner2 finished $(date '+%H:%M:%S')" >> "$LOG"
