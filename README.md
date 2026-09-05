# Agentic Checkout — Mandate-Gated AI Purchase Agent

Built for the Razorpay Buildathon 2026 — **AI Growth & Agentic Commerce** track:
*"Build an agent that ... makes a merchant transactable by an AI buyer end to end."*

## What this is
A conversational checkout agent that lets a user describe a purchase in plain language
For example "buy an item in the electronics category costing less than 2000", it carries out the request safely but only
after the request passes through a **cryptographically signed, independently verified
The Mandate Gate is inspired by Google's AP2 (Agent Payments Protocol).

The main point is: **the AI agent has no direct authority to move money**, it can only
suggest a purchase. There is a separate, deterministic verification layer—plain code, not a
prompt  checks that proposal against a signed Intent Mandate before anything is
is authorized this means that even if the agent is confused, misled, or has been prompt-injected,
It cannot result in a purchase beyond the user's authorized limits.

Considering how tight the schedule was, I decided to use a rule-based agent rather than integrate a complete LLM, since attempting to debug a new AI SDK under time pressure could have caused something that was already securely functioning to break. The system is currently arranged in such a way that a real LLM can be added at a later stage without affecting the security layer underneath.

## Architecture

```
User message ("buy X under ₹Y")
        │
        ▼
Rule-based agent (/chat) — parses budget + category, finds matching catalog item
        │  (proposes only — no authority to spend)
        ▼
issueIntentMandate() — signs a JWT: { maxAmount, category, nonce, expiresIn }
        │
        ▼
verifyPurchase() — THE GATE (independent of the agent):
  ✓ signature valid?        ✓ within max amount?
  ✓ not expired?            ✓ category matches?
  ✓ nonce not already used? (replay protection)
        │
   ┌────┴────┐
 ALLOWED   BLOCKED
   │          │
   ▼          ▼
Mock Razorpay   Graceful error returned,
order created   purchase NOT completed
   │
   ▼
Audit log entry for every step (/audit)
```

## Why mandates, not just "trust the AI"

Most simple agent demos rely on prompting the LLM to "please ask before spending
That isn't a genuine security boundary since it can be circumvented through confusion,
Either the input is ambiguous or it is intentional prompt injection.

This project instead uses **signed, verifiable tokens (JWTs)** with:
- **Amount + category bounds** baked into the signature — tampering breaks the signature
- **Expiry** (`expiresIn: "15m"`) — a mandate can't be used indefinitely
- **Single-use nonce** — the exact same signed mandate cannot be replayed to make a
  second purchase

Verification happens in `verifyPurchase()`, called directly by the server — the LLM/agent
There is no section of the code which can generate a Razorpay order without going through this gate first.

## Explainability & audit trail

Every step  the user's message, the mandate issued, the gate's pass/fail decision (with
reason), and the resulting order — is logged to an in-memory audit trail, viewable at:

```
GET /audit
```

This directly satisfies the brief's requirement that "every money action" be explainable.

## Graceful failure handling

Tested failure modes, all returning clean, human-readable errors (no crashes):
- **Out of stock** — item exists but `stock <= 0`
- **No matching item** — nothing in that category fits the budget
- **Mandate replay** — reusing an already-spent mandate is rejected
- **Amount/category mismatch** — a proposed purchase outside the mandate's bounds is blocked

## Current scope & honest limitations

Built under a tight hackathon deadline. Deliberate trade-offs made:

- **Agent is rule-based (regex parsing), not an LLM.** It extracts a budget and category
  from the message using pattern matching, then calls the exact same mandate functions an
  LLM-based agent would call as "tools." Swapping in a real LLM (e.g. Gemini/Claude
  function-calling) is the natural next step — the mandate/gate/audit architecture
  underneath does not need to change.
- **Razorpay integration is mocked** (`createMockOrder()`), since test-mode API keys
  require KYC onboarding (PAN) that wasn't available in time. The mock returns the same
  response shape as Razorpay's real Orders API, so swapping in the real `razorpay` npm
  SDK is a drop-in replacement, not a rewrite.
- **In-memory storage only** (catalog cache, used-nonce set, audit log) — fine for a
  demo, would move to a real database for production.

## Running it

```bash
npm install
node server.js
```

Server runs on `http://localhost:4000`.

### Try it

```bash
# Full conversational flow
curl -X POST http://localhost:4000/chat -H "Content-Type: application/json" \
  -d '{"message":"buy something in electronics under 2000"}'

# View the audit trail
curl http://localhost:4000/audit

# Manual mandate issuance + checkout (for testing the gate directly)
curl -X POST http://localhost:4000/mandates/intent -H "Content-Type: application/json" \
  -d '{"maxAmount":2000,"category":"apparel"}'
```

## Tech stack

- Node.js + Express
- `jsonwebtoken` — mandate signing/verification
- `uuid` — nonce generation for replay protection
- Product data from [fakestoreapi.com](https://fakestoreapi.com) (public demo API)

## What's next

- Swap the rule-based parser for a real LLM (Gemini/Claude) using function-calling,
  with the same tool boundary: the LLM proposes, the gate decides.
- Swap `createMockOrder()` for the real Razorpay Orders API once test-mode keys are set up.
- Add a simple chat frontend.
- Persist the audit log and nonce store to a real database.
