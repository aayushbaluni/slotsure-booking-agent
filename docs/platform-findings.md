# Platform findings (Phase 1)

Two sources: **(D)** Agentplace docs, read 30 Oct 2026; **(L)** what still needs a *live* spike on a
published agent — these can only be observed by publishing and watching real calls, so they are
open until the agent is live. Everything here decides the agent-facing adapter, secret handling and
the confirmation strategy (build spec §3, §6, §12).

| Question | Finding | Src |
| --- | --- | --- |
| MCP or API integration? | A custom service connects as "a compatible MCP connection or an API integration." The docs describe **no general form for a custom REST endpoint**, so **MCP is the likely path**. | D |
| Can it store a bearer secret? | Not documented for a custom service; the docs only warn "do not place API keys in a public brief or URL." Account integrations use an OAuth-style authorize flow. **Assume a header secret may not be storable** — confirm live. | D/L |
| Request timeout length? | _tbd — not documented; observe live._ | L |
| Does it retry failed tool calls? | _tbd — observe live (drives whether replay must be idempotent against platform retries; it already is)._ | L |
| Are tool errors shown to the model? | _tbd — our MCP adapter returns errors as normal tool content (never throws) so the `say` + write_state are always visible regardless._ | L |
| Is there a confirmation the model cannot bypass? | Docs: "Define which actions… require confirmation" **and** "A displayed recommendation or proposed booking is not confirmation of an external write." So a confirmation concept exists, but whether it is model-proof is unstated. | D/L |
| Do calls arrive from one platform IP? | _tbd — observe live (fallback: higher platform-wide limit + the global 200 cap)._ | L |
| Can the adaptive page render slot buttons / a review card? | Docs: the agent "can update its page with task-specific content and components" (see /docs/how-agents-work/adaptive-ui), but specific components aren't named. _Confirm live; fall back to the `say` strings._ | D/L |

## Decisions so far

- **Agent adapter → MCP.** `AGENT_ADAPTER=mcp`. The MCP adapter (`/mcp`, Streamable HTTP, 7 tools
  mapped 1:1 to the core) is **built and verified locally**: a real MCP client connected with a
  bearer token, listed all 7 tools, and called `get_business_info` + `find_availability` (IST slots
  returned). REST (`/v1`) stays for the dashboard and tests, and is the ready fallback if the live
  spike shows Agentplace prefers API integration.
- **Confirmation → model-level gate (default), documented.** Keep `customer_confirmed` + the two-step
  quote→confirm; record the platform gap in the technical note. If the live spike shows no model-proof
  confirmation, the stronger option is the trusted confirmation page (build spec §6.5).

## Remaining Phase-1 steps (human-gated — need the Agentplace platform)

1. **Deploy the API publicly** so Agentplace can reach `/mcp` (always-on container; see README /
   build spec §3). MCP must be reachable over HTTPS at `https://<host>/mcp` with the `AGENT_API_KEY`.
2. **Create an Agentplace account** and publish a minimal agent on Luna.
3. **Connect the custom service** (MCP) and paste `agent/instructions.md` + the tool descriptions.
4. **Observe and fill the (L) rows above**, then keep only the adapter that worked and lock the
   confirmation choice.
5. **Gate:** a stranger's logged-out browser opens the published agent and sees slots from our server.
