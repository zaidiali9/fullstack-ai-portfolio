import { ThemeToggle } from "@portfolio/ui/theme-toggle";
import { Brand } from "@/components/brand";

const waves = [0, 1, 2, 3, 4, 5];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Brand />
          <ThemeToggle />
        </div>
        <main id="main" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {children}
        </main>
      </div>
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-end lg:p-12">
        <svg aria-hidden viewBox="0 0 600 400" className="absolute inset-0 h-full w-full opacity-20" preserveAspectRatio="none">
          {waves.map((i) => (
            <path
              key={i}
              d={"M0 " + (120 + i * 45) + " C 150 " + (80 + i * 45) + ", 300 " + (160 + i * 45) + ", 600 " + (110 + i * 45)}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          ))}
        </svg>
        <blockquote className="relative max-w-md text-lg font-medium">
          Triage, first drafts and summaries handled by AI, with every drafted answer traceable to your own knowledge base.
        </blockquote>
        <p className="relative mt-3 text-sm opacity-80">Bookwell · portfolio demo</p>
      </aside>
    </div>
  );
}
