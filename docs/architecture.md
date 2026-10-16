# ClueKeeper: architecture

Proposed design; no components have been implemented.

One original, nonviolent museum-object mystery contains three rooms, four fictional characters and six clue facts. The player speaks an action or question; the model proposes an allowlisted game action; a deterministic engine checks prerequisites and updates discovered facts; narration uses only that result. State is `START → EXPLORE → QUESTION → CLUE_REVEALED → HYPOTHESIS_TESTED → SOLVED | CONTINUE`. An unsupported accusation prompts a request for evidence, not a changed answer.

Use a clearly labelled **Alexa+ simulation**, actual tool calls and an authorized Amazon Bedrock text model. The model interprets paraphrases and creates concise character dialogue; it cannot create canonical clues, bypass reveal conditions or award a solution. A consistency validator checks referenced fact IDs before speech output. When validation fails, a factual fallback explains the available action without inventing a live model success.

Stack: TypeScript game engine/UI, JSON puzzle graph, bounded model adapter, speech input/output and isolated session storage. MVP includes one 8–12 minute mystery, save/resume, hint tiers, clue recap and evidence-backed solution checking. Exclude multiplayer networking, generated mysteries, unrestricted roleplay, copyrighted characters, child profiles and real crime investigation. All plot, clue text and audio assets are owned or appropriately licensed.

## Failure handling and data boundaries

Preserve original inputs and make unavailable evidence explicit. Provider failures must return a visible unresolved state. Decisions that change user or provider state need the confirmation specified above. Record source versions and operation identifiers without exposing credentials.

## Implementation record

Add pinned dependencies, actual component boundaries and operational instructions when the first working slice exists. Document departures from this design with their reason; do not describe planned integrations as verified.
