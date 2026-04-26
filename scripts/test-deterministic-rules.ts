import assert from "node:assert/strict";
import { buildPerDiemVerification } from "../src/lib/deterministic-rules";
import type { TripFacts } from "../src/lib/fielddesk-types";

const baseFacts: Omit<TripFacts, "startDate" | "endDate"> = {
  destination: "Demo Training Site",
  locality: "Demo Training Site, GA",
  travelers: 10,
  evidenceArtifactIds: ["sp-001"],
  confidence: 0.95,
  rationale: "Golden case"
};

function testFortDemoSiteGoldenCase() {
  const facts: TripFacts = {
    ...baseFacts,
    startDate: "2026-06-10",
    endDate: "2026-06-14"
  };
  
  const res = buildPerDiemVerification(facts);
  assert.equal(res.formattedTotal, "$7,340");
  assert.equal(res.nights, 4);
  assert.equal(res.travelDays, 5);
  assert.equal(res.fullMealsIncidentalsDays, 3);
}

function testDifferentRanges() {
  const oneTravelerFacts = { ...baseFacts, travelers: 1 };
  const res1 = buildPerDiemVerification({ ...oneTravelerFacts, startDate: "2026-06-10", endDate: "2026-06-11" });
  assert.equal(res1.estimatedTotal, 209);

  const res2 = buildPerDiemVerification({ ...oneTravelerFacts, startDate: "2026-06-10", endDate: "2026-06-10" });
  assert.equal(res2.estimatedTotal, 102);
}

function testInvalidTripFacts() {
  assert.throws(
    () => buildPerDiemVerification({ ...baseFacts, startDate: "June 10", endDate: "2026-06-14" }),
    /ISO travel dates/
  );
  assert.throws(
    () => buildPerDiemVerification({ ...baseFacts, travelers: 0, startDate: "2026-06-10", endDate: "2026-06-14" }),
    /positive integer/
  );
  assert.throws(
    () => buildPerDiemVerification({ ...baseFacts, startDate: "2026-06-14", endDate: "2026-06-10" }),
    /cannot be before/
  );
}

try {
  testFortDemoSiteGoldenCase();
  testDifferentRanges();
  testInvalidTripFacts();
  console.log("Deterministic rules tests passed.");
} catch (error) {
  console.error("Deterministic rules tests failed:");
  console.error(error);
  process.exit(1);
}
