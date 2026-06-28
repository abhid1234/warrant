# Arize AX tracing — opt-in observability example

Send the booker agent's **traces** to [Arize AX](https://arize.com/docs/ax) via
OpenTelemetry + OpenInference. This is **separate from Warrant's zero-dependency
core** (the verifier stays dep-free) — it lives here to show how the two layers
sit together:

| Layer | Sees | Catches |
|---|---|---|
| **Arize AX** (observability) | the **trace** — agent spans + LLM calls, including the lying agent's confident `Booked!` log | latency, errors, prompts/outputs, drift |
| **Warrant** (outcome) | the **world** — an independent probe of the airline system | the agent reported success but **changed nothing** |

They're complementary: traces tell you *how it ran*; a warrant tells you *whether
the world actually changed*. A clean-looking trace can still be a lie.

## Setup
```bash
pip install -r requirements.txt
cp .env.example .env          # add ARIZE_SPACE_ID + ARIZE_API_KEY (Arize → Space Settings & Keys)
set -a; . ./.env; set +a       # load env
python booker_agent.py
```
Without `OPENAI_API_KEY` it still runs (templated confirmation); set it to trace a
real LLM call. Without the Arize keys it builds the spans but doesn't export.

## What you'll see in Arize AX
Per run, a trace tree:
```
TravelBooker.book_flight        (AGENT)
├─ book_flight (tool)           (TOOL)   → ok | ERROR: payment declined
├─ ChatCompletion               (LLM)    ← auto-instrumented by OpenAIInstrumentor
└─ warrant.verify (probe)       (TOOL)   → warranted | refuted
```
Both the honest and lying agents emit `COMPLETED` traces. In the console output,
only the **world-state probe** flips the liar to `refuted`.

## How the instrumentation works
```python
from arize.otel import register
from openinference.instrumentation.openai import OpenAIInstrumentor

tracer_provider = register(space_id=..., api_key=..., project_name="warrant-booker")
OpenAIInstrumentor().instrument(tracer_provider=tracer_provider)   # before using openai
```
- `register()` wires an OTLP exporter to Arize AX.
- `OpenAIInstrumentor` auto-traces every OpenAI call.
- The agent/tool/probe spans are added manually with the OpenInference span-kind
  semantic conventions (`SpanAttributes.OPENINFERENCE_SPAN_KIND`).

## Adapting to *your* agent
Keep the `register()` + `OpenAIInstrumentor().instrument()` block, then either:
- swap in **your** agent loop (wrap it in an `AGENT` span; mark tool calls `TOOL`), or
- if you use a framework, replace the manual spans with its auto-instrumentor —
  `openinference-instrumentation-langchain` / `-llamaindex` / `-crewai` / `-dspy`.

To close the loop with Warrant, after your agent reports done, run a world-state
probe (see `packages/verify` — `httpJsonProbe` / `issueWarrant`) and attach the
verdict as a span attribute, exactly like `warrant.verify` here.

*Note: requires installing the packages above + Arize/OpenAI credentials; it does
not run in a dependency-restricted environment.*
