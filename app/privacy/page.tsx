import type { Metadata } from "next";
import { InfoPage } from "../components/InfoPage";

export const metadata: Metadata = {
  title: "Privacy notice — OpenSurveillanceDB",
  description:
    "How OpenSurveillanceDB processes personal data when you browse the map, submit a report, or contact us.",
};

export default function PrivacyPage() {
  return <InfoPage page="privacy" />;
}
