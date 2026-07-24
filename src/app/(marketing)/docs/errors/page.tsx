import type { Metadata } from "next";

import { CodeBlock } from "@/app/(marketing)/docs/_components/code-block";
import { DocsShell, nextAfter } from "@/app/(marketing)/docs/_components/docs-shell";
import { C, P, Section } from "@/app/(marketing)/docs/_components/section";

export const metadata: Metadata = { title: "Errors — Swarms Docs" };

const TOC = [
  { id: "shape", label: "Error shape" },
  { id: "taxonomy", label: "The taxonomy" },
  { id: "retry", label: "Retrying" },
];

const CODES: { code: string; status: number; retryable: boolean; meaning: string }[] = [
  { code: "VALIDATION", status: 400, retryable: false, meaning: "The request body failed schema validation." },
  { code: "UNAUTHORIZED", status: 401, retryable: false, meaning: "Missing or invalid API key." },
  { code: "FORBIDDEN", status: 403, retryable: false, meaning: "Authenticated, but not allowed to do this." },
  { code: "POLICY_DENIED", status: 403, retryable: false, meaning: "A governance policy blocked the action." },
  { code: "NOT_FOUND", status: 404, retryable: false, meaning: "No such resource." },
  { code: "CAPABILITY_NOT_FOUND", status: 404, retryable: false, meaning: "Unknown skill or capability." },
  { code: "CONFLICT", status: 409, retryable: false, meaning: "State conflict (e.g. agent is suspended)." },
  { code: "IDEMPOTENCY_CONFLICT", status: 409, retryable: false, meaning: "Key reused with a different payload." },
  { code: "PAYMENT_REQUIRED", status: 402, retryable: false, meaning: "Insufficient balance to proceed." },
  { code: "BUDGET_EXCEEDED", status: 402, retryable: false, meaning: "The action would breach a hard budget." },
  { code: "RATE_LIMITED", status: 429, retryable: true, meaning: "Too many requests — back off and retry." },
  { code: "SANDBOX_FAILURE", status: 500, retryable: true, meaning: "The execution sandbox failed." },
  { code: "UPSTREAM_ERROR", status: 502, retryable: true, meaning: "A dependency returned an error." },
  { code: "TIMEOUT", status: 504, retryable: true, meaning: "The operation timed out." },
  { code: "EXECUTION_FAILED", status: 500, retryable: false, meaning: "The job ran but did not succeed." },
  { code: "CONFIG_ERROR", status: 500, retryable: false, meaning: "Server misconfiguration." },
  { code: "INTERNAL", status: 500, retryable: false, meaning: "Unexpected server error." },
];

export default function ErrorsDocsPage() {
  return (
    <DocsShell
      eyebrow="Errors"
      title={
        <>
          One shape, <span className="font-semibold">every failure.</span>
        </>
      }
      lede="Every error the API returns is a typed member of one taxonomy: a stable code, an HTTP status, and a retryable hint. Internals never leak — unexpected failures collapse to a generic INTERNAL."
      toc={TOC}
      next={nextAfter("/docs/errors")}
    >
      <Section id="shape" n="01" title="Error shape">
        <P>
          Failures serialize to a single envelope under <C>error</C>. The <C>code</C> is stable and
          machine-readable; the <C>message</C> is for humans; <C>retryable</C> tells you whether trying
          again could help.
        </P>
        <CodeBlock label="json">{`{
  "error": {
    "code": "BUDGET_EXCEEDED",
    "message": "This action would exceed the monthly budget",
    "retryable": false,
    "details": { "limitMinor": 100000, "wouldSpendMinor": 100500 }
  }
}`}</CodeBlock>
      </Section>

      <Section id="taxonomy" n="02" title="The taxonomy">
        <P>The full set of codes, their default HTTP status, and whether a retry can succeed.</P>
        <div className="overflow-x-auto rounded-xl border border-neutral-100">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50 text-neutral-500">
                <th className="px-4 py-2.5 font-medium">Code</th>
                <th className="px-4 py-2.5 font-medium">HTTP</th>
                <th className="px-4 py-2.5 font-medium">Retryable</th>
                <th className="px-4 py-2.5 font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {CODES.map((c) => (
                <tr key={c.code} className="border-b border-neutral-50 last:border-0">
                  <td className="px-4 py-2.5">
                    <code className="font-mono text-[12px] text-violet-700">{c.code}</code>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-neutral-500">{c.status}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        c.retryable ? "bg-emerald-500/10 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {c.retryable ? "yes" : "no"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">{c.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="retry" n="03" title="Retrying">
        <P>
          Retry only <C>retryable: true</C> codes, with exponential backoff. On <C>RATE_LIMITED</C> the
          details carry a <C>retryAtMs</C> hint — wait until then. Because every paid action is idempotent,
          replaying a request after a network blip is always safe: you get the original result, charged
          once. See <C>/docs/billing</C>.
        </P>
      </Section>
    </DocsShell>
  );
}
