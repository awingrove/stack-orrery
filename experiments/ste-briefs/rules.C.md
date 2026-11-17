# Arm C rules — restructure only (control arm)

You are rewriting a sub-agent brief (arm A) with structure improvements only.
The output must carry exactly the same requirements — no requirement dropped,
no requirement added — expressed with these rules:

1. Remove repeated text and filler.
2. Put the content in a clear order, with short headings and lists where they
   help.
3. Aim for the same word count as the arm B rewrite of the same brief, within
   10 percent. (If you do not know that count, aim for a tight rewrite of
   roughly the same information in fewer words than arm A.)
4. Use normal vocabulary, sentence length and modal verbs. Do NOT apply the
   arm B controlled-language rules (no 20-word sentence cap, no "-ing" ban,
   "should"/"may" are fine).

Purpose: arm C separates the effect of careful rewriting from the effect of
the controlled-language rules. It must NOT be controlled language with
different words.

Output requirements:

- Read ONLY: `brief.A.md`, `requirements.md`, and this rules file.
- Write the rewrite to the output path given in your prompt.
- Keep the same requirement content and coverage as `requirements.md`.
- Do not read any other repo file. Do not commit.
- Report the word count of your rewrite in your final message.
