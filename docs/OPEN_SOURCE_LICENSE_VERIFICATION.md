# License and security evidence

**As checked 2026-11-19.** Use the exact `revision`, `licenseUrl`, `docs`, `weights`, `weightTermsStatus` and advisory URLs in [the catalog](../reports/open-source-ai-catalog.json). Repository availability is not legal clearance. A free SaaS tier, readable source, an OSI software license, and permission to redistribute trained weights are four different things.

| Snapshot scope | Result |
|---|---|
| 70 entries: GitHub repository root classification | 50 recognized root license + pinned file; 20 require manual root review, including known mixed-license repos. Counts are per entry, not unique legal entities. |
| Root SPDX values | Apache-2.0 28; MIT 16; NOASSERTION 13; AGPL-3.0 3; GPL-3.0 3; MPL-2.0 2; unreported 2; BSD-2-Clause, CC-BY-4.0 and LGPL-2.1 one each. |
| Maintenance | 3 archived reference repositories (Mistral inference, Roo Code, MinIO); 10 other records flagged for stale-source review. Not evidence that all checkpoints produced by those organizations are abandoned. |
| Trained models | 12 named checkpoints. Six have matching terms evidence in the pinned upstream README. Six require additional checkpoint review. None is globally cleared for every use case. |

### Checkpoints are reviewed individually

| Profile | Evidence/limitation |
|---|---|
| Qwen3-8B | Qwen3 README explicitly licenses its open weights under Apache 2.0 and documents `ollama run qwen3:8b`. Root SPDX not reported. Preserve notices; verify exact quantizer/weights provenance and digest separately. |
| DeepSeek-R1 | Official README expressly licenses **this** original 671B-parameter checkpoint (37B activated, 128K context) under MIT. Distill variants have separate upstream terms. Not a laptop deployment recommendation. |
| Llama 3.2 1B | [Checkpoint-specific license](https://github.com/meta-llama/llama-models/blob/0e0b8c519242d5833d8c11bffc1232b77ad7f301/models/llama3_2/LICENSE) and adjacent acceptable-use policy; 128K context per upstream table. Custom conditions, not permissive OSS. |
| Yi-1.5-6B | Yi README explicitly applies Apache 2.0 to Yi-1.5 code and weights. Do not generalize across older releases. |
| Kokoro-82M / FLUX.1 schnell | Kokoro README describes Apache-licensed weights; FLUX README links a model-specific Apache 2.0 license for **schnell**. Do not apply schnell terms to dev variants or assume a voice/data corpus license. |
| Mistral 7B Instruct v0.3 / Phi-3 Mini 4K | Weight terms in seed records are review leads, not verified by a checkpoint fetch here. Mistral reference runtime archived; other Mistral checkpoints include research/nonproduction terms. |
| Gemma 2 2B / XTTS v2 | Custom Gemma terms / Coqui Public Model License need independent verification, including acceptable use or noncommercial limits. Do not include in a commercial release on a code license alone. |
| GLM-4-9B-Chat / Falcon-H1-1.5B-Instruct-GGUF | Checkpoint terms unknown in snapshot. GLM table references 128K **for this variant**. No auto-install or execution eligibility. |

For models with unknown RAM/VRAM, quantization, size, supported platforms or context, consult the model-specific publisher documentation. Never turn a parameter count into a promised minimum host. `weightTermsStatus=upstream-readme-evidence` is a text/evidence match, not legal approval. `verified-root-license` is a pinned root-file plus upstream GitHub SPDX classification; it does not examine every nested file. `NOASSERTION` is not a public-domain grant. Read actual license text, subdirectories, base models, datasets, branding and generated-output terms before shipping.

* n8n sustainable-use / enterprise licensing, mixed-edition tools, Redis version-specific terms and Open WebUI branding need review. PostgreSQL and SQLite have special provenance; a missing GitHub classification must not be guessed. Preserve attribution for permissive software; review distribution/source and network-use obligations for copyleft.
* PocketSphinx upstream includes a separate [acoustic model notice](https://github.com/cmusphinx/pocketsphinx/blob/f20ff1b7a5db64c5e892a798479e20df86e79a35/model/en-us/en-us/README). Root classifier is NOASSERTION. Wheel hashes and model digests verify bytes, not redistribution rights for every dictionary, model or speech sample. No model binaries are redistributed here.
* The refresh sampled **292 distinct published upstream GHSA IDs**, up to 20 per repository, in this snapshot. A GHSA is not proof ALOAPI has that component installed or a vulnerable version. Zero reported advisories is not a vulnerability-free assertion. Pin runtime versions; verify advisories, dependencies, build provenance and license changes again before update. Avoid unreviewed plugins, third-party Python pickles, arbitrary scripts and agent shell access.
* `npm audit` on the existing ALOAPI lockfile reported **16 affected packages (11 moderate, 5 high)**; high entries: `@prisma/config`, `deepmerge-ts`, `js-yaml`, `prisma`, `sharp`. No npm dependency added here. No automatic major upgrades. Reachability and safe compatible upgrades need dedicated work.
* First optional Python resolution included a flagged `langgraph-sdk` 0.3.15; it was **not retained**. The 42 pinned Python distributions were checked against PyPI's exact-version vulnerability feed; none had a non-withdrawn entry at check time. This is not a complete security audit. Use the hash-locked wheel set only on its supported platform and repeat dependency checks before production.
