# Experiment protocol: controlled-language briefs and sub-agent performance

Status: draft for human approval
Audience: the OpenCode orchestrator session
Suggested location: `docs/plans/ste-brief-experiment.md` in the repo that holds the sub-agent work

## 1. Question

Does writing sub-agent briefs in a controlled-language style change how the sub-agent performs?

The controlled-language style is a subset of ASD-STE100 (defined in section 5).

The experiment replays past sub-agent work with different wordings of the same brief. Everything else stays fixed.

## 2. Terms

Use these terms with these meanings only.

- **Change**: one piece of past work that a sub-agent did from a brief. One change has one start commit and one reference diff.
- **Brief**: the task text the orchestrator gave to the sub-agent for a change.
- **Arm**: one wording of the brief. Arms are A, B and C (section 5).
- **Run**: one complete sub-agent session on one change with one arm.
- **Executor**: the sub-agent model and configuration that does the work in a run.
- **Rewriter**: the session that produces arms B and C from arm A.
- **Scorer**: the session that grades the output of a run.
- **Harness**: the scripts and procedure that set up, execute and record runs.
- **Reference diff**: the diff that was accepted for the change in the original work.

## 3. Rules that always apply

1. Do not push to any remote.
2. Do not modify the main branch or any existing branch.
3. Do not edit existing files in the repo, except to add files under `experiments/ste-briefs/`.
4. Run every run in an isolated directory (section 7).
5. Do not let an executor read the original session logs, the reference diff, or anything under `experiments/`.
6. Do not tell an executor that it is in an experiment.
7. Record every deviation from this protocol in `experiments/ste-briefs/DEVIATIONS.md`.
8. Stop and ask the human at each checkpoint (section 10).
9. Report negative and inconclusive results in the same way as positive results.

## 4. Phase 0: find candidate changes

1. Read the OpenCode session logs for the orchestrator and for the sub-agents.
2. List every change where an orchestrator gave a brief to a sub-agent.
3. For each change, extract these items:
   - The brief text, exactly as the sub-agent received it.
   - Every instruction file the sub-agent loaded (for example AGENTS.md, FACTORY.md pointers).
   - The executor model and configuration.
   - The start commit. This is the commit the sub-agent worked from.
   - The reference diff and the merged commit, if the work was merged.
   - Outcome data from the logs: human interventions, review rounds, guardrail failures, fix commits.
4. If an item is missing from the logs for a change, mark that change as "incomplete" and exclude it.
5. Write the result to `experiments/ste-briefs/candidates.md` as a table, one row per change.
6. Add a size label to each row: small, medium or large. Use diff size and files touched.
7. Add a difficulty note to each row. Use the outcome data. Mark changes where the original sub-agent needed intervention or rework.

**Checkpoint 1.** Stop. Ask the human to select the changes.

Selection guidance for the human:

- Select 5 to 10 changes.
- Include a mix of sizes.
- Include at least 2 changes that were difficult in the original run.
- Prefer changes whose start commit is easy to reproduce and whose gate runs offline.

## 5. Phase 1: build and freeze the arms

### 5.1 Arm definitions

**Arm A: original.** The brief exactly as given in the original run. Do not edit it. Keep the original instruction files.

**Arm B: controlled-language subset.** The same requirements as arm A, written with these rules:

1. Write one instruction in each sentence.
2. Use at most 20 words in an instruction sentence.
3. Use at most 25 words in a description sentence.
4. Write steps as commands. Put a condition before the command it applies to.
5. Use the active voice.
6. Use simple tenses. Do not use "-ing" forms as verbs.
7. Use one word for one meaning. Keep the same word for the same thing in the whole brief.
8. Use "must" for a required action. Use "must not" for a prohibited action.
9. Do not use "should", "would", "could", "may" or "might". If an action is optional, write "You can" and say when.
10. Put a warning before the step it applies to.
11. Use a numbered list for steps that must happen in order.
12. Do not use semicolons, em-dashes, idioms or phrasal verbs.
13. Keep project terms unchanged (for example factory, slice, brief).
14. Keep file paths, identifiers and commands exact, in code formatting.

