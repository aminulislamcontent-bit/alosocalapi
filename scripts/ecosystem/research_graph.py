"""Offline LangGraph retrieval/review adapter. One request, no DB, checkpoint, tools or LLM."""

from typing import TypedDict
import unicodedata


class Request(TypedDict, total=False):
    query: str
    notes: list[str]
    excerpts: list[str]
    decision: str


def terms(text):
    return set(
        "".join(
            c if unicodedata.category(c)[0] in "LMN" else " " for c in text.casefold()
        ).split()
    )


def run(query, notes):
    from langgraph.graph import StateGraph, START, END
    from langsmith import tracing_context

    if (
        not isinstance(query, str)
        or not 0 < len(query) <= 500
        or not isinstance(notes, list)
        or len(notes) > 100
        or not all(isinstance(n, str) and len(n) <= 2000 for n in notes)
    ):
        raise ValueError("Bounded plain text required")

    def retrieve(state):
        words = terms(state["query"])
        ranked = sorted(
            ((len(words & terms(n)), n) for n in state["notes"]), key=lambda v: -v[0]
        )
        return {"excerpts": [n for score, n in ranked if score][:3]}

    def review(state):
        return {
            "decision": (
                "human-review-required"
                if state["excerpts"]
                else "insufficient-evidence"
            )
        }

    graph = StateGraph(Request)
    graph.add_node("retrieve", retrieve)
    graph.add_node("review", review)
    graph.add_edge(START, "retrieve")
    graph.add_edge("retrieve", "review")
    graph.add_edge("review", END)
    with tracing_context(enabled=False):
        result = graph.compile().invoke({"query": query, "notes": notes})
    return {k: result[k] for k in ("excerpts", "decision")}


if __name__ == "__main__":
    import json, sys

    data = json.loads(sys.stdin.buffer.read(1_000_001))
    print(json.dumps(run(data["query"], data["notes"]), ensure_ascii=False))
