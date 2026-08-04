import type { Metadata } from "next";
import { ModerationDashboard } from "../components/ModerationDashboard";
import { getServerMessages } from "../lib/server-i18n";

/**
 * /moderation — moderation dashboard (protected, Basic auth / bearer token).
 *
 * Thin server shell: the interactive body is the client component
 * ModerationDashboard. The shell owns the per-page metadata (F5 QA#6):
 * a dedicated localized title and description instead of the generic root
 * fallback, and noindex (the route is intentionally not linked from the
 * public site — see README).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = (await getServerMessages()).moderation;
  return {
    title: `${t.title} — OpenSurveillanceDB`,
    description: t.intro,
    robots: { index: false, follow: false },
  };
}

export default function ModerationPage() {
  return <ModerationDashboard />;
}