**Arm C: restructure only.** The same requirements as arm A, with these rules:

1. Remove repeated text and filler.
2. Put the content in a clear order, with short headings and lists where they help.
3. Aim for the same word count as arm B, within 10 percent.
4. Use normal vocabulary, sentence length and modal verbs. Do not apply the arm B rules.

Arm C exists to separate the effect of the controlled-language rules from the effect of any careful rewrite.

### 5.2 Scope

Apply the arm only to the brief. Keep every other instruction file the same in all arms. Do not change AGENTS.md or FACTORY.md for this experiment.

### 5.3 Rewrite procedure

For each selected change:

1. Read arm A. Extract every requirement from it as a numbered list. A requirement is one thing the sub-agent must do, must not do, or must produce. Save the list as `requirements.md`.
2. Start a fresh rewriter session. The rewriter must use a different model from the executor.
3. Give the rewriter arm A, `requirements.md` and the rules for one arm. Ask for that arm.
4. Run a fidelity check. For each arm, confirm that every requirement in `requirements.md` appears in the rewrite, and that the rewrite adds no new requirement. Use a second fresh session for the check.
5. If the check fails, return the failing items to the rewriter and repeat. Allow at most 3 repeats.
6. Record the word count of each arm.

### 5.4 Files for each change

Create `experiments/ste-briefs/<change-id>/` with these files:

- `start.sha`: the start commit.
- `brief.A.md`, `brief.B.md`, `brief.C.md`.
- `requirements.md`.
- `reference.diff`.
- `rubric.md`: one line for each requirement, plus the checks in section 8.
- `meta.md`: executor model and configuration, instruction files used, original outcome data, word counts, rewriter model.

**Checkpoint 2.** Stop. Ask the human to review the arms and approve them.

After approval:

1. Commit the files.
2. Tag the commit `ste-brief-experiment-frozen`.
3. Do not edit any arm after the tag. If an arm must change, record it in DEVIATIONS.md and discard the results for that change.

## 6. Phase 2: pilot

1. Select one change. Choose a medium change.
2. Run 3 runs for each arm. This gives 9 runs.
3. Follow sections 7 and 8.
4. Write a pilot report with these items:
   - Whether the harness works end to end.
   - The spread of each metric inside one arm.
   - Whether any metric differs between arms by more than the spread inside an arm.
   - Any contamination, setup failure or log gap.
   - Cost and time per run.
   - A recommendation on the number of runs for the full experiment.

**Checkpoint 3.** Stop. Ask the human to approve the full run or to change the plan.

## 7. Run procedure and isolation

### 7.1 Isolation

For each run:

1. Create a new directory outside the repo working tree.
2. Export the start commit with `git archive` into the directory.
3. Run `git init` in the directory and make one commit of the exported files.

This gives the executor a repo with no history after the start commit. Do not use `git worktree` or a clone for this purpose, because they can expose future commits.

4. Install dependencies the same way for every run. Use the same lockfile and the same cache state.
5. Do not give the executor access to any path outside the run directory, except the tools it needs.
6. Block network access if the gate can run offline. If it cannot, record this in meta.md.

### 7.2 Execution

1. Start a new executor session. Use the model and configuration recorded in meta.md.
2. Load the same instruction files in every arm.
3. Give the executor the brief for the arm and nothing else.
4. Set the same limits in every arm: maximum turns, maximum time, and maximum tokens. Take the limits from the pilot, and use the largest value seen in the original run, plus 50 percent.
5. If the executor asks a question, do not answer with new information. Reply: "Proceed with your best judgment." Record the question.
6. When the executor finishes or reaches a limit, stop the session.
7. Commit the executor's changes in the run directory.

### 7.3 Order and settings

1. Randomize the order of runs. Use a recorded random seed. Do not run all runs of one arm together.
2. Record every setting the harness can control, such as temperature and seed. If a setting is not configurable, record that.
3. If runs execute in parallel, make sure they do not share a cache or a directory.

### 7.4 Run count

Use 3 runs for each arm for each change, unless the pilot recommends more. With 8 changes, this gives 72 runs.

## 8. Measurements

### 8.1 Automated measurements

