import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Bot,
  Database,
  FileText,
  GitBranch,
  History,
  LayoutDashboard,
  Map,
  PenTool,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useNexora } from "@/lib/nexora/store";
import { shortHash } from "@/lib/nexora/hash";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/import", label: "UFDR Import", icon: Upload },
  { to: "/evidence", label: "Evidence Explorer", icon: Search },
  { to: "/entities", label: "Entities", icon: Users },
  { to: "/evolution", label: "Entity Evolution", icon: History },
  { to: "/graph", label: "Knowledge Graph", icon: GitBranch },
  { to: "/timeline", label: "Timeline", icon: Activity },
  { to: "/geo", label: "Geospatial Map", icon: Map },
  { to: "/financial", label: "Financial / UPI", icon: Banknote },
  { to: "/contradictions", label: "Contradictions", icon: AlertTriangle },
  { to: "/missing", label: "Missing Evidence", icon: Database },
  { to: "/ai", label: "AI Investigation", icon: Bot },
  { to: "/canvas", label: "Investigation Canvas", icon: PenTool },
  { to: "/collab", label: "Collaboration", icon: UsersRound },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { bundle, ready } = useNexora();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/70 bg-[oklch(0.15_0.014_168/85%)] backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-2 px-4 py-5">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <p className="text-lg leading-none font-bold tracking-[0.18em] text-primary text-glow">
              NEXORA
            </p>
            <p className="mono-xs mt-1 text-muted-foreground">FORENSIC COMMAND CENTER</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent/70 text-primary glow font-medium"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/70 px-4 py-3">
          <p className="mono-xs text-cyber-dim">OFFLINE · LOCAL PROCESSING</p>
          <p className="mono-xs mt-1 text-muted-foreground">NO TELEMETRY · NO UPLOADS</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-[oklch(0.15_0.014_168/80%)] px-4 py-3 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary lg:hidden" />
              <div>
                <p className="text-sm font-semibold">
                  {bundle ? bundle.name : ready ? "No case loaded" : "Initializing local store…"}
                </p>
                <p className="mono-xs text-muted-foreground">
                  {bundle
                    ? `${bundle.id} · SHA-256 ${shortHash(bundle.zipSha256)} · ${bundle.artifacts.length} artifacts`
                    : "Import a UFDR ZIP to begin"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="mono-xs rounded border border-primary/40 bg-primary/10 px-2 py-1 text-primary">
                AIR-GAPPED MODE
              </span>
              <Link
                to="/import"
                className="mono-xs rounded border border-border bg-secondary/60 px-2 py-1 hover:text-primary"
              >
                IMPORT
              </Link>
            </div>
          </div>
          <nav className="mt-3 flex gap-1 overflow-x-auto pb-1 lg:hidden">
            {NAV.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "mono-xs shrink-0 rounded border px-2 py-1",
                  pathname === to
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="grid-tech min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
