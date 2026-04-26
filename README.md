# FieldDesk

FieldDesk is a draft-only staff workflow console for building a simulated TDY packet from mission text. It collects an intent, generates a review plan, extracts packet fields, renders draft artifacts, and surfaces missing or inferred values for human review.

The app is intentionally local and synthetic. It does not submit official travel requests, obligate funds, contact approvers, or use authoritative external rate systems.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Shape

- `src/app/page.tsx` - client workflow console.
- `src/app/api/run-workflow/route.ts` - local workflow planner/extractor/artifact API.
- `src/lib/generate-tdy-pdf.ts` - simulated DD Form 1610 PDF renderer.
- `data/` - synthetic SOP, guidance, templates, registry, and sample per diem data.

## Quality Checks

```bash
npm run lint
npm run build
```

## Artifact Hygiene

Generated recordings, screenshots, build output, and local review artifacts are ignored by Git. Keep durable fixtures and templates in `data/`; keep generated demos out of the repo.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
