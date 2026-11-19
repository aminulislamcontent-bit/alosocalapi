# MetaGPT projects and a local model for ALOAPI

[Browse the project list](INDEX.md) · [Machine-readable catalog with descriptions](projects.json) · [Original GitHub topic](https://github.com/topics/metagpt)

**Choose the component you need.** [FoundationAgents/MetaGPT](https://github.com/FoundationAgents/MetaGPT) is the MIT-licensed multi-agent **framework**, not an LLM. The topic also includes wrappers, examples, and guides. A listed repository is a source reference, not an installed or security-reviewed ALOAPI provider. Check the actual upstream license for the revision you use; code licenses do not guarantee free hosted inference or cover all model weights and datasets.

**For local text generation without a paid API**, the existing ALOAPI Ollama adapter can request an installed model by name. One option is [Qwen3-8B](https://github.com/QwenLM/Qwen3), an Apache-2.0 open-weight model. On the ALOAPI server, install [Ollama](https://github.com/ollama/ollama), keep its listener on loopback, and run `ollama run qwen3:8b` to download and warm the model. This uses local disk, memory, and compute. No weights are bundled here.

Example JSON for an authenticated, same-origin `POST /api/factory/ai` from a workspace member with `execute` permission:

```json
{"adapter":"ollama_local_http","model":"qwen3:8b","task":"marketing_copy","language":"en","prompt":"Write a short introduction for a local bookstore."}
```

This uses ALOAPI's existing text-inference path; it does **not** launch MetaGPT or grant agents permission to execute tools. To use the framework separately, consult its upstream setup and backend compatibility documentation.

**Refresh the catalog:** from the repository root, run `node scripts/fetch-metagpt-projects.mjs` with the GitHub CLI available. It reads public non-fork topic metadata (including archived projects), filters by the explicit SPDX list in the script, and regenerates the Markdown index and JSON. It does not download or run third-party code.
