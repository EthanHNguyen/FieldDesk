import assert from "node:assert/strict";
import { searchSource, readArtifact, lookupGsaRate, calculatePerDiem, retrievePolicyReference } from "../src/lib/agent-tools/fixture-tools";
import type { AgentRunInput, TripFacts } from "../src/lib/fielddesk-types";

const baseContext: Pick<AgentRunInput, "selectedSources" | "resolutions"> = {
  selectedSources: ["Outlook", "SharePoint", "GSA", "JTR", "Unit Checklist", "Local SOP"],
  resolutions: {
    roster: false,
    funding: false,
    justification: false
  }
};

function testSearchSource() {
  const context = { ...baseContext, selectedSources: ["Outlook", "GSA"] };
  
  const res1 = searchSource("Outlook", "approval", context);
  assert.equal(res1.ok, true);
  if (res1.ok) {
    assert.ok(res1.data.artifacts.length > 0);
    assert.ok(res1.data.artifacts.some(a => a.id === "outlook-001"));
    assert.ok(!res1.data.artifacts.some(a => a.id === "outlook-003"));
  }

  const res2 = searchSource("SharePoint", "roster", context);
  assert.equal(res2.ok, false);
  if (!res2.ok) {
    assert.match(res2.error, /not selected/);
  }
}

function testReadArtifact() {
  const res1 = readArtifact("gsa-001", baseContext);
  assert.equal(res1.ok, true);
  if (res1.ok) {
    assert.equal(res1.data.title, "Demo Training Site per diem rates");
    assert.ok(res1.data.content.includes("Demo Training Site"));
  }

  const res2 = readArtifact("invalid-id", baseContext);
  assert.equal(res2.ok, false);

  const correctedRosterBeforeStaging = readArtifact("sp-004", baseContext);
  assert.equal(correctedRosterBeforeStaging.ok, false);

  const correctedRosterAfterStaging = readArtifact("sp-004", {
    ...baseContext,
    resolutions: {
      ...baseContext.resolutions,
      roster: true
    }
  });
  assert.equal(correctedRosterAfterStaging.ok, true);

  const fundingBeforeStaging = readArtifact("upload-003", baseContext);
  assert.equal(fundingBeforeStaging.ok, false);

  const fundingAfterStaging = readArtifact("upload-003", {
    ...baseContext,
    resolutions: {
      ...baseContext.resolutions,
      funding: true
    }
  });
  assert.equal(fundingAfterStaging.ok, true);
}

function testLookupGsaRate() {
  const res1 = lookupGsaRate("Demo Training Site", 2026);
  assert.equal(res1.ok, true);
  if (res1.ok) {
    assert.equal(res1.data.lodging, 107);
  }

  const resAlias = lookupGsaRate("Demo Training Site", 2026);
  assert.equal(resAlias.ok, true);
  if (resAlias.ok) {
    assert.equal(resAlias.data.city, "Demo Training Site");
  }

  const res2 = lookupGsaRate("Invalid City", 2026);
  assert.equal(res2.ok, false);

  const res3 = lookupGsaRate("Demo Training Site", 2025);
  assert.equal(res3.ok, false);
}

function testCalculatePerDiem() {
  const facts: TripFacts = {
    destination: "Demo Training Site",
    locality: "Columbus, GA",
    startDate: "2026-06-10",
    endDate: "2026-06-14",
    travelers: 10,
    evidenceArtifactIds: ["sp-001"],
    confidence: 0.95,
    rationale: "Test"
  };
  const res = calculatePerDiem(facts);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.formattedTotal, "$7,340");
  }
}

function testRetrievePolicyReference() {
  const res1 = retrievePolicyReference("TDY travel");
  assert.equal(res1.ok, true);
  if (res1.ok) {
    assert.equal(res1.data.source, "JTR");
  }
}

try {
  testSearchSource();
  testReadArtifact();
  testLookupGsaRate();
  testCalculatePerDiem();
  testRetrievePolicyReference();
  console.log("Fixture tools tests passed.");
} catch (error) {
  console.error("Fixture tools tests failed:");
  console.error(error);
  process.exit(1);
}
