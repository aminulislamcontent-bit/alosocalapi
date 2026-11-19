"""Build a review candidate, never publish or install it. Python stdlib + authenticated gh."""

import concurrent.futures as cf
import base64
import datetime as dt
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "reports/candidate"
ALLOW = {
    "MIT",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "ISC",
    "MPL-2.0",
    "GPL-2.0",
    "GPL-3.0",
    "AGPL-3.0",
    "LGPL-2.1",
    "LGPL-3.0",
    "PostgreSQL",
}
MIXED = {
    "n8n-io/n8n",
    "redis/redis",
    "activepieces/activepieces",
    "windmill-labs/windmill",
    "kestra-io/kestra",
    "grafana/grafana",
    "supabase/supabase",
    "open-webui/open-webui",
    "chatwoot/chatwoot",
    "twentyhq/twenty",
    "openhands/openhands",
}


def api(*args):
    p = subprocess.run(["gh", "api", *args], capture_output=True, text=True, timeout=50)
    if p.returncode:
        raise RuntimeError("GitHub metadata unavailable")
    return json.loads(p.stdout)


def inspect(repo):
    owner, name = repo.split("/")
    query = """query($owner:String!, $name:String!){repository(owner:$owner,name:$name){databaseId nameWithOwner url isArchived stargazerCount forkCount primaryLanguage{name} pushedAt licenseInfo{spdxId} latestRelease{tagName url} defaultBranchRef{target{oid}} object(expression:"HEAD:"){... on Tree{entries{name}}}}}"""
    raw = api(
        "graphql", "-f", "query=" + query, "-f", "owner=" + owner, "-f", "name=" + name
    )["data"]["repository"]
    sha = raw["defaultBranchRef"]["target"]["oid"]
    base = raw["url"]
    files = [v["name"] for v in raw["object"]["entries"]]
    spdx = (raw["licenseInfo"] or {}).get("spdxId")
    licenseFile = next(
        (f for f in files if re.fullmatch(r"licen[cs]e(\.md|\.txt)?|copying", f, re.I)),
        None,
    )
    advice = None
    try:
        advice = api(
            "repos/"
            + raw["nameWithOwner"]
            + "/security-advisories?state=published&per_page=20",
            "--jq",
            "[.[] | {id:.ghsa_id,severity,url:.html_url}]",
        )
    except RuntimeError:
        pass
    doc = api("repos/" + raw["nameWithOwner"] + "/readme?ref=" + sha)
    readme = base64.b64decode(doc["content"]).decode("utf8", "replace")
    lines = readme.splitlines()

    def evidence(pattern):
        return next(
            (
                base + "/blob/" + sha + "/" + doc["path"] + "#L" + str(i)
                for i, line in enumerate(lines, 1)
                if re.search(pattern, line, re.I)
            ),
            None,
        )

    return dict(
        _readme=readme,
        installDocs=evidence(
            r"\b(pip install|npm install|cargo install|docker run|brew install|uv add)\b|^#+ (installation|installing)"
        ),
        apiDocs=evidence(r"\b(REST API|Python API|OpenAI.compatible|API reference)\b"),
        hardwareDocs=evidence(
            r"\b(VRAM|hardware requirements|system requirements|GPU memory)\b"
        ),
        repoId=raw["databaseId"],
        repository=raw["nameWithOwner"],
        source=base,
        revision=sha,
        docs=base + "/tree/" + sha + "#readme",
        licenseUrl=base + "/blob/" + sha + "/" + licenseFile if licenseFile else None,
        codeLicense=spdx,
        codeClass=(
            "review"
            if repo.lower() in MIXED or not licenseFile or spdx not in ALLOW
            else "verified-root-license"
        ),
        archived=raw["isArchived"],
        pushedAt=raw["pushedAt"],
        release=raw["latestRelease"],
        language=(raw["primaryLanguage"] or {}).get("name"),
        stars=raw["stargazerCount"],
        forks=raw["forkCount"],
        dockerEvidence=[
            f
            for f in files
            if f.lower()
            in (
                "dockerfile",
                "docker-compose.yml",
                "compose.yaml",
                "docker-compose.yaml",
                "docker",
            )
        ],
        advisories=advice,
    )


