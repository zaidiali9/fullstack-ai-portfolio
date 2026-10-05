"use client";
import { Sparkles } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { toast } from "sonner";
import { AiUnavailable } from "@portfolio/ui/ai-unavailable";
import { Button } from "@portfolio/ui/button";
import { Checkbox } from "@portfolio/ui/checkbox";
import { Input } from "@portfolio/ui/input";
import { Label } from "@portfolio/ui/label";
import { Spinner } from "@portfolio/ui/spinner";
import { Textarea } from "@portfolio/ui/textarea";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { idle, type FormState } from "@/lib/form-state";
import { saveProductAction } from "@/server/actions/admin";

interface ProductValues {
  id?: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  priceCents: number;
  stock: number;
  active: boolean;
  featured: boolean;
  attributes: Record<string, string>;
}

const CATS = ["kitchen", "outdoor", "home", "bath", "stationery", "garden"];
const select =
  "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ProductForm({ product, aiAvailable }: { product?: ProductValues; aiAvailable: boolean }) {
  const [state, action] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await saveProductAction(product?.id ?? null, prev, fd);
    if (res.status === "error" && !res.fieldErrors) toast.error(res.message ?? "Couldn't save");
    return res;
  }, idle);
  const [description, setDescription] = useState(product?.description ?? "");
  const [highlights, setHighlights] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [usedAi, setUsedAi] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fe = state.fieldErrors ?? {};

  async function draft() {
    const fd = new FormData(formRef.current!);
    setDrafting(true);
    try {
      const res = await fetch("/api/admin/describe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: fd.get("name"), category: fd.get("category"), attributes: fd.get("attributes"), notes: fd.get("notes") || undefined }),
      });
      const body = (await res.json()) as { draft?: { description: string; highlights: string[] }; warnings?: string[]; error?: { message: string } };
      if (!res.ok || !body.draft) {
        toast.error(body.error?.message ?? "Couldn't generate a draft");
        return;
      }
      setDescription(body.draft.description);
      setHighlights(body.draft.highlights);
      setWarnings(body.warnings ?? []);
      setUsedAi(true);
      toast.success("AI draft ready — review and edit before saving");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <form ref={formRef} action={action} className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-5 rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required defaultValue={product?.name} maxLength={120} aria-invalid={!!fe.name} aria-describedby="name-error" />
            <FieldError id="name-error" errors={fe.name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <select id="category" name="category" defaultValue={product?.category ?? "kitchen"} className={select}>
              {CATS.map((c) => (
                <option key={c} value={c}>
                  {c[0]!.toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">URL slug</Label>
            <Input id="slug" name="slug" defaultValue={product?.slug} placeholder="generated from the name" aria-describedby="slug-error" />
            <FieldError id="slug-error" errors={fe.slug} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="attributes">Facts (one per line, “Key: value”)</Label>
          <Textarea
            id="attributes"
            name="attributes"
            rows={4}
            defaultValue={Object.entries(product?.attributes ?? {})
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}
            placeholder={"Material: Stainless steel\nCapacity: 750 ml"}
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="description">Description</Label>
            {aiAvailable ? (
              <Button type="button" variant="outline" size="sm" onClick={draft} disabled={drafting}>
                {drafting ? <Spinner /> : <Sparkles className="size-3.5" aria-hidden />} {drafting ? "Drafting…" : "Draft with AI"}
              </Button>
            ) : (
              <AiUnavailable />
            )}
          </div>
          <Textarea id="description" name="description" rows={7} required value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={!!fe.description} aria-describedby="description-error description-hint" />
          <p id="description-hint" className="text-xs text-muted-foreground">
            {usedAi ? "AI draft based only on the name, category and facts above. Review every claim before saving." : "The AI draft uses only the facts you enter; nothing is saved until you click Save."}
          </p>
          <FieldError id="description-error" errors={fe.description} />
          {warnings.length ? (
            <p role="alert" className="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Check the draft: {warnings.join("; ")}.
            </p>
          ) : null}
          {highlights.length ? (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Suggested highlights (copy any you want into the description or facts)</p>
              <ul className="mt-1 list-disc pl-5">
                {highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes for the AI draft (optional, not saved)</Label>
            <Input id="notes" name="notes" maxLength={500} placeholder="e.g. aimed at weekend campers" />
          </div>
        </div>
        <input type="hidden" name="usedAiDraft" value={String(usedAi)} />
      </div>
      <aside className="h-fit space-y-4 rounded-xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="price">Price (USD)</Label>
          <Input id="price" name="price" type="number" min="0.5" step="0.01" required defaultValue={product ? (product.priceCents / 100).toFixed(2) : ""} aria-describedby="price-error" />
          <FieldError id="price-error" errors={fe.priceCents} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stock">Stock</Label>
          <Input id="stock" name="stock" type="number" min="0" step="1" required defaultValue={product?.stock ?? 0} />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="active" name="active" defaultChecked={product?.active ?? true} />
          <Label htmlFor="active" className="font-normal">
            Visible in the store
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="featured" name="featured" defaultChecked={product?.featured ?? false} />
          <Label htmlFor="featured" className="font-normal">
            Featured on the home page
          </Label>
        </div>
        <SubmitButton className="w-full" pendingText="Saving">
          Save product
        </SubmitButton>
      </aside>
    </form>
  );
}
