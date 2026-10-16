# ClueKeeper: verification plan

No tests or evaluations have run. The following are prospective acceptance targets, not results.

## Fixtures and acceptance

30 development utterances and 30 held-out paraphrases across exploration, questions, hints and accusations; additionally ten adversarial attempts to reveal locked clues or rewrite the culprit. Compare a menu-only game and unconstrained model narration against the checked engine. Target at least 27/30 correct action mappings, zero unsupported canonical facts accepted and zero locked-clue reveals in the negative set. Report narrative fallbacks, completion paths and latency; do not claim general hallucination elimination.

## Demonstration to verify

0–20 introduce the missing exhibit; 20–55 ask an unexpected spoken question; 55–90 inspect a newly discovered clue and recap; 90–115 attempt an unsupported accusation; 115–135 solve using actual evidence; 135–150 expose the fact ledger and one rejected invented clue.

## Result record

For each run, record the source commit, fixture version, runtime/provider versions, actual pass and failure counts, latency, cost where relevant, and limitations. Keep development and held-out inputs separate. Report negative findings; freeze the protocol before inspecting held-out results.

A release requires a functioning end-to-end workflow and a clean-session replay. Documentation, repository creation and HTTP availability alone do not establish application correctness.