def main():
    sources = json.loads((ROOT / "ecosystem/sources.json").read_text())
    repos = sorted({s["repo"] for s in sources})
    now = dt.datetime.now(dt.timezone.utc)
    out = {}
    errors = []
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(inspect, r): r for r in repos}
        for f in cf.as_completed(futures):
            r = futures[f]
            try:
                out[r] = f.result()
            except (RuntimeError, KeyError, TypeError, subprocess.TimeoutExpired):
                errors.append(r)
    entries = []
    for seed in sources:
        r = seed["repo"]
        cat = seed["category"]
        model = cat == "model"
        meta = out.get(r)
        if not meta:
            continue
        item = {
            **{k: v for k, v in meta.items() if not k.startswith("_")},
            **{k: v for k, v in seed.items() if k != "repo"},
        }
        item["name"] = seed.get("name", meta["repository"].split("/")[1])
        item["id"] = (
            "model:" + seed["weights"].split("huggingface.co/")[1].lower()
            if model
            else "github:" + str(meta["repoId"])
        )
        item["maintenance"] = (
            "archived"
            if meta["archived"]
            else (
                "stale-review"
                if (
                    now
                    - dt.datetime.fromisoformat(meta["pushedAt"].replace("Z", "+00:00"))
                ).days
                > 365
                else "recent-push"
            )
        )
        item["kind"] = {
            "model": "model-weights",
            "inference": "inference-engine",
            "framework": "agent-framework",
            "application": "application",
        }.get(cat, "tool-or-library")
        item["weightTermsStatus"] = (
            (
                "upstream-readme-evidence"
                if seed.get("termsReadmeEvidence")
                and seed["termsReadmeEvidence"] in meta["_readme"]
                else "checkpoint-review-required"
            )
            if model
            else None
        )
        entries.append(item)
    ids = [e["id"] for e in entries]
    if len(set(ids)) != len(ids):
        raise ValueError("duplicate stable ID")
    verified = now.date().isoformat()
    candidate = dict(
        schemaVersion=1,
        verifiedAt=verified,
        entries=entries,
        unavailable=sorted(errors),
    )
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "catalog.json").write_text(json.dumps(candidate, indent=2) + "\n")
    old = ROOT / "reports/open-source-ai-catalog.json"
    prior = (
        {e["id"]: e for e in json.loads(old.read_text())["entries"]}
        if old.exists()
        else {}
    )
    changes = []
    for e in entries:
        prev = prior.get(e["id"], {})
        fields = [
            "revision",
            "release",
            "licenseUrl",
            "codeLicense",
            "codeClass",
            "archived",
            "maintenance",
            "advisories",
            "weightTermsStatus",
            "weightsTerms",
            "docs",
            "weights",
            "ollamaTag",
        ]
        delta = {k: [prev.get(k), e.get(k)] for k in fields if prev.get(k) != e.get(k)}
        if delta:
            changes.append({"id": e["id"], "changes": delta})
    discovered = {}
    for topic in [
        "local-llm",
        "rag",
        "multi-agent",
        "speech-synthesis",
        "workflow-automation",
    ]:
        result = api(
            "-X",
            "GET",
            "search/repositories",
            "-f",
            f"q=is:public archived:false topic:{topic}",
            "-f",
            "sort=stars",
            "-F",
            "per_page=10",
        )
        for r in result["items"]:
            if r["id"] not in {e["repoId"] for e in entries}:
                discovered[r["id"]] = r["html_url"]
    (OUT / "review.json").write_text(
        json.dumps(
            dict(
                checked=verified,
                unavailable=sorted(errors),
                removed=sorted(set(prior) - set(ids)),
                changes=changes,
                unreviewedDiscoveries=sorted(discovered.values()),
            ),
            indent=2,
        )
        + "\n"
    )
    print(
        f"{len(entries)} entries, {len(errors)} unavailable, {len(discovered)} discovery candidates"
    )
    if errors:
        raise SystemExit(
            "Partial snapshot: review unavailable sources; do not promote over a complete snapshot."
        )


if __name__ == "__main__":
    main()
