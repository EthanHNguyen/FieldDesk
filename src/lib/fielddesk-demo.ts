export type PacketStatus = "Evidence Found" | "Generated" | "Needs Review" | "Missing" | "Human Review Required";

export type SourceField = {
  value: string | number;
  confidence: number;
  source: string;
};

export type PacketSnapshotItem = {
  area: string;
  status: PacketStatus;
  confidence: number;
  reason: string;
  source: string;
};

export type SelectedIssue = {
  item: string;
  evidence_found: string[];
  missing_evidence: string[];
  potential_reviewer_question: string;
  suggested_supporting_evidence: string;
  human_action: string;
  confidence_explanation: string;
  provenance: {
    found_sources: string[];
    missing_sources: string[];
    policy_source: string;
  };
  reasoning_trace: string[];
};

export type DraftPacket = {
  title: string;
  body: string;
  sections: Array<{
    heading: string;
    lines: string[];
  }>;
};

export type DemoFile = {
  name: string;
  kind: string;
  size: string;
  description: string;
  source: string;
};

export type PacketAnalysisResponse = {
  workflow: "TDY Training Travel Packet";
  packet_name: string;
  summary: {
    destination: SourceField;
    dates: SourceField;
    travelers: SourceField;
    purpose: SourceField;
    logistics: SourceField;
  };
  demo_files: DemoFile[];
  packet_snapshot: PacketSnapshotItem[];
  selected_issue: SelectedIssue;
  draft_packet: DraftPacket;
};

export const defaultMissionRequest =
  "I need to send 10 soldiers to Demo Training Site for a training event from June 10-14. They need lodging, rental cars, and per diem.";

export const demoFiles: DemoFile[] = [
  {
    name: "roster.csv",
    kind: "CSV",
    size: "18 KB",
    description: "Unit roster for soldiers included in TDY. 10 traveler records selected for this packet.",
    source: "sample package"
  },
  {
    name: "training_order.pdf",
    kind: "PDF",
    size: "212 KB",
    description: "Training event order with destination, dates, and purpose.",
    source: "sample package"
  },
  {
    name: "unit_tdy_checklist.pdf",
    kind: "PDF",
    size: "146 KB",
    description: "Unit checklist for TDY packet review requirements.",
    source: "sample package"
  },
  {
    name: "jtr_excerpt.pdf",
    kind: "PDF",
    size: "1.1 MB",
    description: "Mocked JTR excerpt and per diem guidance for demo use.",
    source: "sample package"
  }
];

export function buildPacketAnalysis(input?: string): PacketAnalysisResponse {
  const request = input?.trim() || defaultMissionRequest;
  const mentionsFortDemoSite = /fort\s+demosite/i.test(request);
  const destination = mentionsFortDemoSite ? "Demo Training Site" : "Demo Training Site";

  return {
    workflow: "TDY Training Travel Packet",
    packet_name: "Demo Training Site Training TDY",
    summary: {
      destination: {
        value: destination,
        confidence: 0.91,
        source: "user_request"
      },
      dates: {
        value: "June 10-14",
        confidence: 0.88,
        source: "training_order.pdf"
      },
      travelers: {
        value: 10,
        confidence: 0.91,
        source: "roster.csv"
      },
      purpose: {
        value: "Training event",
        confidence: 0.84,
        source: "training_order.pdf"
      },
      logistics: {
        value: "Lodging, rental cars, and per diem",
        confidence: 0.79,
        source: "user_request"
      }
    },
    demo_files: demoFiles,
    packet_snapshot: [
      {
        area: "Personnel Roster",
        status: "Evidence Found",
        confidence: 0.91,
        reason: "Roster includes 10 personnel.",
        source: "roster.csv"
      },
      {
        area: "Travel Dates",
        status: "Evidence Found",
        confidence: 0.88,
        reason: "Dates detected in request and training order.",
        source: "training_order.pdf"
      },
      {
        area: "Lodging Plan",
        status: "Needs Review",
        confidence: 0.79,
        reason: "Lodging required, but confirmation is not included.",
        source: "user_request"
      },
      {
        area: "Funding / Line of Accounting",
        status: "Missing",
        confidence: 0.86,
        reason: "No fund cite or approving funding source detected.",
        source: "absence_from_uploaded_packet"
      },
      {
        area: "Per Diem Estimate",
        status: "Generated",
        confidence: 0.74,
        reason: "Rate estimated from destination and trip dates.",
        source: "mock_gsa_rate_table"
      }
    ],
    selected_issue: {
      item: "Funding / Line of Accounting",
      evidence_found: [],
      missing_evidence: ["fund cite", "travel authorization", "approval email from approving official"],
      potential_reviewer_question:
        "Which unit or program is funding this TDY, and has the approving official authorized the expense?",
      suggested_supporting_evidence:
        "Attach fund cite, travel authorization, or approval email from the designated approving official.",
      human_action: "Collect funding approval before submitting packet.",
      confidence_explanation:
        "86% confidence that funding information is missing because no fund cite, travel authorization, or approval artifact was found in the packet.",
      provenance: {
        found_sources: ["roster.csv", "training_order.pdf", "unit_tdy_checklist.pdf"],
        missing_sources: ["fund_cite.pdf", "travel_authorization.pdf"],
        policy_source: "unit_tdy_checklist.pdf"
      },
      reasoning_trace: [
        "The request includes travel, lodging, and per diem needs.",
        "The packet includes personnel and trip dates.",
        "No funding source or travel authorization was detected.",
        "A reviewer may ask who authorized the expense.",
        "FieldDesk flags this for human review before routing."
      ]
    },
    draft_packet: {
      title: "Draft TDY Training Travel Packet",
      body:
        "Purpose: Send 10 soldiers to Demo Training Site for training from June 10-14. Logistics needs include lodging, rental transportation, and per diem. Personnel roster and training order are attached. Funding approval is not yet included and should be collected before routing.",
      sections: [
        {
          heading: "Trip Summary",
          lines: [
            "Purpose: Training event",
            "Destination: Demo Training Site, GA",
            "Travel Dates: June 10-14, 2025",
            "Travelers: 10 soldiers",
            "Transportation: Rental vehicles requested",
            "Lodging and per diem required"
          ]
        },
        {
          heading: "Personnel List Summary",
          lines: ["Roster attached: roster.csv", "Total travelers: 10", "Reviewer should confirm roster and orders match."]
        },
        {
          heading: "Missing Items",
          lines: ["Funding approval is missing.", "Attach a fund cite, travel authorization, or approval email before routing."]
        },
        {
          heading: "Commander / Admin Review Questions",
          lines: [
            "Is the training purpose clearly stated and authorized?",
            "Are all travelers on official orders and the roster accurate?",
            "Has funding been approved for all expenses?",
            "Is per diem correct for the location and dates?"
          ]
        },
        {
          heading: "Approval Memo Placeholder",
          lines: [
            "Once missing items are collected, route for commander or admin review.",
            "Prepared by: SGT John T. Admin"
          ]
        }
      ]
    }
  };
}
