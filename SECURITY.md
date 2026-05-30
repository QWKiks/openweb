# Security Policy

## Supported Versions

We take the security of OpenWeb very seriously. The following versions of OpenWeb currently receive security updates:

| Version | Supported |
| ------- | --------- |
| 1.6.x   | ✅ Yes     |
| < 1.6.0 | ❌ No      |

---

## Reporting a Vulnerability

**Please do not open public GitHub Issues for security vulnerabilities.**

If you discover a security vulnerability in OpenWeb, please report it responsibly by:
1. Utilizing the **GitHub Private Vulnerability Reporting** feature on our repository (preferred).
2. Or contacting the maintainers privately via email at: **security@qwkiks.dev** (or your preferred contact email).

Please include the following details in your report:
* A detailed description of the vulnerability.
* Steps to reproduce or a Proof of Concept (PoC) script/scenario.
* Potential impact and how it could be exploited.

We will acknowledge your report within **48 hours** and provide a detailed response with a resolution plan within **7 days**. We request that you keep the vulnerability confidential until a patch has been officially released.

---

## Threat Model & Mitigations

OpenWeb acts as an execution bridge between local AI agents and web browsers. This design introduces specific security surfaces which OpenWeb mitigates out of the box:

### 1. Indirect Prompt Injection
* **Threat**: A malicious website visited by an AI agent using OpenWeb contains hidden prompt instructions designed to hijack the agent (e.g., instructing the agent to exfiltrate cookies, local files, or session tokens via the browser tools).
* **Mitigation**: 
  * OpenWeb separates read tools (like `snapshot`, `get_text`) from write/eval tools (like `click`, `fill`, `evaluate`).
  * We strongly advise users to monitor agent logs and avoid running agents with unrestricted tool-use on untrusted public websites.
  * **Bearer Authentication**: When `OPENWEB_TOKEN` is configured, only authorized controllers can execute browser actions.

### 2. WebSocket & Origin Protection
* **Threat**: A malicious website open in the user's browser attempts to connect to the local OpenWeb daemon running on port `10086` and send malicious commands.
* **Mitigation**:
  * **Local Host Binding**: The OpenWeb daemon strictly binds to `127.0.0.1` (localhost), meaning it is not exposed to the local network or the public internet by default.
  * **Origin Checking**: The daemon performs strict origin validation on all incoming WebSocket connections. Connections originating from unauthorized browser pages or non-extension origins are rejected instantly.
  * **Timing Attack Prevention**: Token validation utilizes `crypto.timingSafeEqual` to safeguard against timing side-channel attacks trying to guess the auth token.

### 3. Denial of Service (DoS)
* **Threat**: A malicious script attempts to exhaust local daemon resources by flooding it with rapid connection attempts or massive payloads.
* **Mitigation**:
  * **Rate Limiting**: The daemon implements built-in rate-limiting windows and burst protections for all client IPs.
  * **Replay Protection**: Nonce-tracking prevents registration replay attacks.
  * **Payload Restrictions**: Strict payload limits prevent buffer exhaustion.

---

## Secure Configuration Guide (Best Practices)

To ensure the highest level of security when running OpenWeb locally:

1. **Enable Bearer Authentication**: Always run the daemon with a secure token:
   ```bash
   OPENWEB_TOKEN="your-super-secure-random-token-here" npm start
   ```
2. **Force Encrypted Connections (WSS)**: When `OPENWEB_TOKEN` is enabled, the daemon enforces TLS/WSS connections for remote controllers, protecting your transport from local network eavesdropping.
3. **Check Your Origin Logs**: Monitor the startup logs (`LOG_FORMAT=json` or `DEBUG=daemon`) to audit connected extensions and controllers.