After each run, the harness measures these items without using the executor:

- **Gate result.** Run the project gate (the command defined in FACTORY.md) in the run directory. Record pass or fail and the output.
- **First-attempt gate result.** From the session log, record whether the first gate run by the executor passed.
- **Guardrail failures.** Count guard script failures during the session.
- **Diff size.** Record files changed, lines added and lines removed.
- **Scope drift.** Count files changed that are not in the reference diff. Count files in the reference diff that are not changed.
- **File overlap.** Compute the share of shared files between the run diff and the reference diff.
- **Questions and assumptions.** Count executor questions and statements that say it assumed something.
- **Turns, tokens, wall time and cost.** Record each, if available.
- **Stop reason.** Record: finished, turn limit, time limit, token limit or error.

### 8.2 Scored measurements

The scorer grades each run. Follow these rules:

1. Use a fresh scorer session for each run.
2. Use a model that is different from the executor and the rewriter, if possible.
3. Give the scorer only the run diff, the reference diff, the arm-independent rubric and `requirements.md`. Do not give it the arm name, the brief text or the run log.
4. Grade each requirement: 0 = not met, 1 = partly met, 2 = fully met.
5. Grade these checks: correct behavior, no unrelated changes, follows project conventions, test coverage.
6. Write a one-line reason for each grade.
7. Record the totals.

### 8.3 Human check

1. Select a random 20 percent of runs.
2. Ask the human to grade them with the same rubric, without arm labels.
3. Compare the human grades with the scorer grades. Report the agreement rate.
4. If agreement is below 70 percent, report this in the final report as a limit on the scored results.

### 8.4 Data files

Write one directory for each run: `experiments/ste-briefs/runs/<change-id>/<arm>-<n>/`. Put in it: the exported session log, the final diff, the gate output and a `run.json` file with all measurements.

Write all runs to `experiments/ste-briefs/results.csv` with one row per run. Use these columns: change_id, arm, run_number, seed, executor_model, gate_pass, first_attempt_gate_pass, guardrail_failures, files_changed, lines_added, lines_removed, extra_files, missing_files, file_overlap, questions, assumptions, turns, tokens, wall_seconds, cost, stop_reason, requirements_score, requirements_max, quality_checks_score, human_graded.

## 9. Analysis and reporting

1. For each change, report the mean and the range of each metric for each arm.
2. Report the spread inside each arm. This is the noise level.
3. Compare B against A, B against C, and C against A.
4. Do not report one average over all changes without the per-change table.
5. Apply this decision rule. An arm effect is real only if both conditions are true:
   - The effect has the same direction in at least 70 percent of the changes.
   - The difference between arms is larger than the spread inside an arm for most of those changes.
6. If the rule is not met, report "inconclusive". Do not claim a trend.
7. Report these items as well:
   - Differences in cost, turns and time.
   - Changes where an arm performed much worse.
   - Differences in the style of the executor output (commit messages, notes), if visible.
   - Every deviation and every contamination finding.
   - Limits: small sample, one executor, one repo, scorer agreement.
8. Write the report to `experiments/ste-briefs/REPORT.md`. Start with a decision section of no more than 10 lines: what was tested, the result for each comparison, and the recommended next step.

**Checkpoint 4.** Stop. Ask the human to review the report.

## 10. Checkpoints

The orchestrator must stop and wait for the human at these points:

1. After Phase 0, to select changes.
2. After Phase 1, to approve the arms.
3. After the pilot, to approve the full run.
4. After the final report.

## 11. Stop conditions

Stop and ask the human if any of these happens:

- The project gate cannot run in an isolated directory.
- A log does not give the start commit or the brief for a selected change.
- You find that an executor accessed the reference diff, the session logs or any future history.
- The estimated cost of the full run is more than twice the pilot estimate.
- More than 20 percent of runs end in an error.

## 12. Out of scope

- Changing the AGENTS.md or the kit rules.
- Testing controlled language in the orchestrator's own instructions.
- Testing models other than the recorded executor.
- Judging the quality of the original work.

If the result is positive, a later experiment can test the arm B rules on instruction files, and on other executor models.
