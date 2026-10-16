# ClueKeeper

Play a voice mystery with verified clue consistency.

## Status

This repository contains the initial product documentation. Application development has not started. There is no runnable application, measured benchmark or deployed service yet.

## Intended use

An adult host wants a short spoken mystery that responds naturally to unexpected questions while remaining solvable. Unconstrained narration can introduce an impossible clue or reveal an answer prematurely. ClueKeeper combines a small authored deduction puzzle with model-driven conversation and a mechanically checked clue ledger.

## Planned workflow

One original, nonviolent museum-object mystery contains three rooms, four fictional characters and six clue facts. The player speaks an action or question; the model proposes an allowlisted game action; a deterministic engine checks prerequisites and updates discovered facts; narration uses only that result. State is `START → EXPLORE → QUESTION → CLUE_REVEALED → HYPOTHESIS_TESTED → SOLVED | CONTINUE`. An unsupported accusation prompts a request for evidence, not a changed answer.

## Development

Start with the behavior and boundaries in [Architecture](docs/architecture.md), then establish the fixtures and acceptance checks in [Verification plan](docs/verification-plan.md). Runtime versions, dependency installation, commands and deployment instructions will be added alongside working code. No installation command is available at this stage.

Keep credentials in local ignored files or the deployment secret store. Do not commit user data, provider tokens or private evaluation records.

## License

Original application code and these documents use the [MIT license](LICENSE). Future dependencies, models, datasets and media retain their own licenses and must be reviewed before inclusion.
