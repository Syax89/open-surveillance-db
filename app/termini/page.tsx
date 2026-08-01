import type { Metadata } from "next";
import { InfoPage } from "../components/InfoPage";

export const metadata: Metadata = {
  title: "Terms of use — OpenSurveillanceDB",
  description:
    "The terms that apply when you browse OpenSurveillanceDB, use its public data, or submit a report.",
};

export default function TerminiPage() {
  return <InfoPage page="terms" />;
}
