import type { Metadata } from "next";
import { InfoPage } from "../components/InfoPage";

export const metadata: Metadata = {
  title: "Licences — OpenSurveillanceDB",
  description:
    "How the software, the documentation, and the public database of OpenSurveillanceDB are licensed.",
};

export default function LicenzePage() {
  return <InfoPage page="licenses" />;
}
