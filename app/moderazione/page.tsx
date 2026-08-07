import { permanentRedirect } from "next/navigation";

/**
 * Legacy public URL for the publication model.
 *
 * The detailed explanation now lives in the Guide, next to the concise
 * publication cycle it expands. Keeping this canonical redirect preserves
 * existing links without maintaining a second, visually duplicate page.
 */
export default function ModerazionePage() {
  permanentRedirect("/guide#guide-publication-details");
}
