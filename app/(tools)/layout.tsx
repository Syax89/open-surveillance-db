import { ToolLayout } from "../components/ToolLayout";

/**
 * Route group (tools) — shared layout for the public tool routes
 * (/mappa, /directory, /segnala, /correggi). URLs stay clean (no group
 * segment) while every tool page gets the shared ToolLayout chrome
 * (nav shell + main) without duplicating it per page
 * (docs/FRONTEND_PLAN.md §1.3, maintainer t_f24c3227).
 */
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return <ToolLayout>{children}</ToolLayout>;
}
