# Platform findings (Phase 1)

Record ONLY what the Phase 1 integration spike actually observed. These answers decide the
agent-facing adapter, secret handling and the confirmation strategy (build spec §3, §6, §12).

| Question | Finding | Evidence |
| --- | --- | --- |
| MCP or API integration? | _tbd_ | |
| Can it store a bearer secret? | _tbd_ | |
| Request timeout length? | _tbd_ | |
| Does it retry failed tool calls? | _tbd_ | |
| Are tool errors shown to the model? | _tbd_ | |
| Is there a confirmation the model cannot bypass? | _tbd_ | |
| Do calls arrive from one platform IP? | _tbd_ | |
| Can the adaptive page render slot buttons + a review card? | _tbd_ | |

**Decision — agent adapter:** _rest | mcp_ (set `AGENT_ADAPTER`; build only the one that worked).
**Decision — confirmation:** _model-gate (documented) | trusted confirmation page_ (build spec §6.5).
