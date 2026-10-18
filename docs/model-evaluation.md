# Frozen action-mapping evaluation

`evaluation/paraphrases.json` freezes **30 development cases and 30 held-out cases** for the authored mystery, The Tideglass Transfer. Cases were written before any approved live model run. No inference result, baseline, accuracy, latency or human evaluation is reported here. Fixture validity checks only establish that setup commands and expected actions match the authored state machine.

## Conservative model boundary

For each case start a fresh `createSession`, replay its `setupCommands` in order using the current expected revision, then produce `publicView`. The model may propose only an action in that view's `actions`. It must copy that action's label exactly as narration. Apply neither setup state nor a model result directly from client-supplied state. The server validates proposals; the player explicitly confirms a valid proposal before execution.

The provider receives only public observations and the allowed action choices. It must never receive the server-only puzzle solution, undiscovered clue definitions or raw unrestricted session. Story prose is authored, not generated. Natural-language solving is outside this boundary even if a text guess happens to be correct. The UI's explicit hypothesis fields and six discovered evidence citations are the only solving route.

Each case includes an expected action ID and exact narration, or a null action ID for an expected rejection/no accepted proposal. Null does not add an API command or broaden the model schema: it means the application must not accept any proposed action for that input. Ambiguous multi-action, locked/out-of-room, irrelevant, prompt-injection and natural-language-solve examples are included. A schema-valid but semantically wrong allowed action is still an evaluation failure.

## Later approved live procedure

1. Record the corpus file hash, application commit, exact model ID/version, prompt/version, provider, region, configured budget and inference parameters before the run. Keep the held-out split unchanged while tuning against development examples only.
2. Check setup validity with the actual domain reducer, then send each case's text and resulting public view through the real adapter. Use isolated cases; never let a prior model outcome influence a later setup.
3. Capture sanitized request ID, returned proposal or rejection, validation outcome, latency and token/cost metadata where provided. Capture errors and retries; do not omit failed requests. Redact credentials and avoid logging any unrelated user text.
4. Report exact accepted-action matches out of all 30 cases per split, plus positive-action accuracy and unsupported-request false acceptance separately. Narration must equal the expected label; wrong-action proposals do not pass merely because they are allowed in the view. A rejected positive case is a failure; a rejected negative case is correct abstention but must be distinguished from infrastructure failure.
5. Record model-call failures separately from semantic quality. A timeout/auth/quota failure is unavailable evidence, not successful abstention. Report denominators and raw sanitized outcomes, not just a percentage.
6. Verify zero unsupported state transitions and zero model-authored story facts at the application boundary independently of semantic accuracy. These are enforced invariants to test, not observed model metrics yet.
7. Open the held-out split once the prompt/model configuration is fixed. If a failure drives a change, record that the split has been inspected and create a genuinely new holdout version; do not keep calling a tuned-on split unseen.

There is no measured keyword baseline or human comparison. If a later comparison is useful, specify and freeze its matching behavior before evaluating it on the same cases. This single-mystery synthetic corpus supports narrow action-mapping evaluation only; it does not measure general mystery reasoning, natural conversation, speech recognition accuracy or customer impact.
