#!/bin/bash
# Overnight C07 measurement runner — local-only (git/npm/sqlite), survives wifi curfew.
# For each of the 9 C07 runs: wait until its executor session has been quiet
# for >=6 minutes (or 23:55 hard cutoff), then run the harness measure step.
cd /home/awingrove/repos/stack-orrery/stack-orrery
LOG=experiments/ste-briefs/runs/C07/overnight-measure.log
echo "runner started $(date '+%H:%M:%S')" >> "$LOG"

declare -A SESS=(
  [C-2]=ses_e23c7dba0ffehfZVCMpUwrSXc9 [B-3]=ses_e23c7db9effeUretyZSCF9cqif
  [A-1]=ses_e23c7db94ffeoQHe0zTcL729MV [A-3]=ses_e23c7db8affe0jSYZlBqt4Te2t
  [C-1]=ses_e23c7db79ffeBqXs1aW1e0Y76h [B-2]=ses_e23c7db75ffesG1KETUqFFPUYI
  [C-3]=ses_e23c7db71ffePkyyFwrstndJ2O [A-2]=ses_e23c7db6dffeaLZkszZLyHJrN6
  [B-1]=ses_e23c7db69ffeJgdLKNTvYsbyaA
)
declare -A DONE

last_msg_ts () {
  node -e "
  const {DatabaseSync} = require('node:sqlite');
  const db = new DatabaseSync(process.env.HOME + '/.local/share/opencode/opencode.db', {readOnly: true});
  const sid = process.argv[1];
  const rows = db.prepare('SELECT MAX(time_updated) t FROM session_message WHERE session_id = ?').get(sid);
  console.log(rows.t || 0);
  " "$1" 2>/dev/null
}

arm_of () { echo "${1%%-*}"; }
n_of () { echo "${1#*-}"; }

while true; do
  NOW=$(date +%s)
  REMAINING_PENDING=0
  for run in C-2 B-3 A-1 A-3 C-1 B-2 C-3 A-2 B-1; do
    [ -n "${DONE[$run]}" ] && continue
    TS=$(last_msg_ts "${SESS[$run]}")
    if [ "$TS" -gt 0 ] && [ $((NOW - TS / 1000)) -ge 360 ]; then
      echo "measuring $run (quiet since $(date -d @$((TS/1000)) '+%H:%M:%S')) $(date '+%H:%M:%S')" >> "$LOG"
      STE_CHANGE=C07 node experiments/ste-briefs/pilot-harness.mjs measure "$(arm_of "$run")" "$(n_of "$run")" "${SESS[$run]}" >> "$LOG" 2>&1
      DONE[$run]=1
    else
      REMAINING_PENDING=1
    fi
  done
  # hard cutoff 23:55: measure anything still pending, then exit
  if [ "$(date '+%H%M')" -ge 2355 ]; then
    for run in C-2 B-3 A-1 A-3 C-1 B-2 C-3 A-2 B-1; do
      [ -n "${DONE[$run]}" ] && continue
      echo "cutoff-measuring $run $(date '+%H:%M:%S')" >> "$LOG"
      STE_CHANGE=C07 node experiments/ste-briefs/pilot-harness.mjs measure "$(arm_of "$run")" "$(n_of "$run")" "${SESS[$run]}" >> "$LOG" 2>&1
      DONE[$run]=1
    done
    break
  fi
  [ "$REMAINING_PENDING" -eq 0 ] && break
  sleep 60
done
echo "runner finished $(date '+%H:%M:%S')" >> "$LOG"
