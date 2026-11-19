# Open-source AI ecosystem: operator guide

**Delivery scope: PARTIALLY COMPLETE.** ALOAPI contains a reviewable inventory and local adapters, not 70 installed products. There is no change to a production environment, provider account, student record, or outbound messaging workflow. Self-hosting avoids a mandatory hosted inference subscription; compute, storage, review, and operations still cost money.

## What to use

| Task | Entry point | Trust boundary |
|---|---|---|
| Discover frameworks, tools and weights | Admin Control Center → **AI Ecosystem** | Authenticated administrator; metadata only |
| Filter, share, re-import a shortlist | Category, compatibility and license controls; JSON download/file picker | File is a list of known IDs. Unknown IDs and duplicates rejected. Selections last only in this view. Import never adds trusted code. |
| Read full inventory / project matrix | `GET /api/admin/ecosystem` | Admin; no-store. Separate from third-party provider credentials and first-party module definitions. |
| Check a local model | `POST /api/admin/ecosystem` with `{"action":"preflight","id":"model:qwen/qwen3-8b"}` | Admin + same origin. Only `/api/version` and `/api/tags` on the configured loopback origin, no redirects. Never pulls weights. |
| Execute factory inference | `POST /api/factory/ai`, `catalogId` path below | Authenticated workspace execute permission, same origin, operator-pinned model, normal factory usage accounting |
| Stage a GGUF for a local runner | `scripts/ecosystem/weights.py` | Operator shell, local filesystem only. Not a web installer or Ollama registration. |
| Test local speech or retrieval | `offline_voice.py`, `research_graph.py` under `scripts/ecosystem/` | Optional isolated environment; no shell tools, microphone, production DB, callbacks or hosted LLM |

### Registry and provenance

[Machine-readable catalog](../reports/open-source-ai-catalog.json) · [license review](OPEN_SOURCE_LICENSE_VERIFICATION.md) · [first-party inventory](PROJECT_INTEGRATION_MATRIX.md). The ten categories contain 12 model profiles, 5 agent frameworks, 6 inference engines, 8 RAG tools, 6 voice tools, 7 creative tools, 6 automation tools, 6 developer tools, 8 infrastructure tools and 6 specialized applications. They refer to 67 distinct upstream repositories. Metadata and install/hardware evidence links come from the official repository at the recorded revision. A Docker filename is not a tested deployment. An empty evidence link means **unknown**, not “no requirement.” A checkpoint can share a source repo with an engine; it is not interchangeable with that engine.

`ecosystem/sources.json` is the curated input. Tool IDs use the GitHub database ID rather than repository names, so a rename is not a new tool. Each model has its own reviewed checkpoint ID. External SaaS retains its existing registry (`src/lib/intelligence/catalog`); first-party modules retain their 20 existing keys (`src/lib/factory/modules/registry.ts`). None becomes an installable OSS component by appearing in an admin screen.

### Refresh and review

1. Run `python3 scripts/ecosystem/refresh.py` with read-only GitHub CLI access, or dispatch **Ecosystem metadata review**. This reads GitHub; it does not clone repositories or run their code.
2. Inspect `reports/candidate/review.json`: additions/removals, material metadata changes, release, license, archive/staleness flags and upstream-published advisories (up to 20 per repo). Topic search suggestions are **unreviewed**, deduplicated GitHub repositories, not a new trusted source. A push more than a year ago triggers review, not a declaration of abandonment. Last run: 41 discovery candidates.
3. An inaccessible source yields a partial candidate and failure, never replacement of the last committed snapshot. An upstream outage may abort discovery; do not treat the absence of output as success. Recheck unavailable and renamed sources. Review checkpoint terms, pinned docs and exact binaries separately. Edit curated inputs in a PR before accepting new IDs.
4. Compare candidate and committed JSON, review release notes and advisories for the *chosen version*, then promote by reviewed Git diff. Approved snapshots have Git history; workflow review artifacts have 30-day retention. Refresh never writes the trusted file, opens a PR or installs anything. The dashboard shows the last **accepted** snapshot, not the latest unreviewed result.

## Approved execution and capacity

**Qwen3-8B:** only the profile `model:qwen/qwen3-8b` maps to `qwen3:8b`. Set `OLLAMA_BASE_URL` to an operator-controlled loopback **HTTP origin** (default `http://127.0.0.1:11434`). After independent review of the installed Ollama manifest, set `ALOAPI_QWEN3_8B_DIGEST` to its 64 lowercase hex characters on the server. This is a manifest digest, **not** a GGUF file checksum. The server does not accept approval or an endpoint override from a catalog request. Never grant untrusted users write access to this daemon or allow concurrent retagging: a metadata check followed by generation is not an atomic immutable-tag API. Legacy non-catalog factory routes are a separate interface; this is not a global allowlist for all existing providers.

From the existing signed-in factory client, same-origin request body example (no token or secret in JSON):

