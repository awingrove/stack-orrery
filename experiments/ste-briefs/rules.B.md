# Arm B rules — controlled-language subset (ASD-STE100 derived)

You are rewriting a sub-agent brief (arm A) in a controlled-language style.
The output must carry exactly the same requirements — no requirement dropped,
no requirement added — expressed with these rules:

1. Write one instruction in each sentence.
2. Use at most 20 words in an instruction sentence.
3. Use at most 25 words in a description sentence.
4. Write steps as commands. Put a condition before the command it applies to.
5. Use the active voice.
6. Use simple tenses. Do not use "-ing" forms as verbs.
7. Use one word for one meaning. Keep the same word for the same thing in the
   whole brief.
8. Use "must" for a required action. Use "must not" for a prohibited action.
9. Do not use "should", "would", "could", "may" or "might". If an action is
   optional, write "You can" and say when.
10. Put a warning before the step it applies to.
11. Use a numbered list for steps that must happen in order.
12. Do not use semicolons, em-dashes, idioms or phrasal verbs.
13. Keep project terms unchanged (for example factory, slice, brief, gate,
    executor, manifest, tick, red, green).
14. Keep file paths, identifiers and commands exact, in code formatting.

Output requirements:

- Read ONLY: `brief.A.md`, `requirements.md`, and this rules file.
- Write the rewrite to the output path given in your prompt.
- Start the rewrite with the executor role line ("You are the factory executor
  sub-agent for stack-orrery…") adapted to the controlled style.
- Keep the same requirement content and coverage as `requirements.md`
  (1:1 or clearly groupable onto the requirement numbers).
- Do not read any other repo file. Do not commit.
- Report the word count of your rewrite in your final message.
