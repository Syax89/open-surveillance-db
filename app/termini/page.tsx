"use client";

import { LegalPage } from "../components/LegalPage";
import { useLocale } from "../components/LocaleProvider";
import { legalMessages } from "../lib/legal";

export default function TermsPage() {
  const { locale } = useLocale();
  return <LegalPage content={legalMessages[locale].terms} />;
}
