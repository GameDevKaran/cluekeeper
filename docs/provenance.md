# Sources and reuse

ClueKeeper is an independent authored mystery. Its Tideglass story, rooms, characters, clue prerequisites, public-view projection, hypothesis/evidence rules and action vocabulary are original to this product. The story is fictional and does not depict actual people or a real museum case.

Narrow infrastructure is adapted from the MIT-licensed [HoldThat revision d3336d7](https://github.com/GameDevKaran/holdthat/tree/d3336d7) and [RoomReady revision e717d3f](https://github.com/GameDevKaran/roomready/tree/e717d3f): MCP transport, SQLite ownership/transaction patterns, package/build setup, server session/Host/Origin safeguards, bounded optional Bedrock transport and deployment packaging. ClueKeeper uses its own configuration prefix, port, cookie, data path, persistence lifetime, tool schema and product behavior. Shared infrastructure is disclosed; a new repository does not imply that those utilities were newly invented.

The product does not reuse HoldThat's task reducer or RoomReady's audio measurements, retest receipt or AV workflow. Reuse does not extend to their existing application submissions or create renamed variants of the same application.

AI coding agents substantially assisted implementation, test fixtures, documentation and the frozen text-action corpus. The corpus is synthetic and developer-authored with AI assistance; it is not user-study evidence, a human-labelled independent benchmark, or proof of model accuracy. No human review, live model evaluation or participant testing is claimed without a separate recorded result.

Third-party packages retain their own licenses. The top-level MIT license applies to this repository's original code and authored fiction subject to those dependencies. Verify the release lockfile and redistributed assets before publishing. No external recordings, museum images or private datasets are required for the authored mystery or paraphrase corpus.
