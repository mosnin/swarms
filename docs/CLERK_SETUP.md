# Production login with Clerk (OIDC)

Swarms authenticates humans with a **provider-agnostic OAuth 2.0
authorization-code + PKCE flow** (`src/server/auth/oauth.ts`). Clerk is a
standards-compliant OIDC provider, so it plugs into that flow through
environment variables — **no `@clerk/nextjs` SDK, no code changes**.

What Clerk does: authenticate the person and return their **verified email**.
What Swarms does: provision/look-up its own user + organization for that email
and mint its own signed session cookie. API keys, scopes, org isolation, and the
ledger are unaffected — Clerk is only the front door.

> The dev-login card (`AUTH_MODE=dev`) is intentionally disabled in production
> (`/api/auth/dev-login` returns `403`). Until `AUTH_MODE=oauth` is configured,
> production sign-in cannot work. This is that configuration.

---

## 1. Create a Clerk OAuth application

In the [Clerk dashboard](https://dashboard.clerk.com) for your instance:

1. **Configure → OAuth applications → Add OAuth application** (Clerk acts as the
   identity provider — this is *not* a social-connection).
2. **Scopes:** enable `openid`, `email`, `profile`.
3. **Redirect URI:** add your production callback exactly —
   `https://<your-prod-domain>/api/auth/callback`
   (add `http://localhost:3000/api/auth/callback` too if you test OAuth locally).
4. Save, then copy the **Client ID** and **Client Secret** (shown once).

Note your **Frontend API domain** (`<clerk-domain>` below). It looks like
`clerk.your-app.com` on a production instance, or
`your-slug.clerk.accounts.dev` on a Clerk development instance. Confirm the
endpoint paths against `https://<clerk-domain>/.well-known/openid-configuration`.

---

## 2. Set the environment variables

Set these on the **web app** (Vercel → Project → Settings → Environment
Variables → Production). The redirect URL must byte-for-byte match the URI
registered in Clerk.

| Variable | Value |
| --- | --- |
| `AUTH_MODE` | `oauth` |
| `AUTH_PROVIDER_LABEL` | `Clerk` (cosmetic — shown on the sign-in button) |
| `OAUTH_CLIENT_ID` | Clerk OAuth app **Client ID** |
| `OAUTH_CLIENT_SECRET` | Clerk OAuth app **Client Secret** |
| `OAUTH_AUTHORIZE_URL` | `https://<clerk-domain>/oauth/authorize` |
| `OAUTH_TOKEN_URL` | `https://<clerk-domain>/oauth/token` |
| `OAUTH_USERINFO_URL` | `https://<clerk-domain>/oauth/userinfo` |
| `OAUTH_REDIRECT_URL` | `https://<your-prod-domain>/api/auth/callback` |
| `OAUTH_SCOPES` | `openid email profile` (default — optional) |

`env.ts` validates these at boot: with `AUTH_MODE=oauth` in production, a missing
`OAUTH_*` value **fails the deploy** rather than breaking on first sign-in.

You must also have the other production secrets set (also boot-validated):
`SESSION_SECRET`, `API_KEY_PEPPER`, `WEBHOOK_SIGNING_SECRET`,
`CONNECTOR_ENCRYPTION_KEY`, `INTERNAL_WORKER_SECRET`, and `DATABASE_URL`.
Generate the HMAC secrets with `openssl rand -hex 32`.

---

## 3. Redeploy and verify

1. Redeploy the web app so it boots with the new env.
2. Visit `/login` → the button reads **“Continue with Clerk”**.
3. Click it → `/api/auth/login` redirects to Clerk with a PKCE challenge and an
   anti-CSRF `state`.
4. Sign in at Clerk → Clerk redirects to `/api/auth/callback`, which verifies
   `state`, exchanges the code, reads your verified email, provisions your
   user/org on first login, sets the session cookie, and lands you on
   `/dashboard`.

### Troubleshooting

- **Redirected to `/dashboard?auth_error=invalid_state`** — the `state`/PKCE
  cookie didn't survive the round trip. Usually a redirect-URI mismatch or a
  cross-domain hop; confirm `OAUTH_REDIRECT_URL` equals the Clerk-registered URI
  and points at the same host the user is on.
- **`auth_error=exchange_failed`** — token exchange or userinfo was rejected.
  Recheck the Client Secret and the three `OAUTH_*_URL` hosts.
- **“OAuth email is not verified by the identity provider”** — the login
  succeeded but Clerk's userinfo returned `email_verified` ≠ `true` (or omitted
  it). Swarms fails closed here because local identity is keyed on email —
  trusting an unverified address would be an account-takeover primitive. Ensure
  the Clerk instance requires email verification (it does by default) and that
  the `email` scope is granted so the claim is present.

---

## Why not the Clerk SDK?

`@clerk/nextjs` would replace Swarms' entire session model (signed cookie →
Clerk session JWT), require a `ClerkProvider` and middleware, and couple the
platform to one vendor. The OIDC path keeps Clerk swappable for any IdP (Auth0,
Okta, Google, Keycloak) by changing only the `OAUTH_*` env, and leaves the
authz/session/provisioning code — already built and tested — untouched.
