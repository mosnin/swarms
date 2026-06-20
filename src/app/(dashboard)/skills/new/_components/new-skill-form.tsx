"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
const VISIBILITIES = ["private", "unlisted", "public"] as const;

export function NewSkillForm() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<(typeof VISIBILITIES)[number]>("private");
  const [riskLevel, setRiskLevel] = useState<(typeof RISK_LEVELS)[number]>("low");
  const [tags, setTags] = useState("");
  const [priceMinor, setPriceMinor] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          name,
          description: description || null,
          visibility,
          riskLevel,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          defaultPriceMinor: Number.parseInt(priceMinor, 10) || 0,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to create skill");
      router.push(`/skills/${body.data.skill.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create skill");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4 rounded-lg border p-6">
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Web Summarizer"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Slug" hint="lowercase-kebab-case, unique per organization">
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="web-summarizer"
          className="w-full rounded-md border px-3 py-2 font-mono text-sm"
        />
      </Field>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Visibility">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as typeof visibility)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Risk level">
          <select
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value as typeof riskLevel)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tags" hint="comma separated">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="research, summarization"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Default price (minor units)">
          <input
            value={priceMinor}
            onChange={(e) => setPriceMinor(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </Field>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={busy || !name.trim() || !slug.trim()}>
        {busy ? "Creating…" : "Create skill"}
      </Button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {children}
    </label>
  );
}
