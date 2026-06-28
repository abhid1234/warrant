"""
Instrument the Warrant booker agent → send traces to Arize AX.

This is an OPT-IN observability example, separate from Warrant's zero-dep core.
It shows the two layers side by side:

  • Arize AX (observability)  — sees the *trace*: the agent's spans + LLM calls,
    including the lying agent's confident "Booked!" log.
  • Warrant (outcome)         — sees the *world*: an independent probe of the
    airline system. Only this catches that the lying agent changed nothing.

Run:
    pip install -r requirements.txt
    cp .env.example .env   # fill in ARIZE_SPACE_ID / ARIZE_API_KEY (+ OPENAI_API_KEY)
    set -a; . ./.env; set +a
    python booker_agent.py
"""
import os

from opentelemetry import trace
from openinference.semconv.trace import SpanAttributes, OpenInferenceSpanKindValues

AGENT = OpenInferenceSpanKindValues.AGENT.value
TOOL = OpenInferenceSpanKindValues.TOOL.value


def setup_tracing() -> "trace.Tracer":
    """Register the Arize AX exporter + auto-instrument the OpenAI SDK."""
    space_id, api_key = os.environ.get("ARIZE_SPACE_ID"), os.environ.get("ARIZE_API_KEY")
    if space_id and api_key:
        from arize.otel import register
        from openinference.instrumentation.openai import OpenAIInstrumentor

        tracer_provider = register(
            space_id=space_id,
            api_key=api_key,
            project_name=os.environ.get("ARIZE_PROJECT_NAME", "warrant-booker"),
        )
        # Auto-trace every OpenAI call. Done BEFORE openai is imported/used.
        OpenAIInstrumentor().instrument(tracer_provider=tracer_provider)
        print("→ Arize AX tracing enabled (project:", os.environ.get("ARIZE_PROJECT_NAME", "warrant-booker"), ")")
        return trace.get_tracer("warrant.booker")
    print("! ARIZE_SPACE_ID / ARIZE_API_KEY not set — spans build but won't export.")
    return trace.get_tracer("warrant.booker")


# ---- the airline 'world' the agent acts on AND the verifier probes ----------
class Airline:
    def __init__(self):
        self._store = {}

    def book(self, pnr, record, *, fail=False):
        if fail:
            return None  # payment declined → nothing written
        self._store[pnr] = record
        return pnr

    def lookup(self, pnr):
        return self._store.get(pnr)


def _llm_confirmation(req, pnr) -> str:
    """A real OpenAI call (auto-traced by Arize) — or a templated fallback."""
    if not os.environ.get("OPENAI_API_KEY"):
        return f"All set! Booked {req['from']}->{req['to']}, confirmation {pnr}."
    from openai import OpenAI

    client = OpenAI()
    resp = client.chat.completions.create(
        model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[{"role": "user", "content": f"Write a one-sentence flight booking confirmation for {req['from']}->{req['to']}, PNR {pnr}."}],
    )
    return (resp.choices[0].message.content or "").strip()


# ---- the agent: an AGENT span wrapping a TOOL (book) + an LLM (confirm) ------
def booker_agent(tracer, req, airline, *, honest: bool) -> dict:
    name = "TravelBooker" if honest else "CheapBooker"
    with tracer.start_as_current_span(f"{name}.book_flight") as span:
        span.set_attribute(SpanAttributes.OPENINFERENCE_SPAN_KIND, AGENT)
        span.set_attribute(SpanAttributes.INPUT_VALUE, str(req))
        pnr = "X7K2QL" if honest else "QZ99WT"

        with tracer.start_as_current_span("book_flight (tool)") as tool:
            tool.set_attribute(SpanAttributes.OPENINFERENCE_SPAN_KIND, TOOL)
            tool.set_attribute(SpanAttributes.TOOL_NAME, "book_flight")
            booked = airline.book(pnr, {"passenger": req["passenger"], "itinerary": f"{req['from']}-{req['to']}"}, fail=not honest)
            tool.set_attribute(SpanAttributes.OUTPUT_VALUE, "ok" if booked else "ERROR: payment declined")

        # The agent reports COMPLETED either way — the trace looks clean.
        summary = _llm_confirmation(req, pnr)
        span.set_attribute(SpanAttributes.OUTPUT_VALUE, summary)
        return {"status": "COMPLETED", "pnr": pnr, "summary": summary}


# ---- the Warrant layer: an independent world-state probe → a verdict --------
def verify_outcome(tracer, claimed_pnr, airline) -> dict:
    with tracer.start_as_current_span("warrant.verify (world-state probe)") as span:
        span.set_attribute(SpanAttributes.OPENINFERENCE_SPAN_KIND, TOOL)
        span.set_attribute(SpanAttributes.INPUT_VALUE, f"GET /pnr/{claimed_pnr}")
        observed = airline.lookup(claimed_pnr)
        verdict = "warranted" if observed else "refuted"
        span.set_attribute(SpanAttributes.OUTPUT_VALUE, verdict)
        return {"verdict": verdict, "observed": observed}


def main():
    tracer = setup_tracing()
    req = {"from": "SFO", "to": "JFK", "passenger": "Alex Rivera"}
    airline = Airline()

    print("\nBoth agents return COMPLETED. Arize sees both traces. Watch the verdicts:\n")
    for honest in (True, False):
        result = booker_agent(tracer, req, airline, honest=honest)
        outcome = verify_outcome(tracer, result["pnr"], airline)
        mark = "✓ WARRANTED" if outcome["verdict"] == "warranted" else "✗ REFUTED"
        print(f"  status={result['status']}  claim=\"{result['summary']}\"")
        print(f"    world-state probe → observed={outcome['observed']}  →  {mark}\n")

    print("Arize AX captured the trace for both — only the world-state probe caught the lie.")


if __name__ == "__main__":
    main()
