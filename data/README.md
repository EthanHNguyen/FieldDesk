# FieldDesk Synthetic Data

This directory contains the fixed demo world described in `docs/PRD.md`.

All records are synthetic, synthetic-only, and for local development only. The
fixtures model one TDY travel readiness workflow for sending soldiers to Fort
DemoSite for training from June 10-14.

## Demo States

- `initial`: FieldDesk finds supporting evidence, but the packet is not ready
  to route because the roster only lists 8 travelers, funding is missing, and
  the rental vehicle justification is weak.
- `corrected`: The user uploads a corrected 10-person roster and funding memo,
  then accepts stronger rental vehicle justification. Readiness improves.

## Primary Files

- `source_manifest.json`: Source inventory, mocked search results, and document
  metadata.
- `outlook_messages.json`: Approval, reviewer, and funding-related mock emails.
- `sharepoint_documents.json`: Mock SharePoint file metadata and extracted text.
- `uploaded_documents.json`: Initial and corrected user-uploaded files.
- `agent_runs.json`: Structured before/after FieldDesk Agent outputs.
- `roster_v2.csv`: Initial roster with 8 travelers.
- `roster_v3_corrected.csv`: Corrected roster with 10 travelers.
- `funding_memo.md`: Synthetic funding artifact added during correction.
- `prior_successful_packet.md`: Prior packet used as an example reference.