```json
{"catalogId":"model:qwen/qwen3-8b","workspaceId":"default-workspace","moduleKey":"marketing_intelligence","task":"marketing_copy","language":"bn","prompt":"বাংলায় একটি সংক্ষিপ্ত খসড়া লিখুন।"}
```

Use an authorized workspace, non-sensitive test prompt and human review. No fallback output is reported as Qwen. Missing runtime, missing tag, digest mismatch, missing size, or insufficient available memory blocks generation. This branch did **not** execute Qwen: no approved Ollama installation was present. The hardware analyzer reports CPU architecture, host RAM and available process memory; it requires 1.5 × installed artifact bytes available for this conservative CPU preflight. This is an operator policy, **not** a measured context limit or a guarantee; quantization, KV cache, backend, cgroup, load and batch matter. GPU/VRAM capability and sustained throughput are unknown. Do not use host capacity results as permission to install.

The example `deploy/ecosystem/compose.yml` uses an already locally available digest-pinned Ollama image, binds only host loopback and does not auto-pull or restart. It is for a host-native ALOAPI process; a separate container's loopback is not the host. No Docker deployment was performed. Do not expose Ollama to a public interface.

**Local GGUF staging:** obtain exactly one approved artifact and its independent publisher checksum outside the application. Use a private operator-owned directory on a trusted volume; stage and inspect with:

```sh
python3 scripts/ecosystem/weights.py activate --store "$PRIVATE_STORE" --gguf "$REVIEWED_GGUF" --sha256 "$REVIEWED_FILE_SHA256" --approve-qwen3-8b
python3 scripts/ecosystem/weights.py inspect --store "$PRIVATE_STORE"
python3 scripts/ecosystem/weights.py rollback --store "$PRIVATE_STORE" --sha256 "$PRIOR_APPROVED_SHA256" --approve-qwen3-8b
```

Checks available disk, GGUF header and SHA-256 while staging; locks independent operators, stores immutable versions, switches active state with audit history by atomic manifest rename. Rollback rechecks bytes and requires a previously activated digest. No shell command or post-install hook comes from catalog data. A checksum is only as trustworthy as its source. A header check isn't parser safety, and a digest doesn't establish model identity or license. The store is **not** a substitute for Ollama: this tool does not load files into the daemon. Do not process untrusted weights. Roll back an Ollama deployment separately using its approved volume/image backup and server-side pin; never remove production volumes as a test.

### Tested optional adapters (not installed into the web server)

Linux x86-64, Python **3.11**; provision an isolated environment and review the exact hashes and notices first:

```sh
python3.11 -m venv "$VENV"
"$VENV/bin/pip" install --only-binary=:all: --require-hashes -r ecosystem/requirements-linux-py311.txt
"$VENV/bin/pip" check
```

* **Speech:** `"$VENV/bin/python" scripts/ecosystem/offline_voice.py "$CONSENTED_WAV" --approve-local-processing`. Uses PocketSphinx 5.1.1 with its bundled US English acoustic model, language model and dictionary; verifies **11 files, 37,856,806 bytes** before decoding. Accepts at most 30 seconds of mono 16-bit, 16 kHz PCM WAV. CPU-only test, no GPU or network. The upstream public `goforward.raw` sample at `cmusphinx/pocketsphinx@f20ff1b7a5db64c5e892a798479e20df86e79a35` actually decoded to **“go forward ten meters”**. No callers recorded, no claim of Bangla ASR, production latency or transcription accuracy. The CLI prints its output: never redirect private audio transcripts to shared logs.
* **Retrieval:** `printf '%s\n' '{"query":"ঢাকা শিক্ষা","notes":["ঢাকা শিক্ষা প্রকাশ্য পাঠ্য","business hours"]}' | "$VENV/bin/python" scripts/ecosystem/research_graph.py`. LangGraph runs two fixed nodes: rank same-request supplied excerpts, then require human review or return insufficient evidence. Verified Bangla match and no-match on independent invocations. No persistent memory, external retriever, trace export, student DB access or autonomous agent tools. This is lexical retrieval, **not** a multilingual generative model or a deployed AgentOS worker.
* Reproduce both with `tests/ecosystem-adapters.py` and the upstream fixture (see **Offline speech and retrieval adapters** CI step). The test verifies the fixture SHA-256 before decoding. Operator files are not uploaded or added to Git.

## Operational limits and next checks

Run `npm ci`, `npm ls --depth=0`, `npm run db:validate`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`; run optional-wheel acceptance separately. No schema changes. The unit suite also checks the offline store and catalog invariants. The runtime suite probes a disposable local server to verify auth, origin, unknown/duplicate IDs, missing weights and ignored caller approval; it observes that no denied path generates or downloads weights. That fixture is not an inference receipt.

The other 11 model profiles and other catalog frameworks are not ALOAPI execution adapters. An archived source is not a production recommendation. No automatic Docker deployments, scripted provider enrollment, multi-agent shell workers, bulk pulls, live updates, Education RLS changes or production capacity claims. Recheck the matrix and get each repository owner's approval before crossing a system boundary.
