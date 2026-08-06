import type { Metadata } from "next";
import EngineCanvas from "./EngineCanvas";

export const metadata: Metadata = {
  title: "Scenario Engine — M0",
  description: "Run a scenario, watch the influence cascade form. M0 spine on a stubbed SpacetimeDB contract.",
};

export default function EnginePage() {
  return <EngineCanvas />;
}
