import { Link } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Availability, LinkStatus } from "@/lib/nexora/types";

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("glass rounded-lg", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-wide">{title}</h2>}
            {subtitle && <p className="mono-xs mt-1 text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHead({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="glass rounded-lg p-4">
      <p className="mono-xs text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 text-2xl font-bold text-primary text-glow">{value}</p>
      {hint && <p className="mono-xs mt-1 text-muted-foreground">{hint}</p>}
    </div>
  );
}

const LINK_STYLES: Record<LinkStatus, string> = {
  CONFIRMED: "border-primary/60 bg-primary/15 text-primary",
  PROBABLE: "border-info/50 bg-info/10 text-info",
  POSSIBLE: "border-warn/50 bg-warn/10 text-warn",
  UNVERIFIED: "border-border bg-secondary/50 text-muted-foreground",
};

export function StatusPill({ status }: { status: LinkStatus }) {
  return (
    <span className={cn("mono-xs rounded border px-1.5 py-0.5", LINK_STYLES[status])}>{status}</span>
  );
}

const AVAIL_STYLES: Record<Availability, string> = {
  AVAILABLE: "border-primary/60 bg-primary/15 text-primary",
  "NOT FOUND": "border-warn/50 bg-warn/10 text-warn",
  "NOT EXTRACTED": "border-border bg-secondary/50 text-muted-foreground",
  UNKNOWN: "border-border bg-secondary/50 text-muted-foreground",
  "DATA INSUFFICIENT": "border-destructive/50 bg-destructive/10 text-destructive",
};

export function AvailabilityPill({ status }: { status: Availability }) {
  return (
    <span className={cn("mono-xs rounded border px-1.5 py-0.5", AVAIL_STYLES[status])}>
      {status}
    </span>
  );
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "green" | "warn" | "red" | "info" }) {
  const tones = {
    muted: "border-border bg-secondary/50 text-muted-foreground",
    green: "border-primary/50 bg-primary/10 text-primary",
    warn: "border-warn/50 bg-warn/10 text-warn",
    red: "border-destructive/50 bg-destructive/10 text-destructive",
    info: "border-info/50 bg-info/10 text-info",
  } as const;
  return <span className={cn("mono-xs rounded border px-1.5 py-0.5", tones[tone])}>{children}</span>;
}

export function NoCase() {
  return (
    <div className="glass mx-auto mt-10 max-w-lg rounded-lg p-8 text-center">
      <Upload className="mx-auto h-8 w-8 text-primary" />
      <h2 className="mt-4 text-base font-semibold">No case loaded</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        NEXORA displays real parsed data only. Import a UFDR ZIP to populate this screen — nothing is
        fabricated or pre-seeded.
      </p>
      <Link
        to="/import"
        className="glow mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        <Upload className="h-4 w-4" /> Import UFDR
      </Link>
    </div>
  );
}

export function Insufficient({ what, missing }: { what: string; missing?: string }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
      <p className="mono-xs font-semibold text-destructive">DATA INSUFFICIENT</p>
      <p className="mt-2 text-sm text-foreground">{what}</p>
      {missing && <p className="mt-2 text-sm text-muted-foreground">{missing}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        Absence of an artifact is never treated as evidence that the activity did not occur.
      </p>
    </div>
  );
}

export function fmt(ts: number | null) {
  if (ts === null) return "— unknown time";
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + "Z";
}
