"use client";
import { Link2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@portfolio/ui/button";
import { Input } from "@portfolio/ui/input";
import { Label } from "@portfolio/ui/label";
import { Spinner } from "@portfolio/ui/spinner";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { idle, type FormState } from "@/lib/form-state";
import { cn } from "@/lib/utils";
import { addUrlAction } from "@/server/actions/workspace";

const ACCEPT = ".pdf,.docx,.md,.markdown,.txt";

export function Uploader({ slug, maxMb }: { slug: string; maxMb: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [state, urlAction] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await addUrlAction(slug, prev, fd);
    if (res.status === "success") {
      toast.success(res.message ?? "Added");
      router.refresh();
    } else if (res.status === "error" && !res.fieldErrors) toast.error(res.message ?? "Couldn't add that URL");
    return res;
  }, idle);

  async function upload(files: FileList | File[]) {
    const list = [...files];
    if (!list.length) return;
    const tooBig = list.filter((f) => f.size > maxMb * 1024 * 1024);
    if (tooBig.length) {
      toast.error(`${tooBig.map((f) => f.name).join(", ")}: files must be ${maxMb} MB or smaller.`);
      return;
    }
    const fd = new FormData();
    list.forEach((f) => fd.append("file", f));
    setUploading(true);
    try {
      const res = await fetch(`/api/w/${slug}/documents`, { method: "POST", body: fd });
      const body = (await res.json().catch(() => null)) as { results?: { name: string; ok: boolean; error?: string }[]; error?: { message: string } } | null;
      if (!body?.results) {
        toast.error(body?.error?.message ?? "Upload failed.");
        return;
      }
      const ok = body.results.filter((r) => r.ok);
      if (ok.length) toast.success(`Uploaded ${ok.length} file${ok.length === 1 ? "" : "s"}. Indexing in the background…`);
      body.results.filter((r) => !r.ok).forEach((r) => toast.error(`${r.name}: ${r.error}`));
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
        className={cn("flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card px-6 py-8 text-center transition-colors", dragging && "border-primary bg-primary/5")}
      >
        <Upload className="size-6 text-muted-foreground" aria-hidden />
        <p className="mt-2 font-medium">Drop files here</p>
        <p className="text-sm text-muted-foreground">PDF, Word (.docx), Markdown or text · up to {maxMb} MB each</p>
        <input ref={inputRef} id="file-input" type="file" accept={ACCEPT} multiple className="sr-only" aria-label="Upload files" onChange={(e) => e.target.files && upload(e.target.files)} />
        <Button type="button" className="mt-4" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Spinner label="Uploading" /> : null}
          {uploading ? "Uploading…" : "Choose files"}
        </Button>
      </div>
      <form action={urlAction} className="flex flex-col justify-center gap-2 rounded-xl border bg-card p-5">
        <Label htmlFor="url" className="flex items-center gap-1.5">
          <Link2 className="size-4" aria-hidden /> Add a web page
        </Label>
        <Input id="url" name="url" type="url" required placeholder="https://example.com/help/returns" aria-describedby="url-hint url-error" />
        <p id="url-hint" className="text-xs text-muted-foreground">
          Public pages only. robots.txt is respected.
        </p>
        <FieldError id="url-error" errors={state.fieldErrors?.url} />
        <SubmitButton pendingText="Fetching">Add page</SubmitButton>
      </form>
    </div>
  );
}
