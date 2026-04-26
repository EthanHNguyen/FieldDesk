import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ExtractedFields = {
  documentId: string;
  travelerName: string;
  travelerRank: string;
  travelerSsn: string;
  agency: string;
  dutyStation: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  purpose: string;
  costCenter: string;
  accountingClassification: string;
  jtrReference: string;
  approver: string;
  lodgingNightlyRate: string;
  transportationMode: string;
  notes: string;
};

type Completeness = {
  status: string;
  missingFields: string[];
  completedFields: string[];
};

type PerDiemRate = {
  lodging: number;
  mealsIncidentals: number;
  firstLastDayMeals: number;
  locality: string;
};

type BlockOptions = {
  number: string;
  label: string;
  value?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  multiline?: boolean;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 36;
const BORDER_WIDTH = 0.5;
const LABEL_SIZE = 7;
const BLOCK_NUMBER_SIZE = 8;
const DATA_SIZE = 10;

function valueOrPending(value: string | undefined) {
  return value?.trim() || "Pending";
}

function compactDate(value: string | undefined) {
  const normalized = valueOrPending(value);
  const digits = normalized.replace(/\D/g, "");

  if (/^\d{8}$/.test(digits)) {
    return digits;
  }

  return normalized;
}

function maskSsn(value: string | undefined) {
  const digits = value?.replace(/\D/g, "").slice(-4) ?? "";
  return digits ? `XXX-XX-${digits.padStart(4, "0")}` : "XXX-XX-0000";
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

function drawBlock(page: PDFPage, font: PDFFont, boldFont: PDFFont, options: BlockOptions) {
  page.drawRectangle({
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    borderColor: rgb(0, 0, 0),
    borderWidth: BORDER_WIDTH
  });

  page.drawText(`${options.number}.`, {
    x: options.x + 4,
    y: options.y + options.height - 12,
    size: BLOCK_NUMBER_SIZE,
    font: boldFont
  });

  page.drawText(options.label, {
    x: options.x + 18,
    y: options.y + options.height - 11,
    size: LABEL_SIZE,
    font: boldFont
  });

  const value = options.value ?? "";
  const dataX = options.x + 6;
  const dataY = options.y + options.height - 27;
  const maxWidth = options.width - 12;
  const lines = options.multiline ? wrapText(value, font, DATA_SIZE, maxWidth) : [value];

  lines.slice(0, Math.max(1, Math.floor((options.height - 22) / 12))).forEach((line, index) => {
    page.drawText(line, {
      x: dataX,
      y: dataY - index * 12,
      size: DATA_SIZE,
      font
    });
  });
}

function drawSignatureLine(page: PDFPage, font: PDFFont, boldFont: PDFFont, options: BlockOptions) {
  drawBlock(page, font, boldFont, options);
  page.drawLine({
    start: { x: options.x + 18, y: options.y + 18 },
    end: { x: options.x + options.width - 18, y: options.y + 18 },
    thickness: BORDER_WIDTH,
    color: rgb(0, 0, 0)
  });
  page.drawText("SIGNATURE / DATE", {
    x: options.x + 18,
    y: options.y + 7,
    size: LABEL_SIZE,
    font: boldFont
  });
}

export async function generateTdyPdf(
  fields: ExtractedFields,
  completeness: Completeness,
  rate: PerDiemRate,
  totalCost: number
) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);

  page.drawRectangle({
    x: MARGIN,
    y: 728,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 32,
    color: black
  });
  page.drawText("DEPARTMENT OF DEFENSE", {
    x: 236,
    y: 747,
    size: 10,
    font: helveticaBold,
    color: white
  });
  page.drawText("REQUEST AND AUTHORIZATION FOR TDY TRAVEL OF DOD PERSONNEL", {
    x: 129,
    y: 734,
    size: 9,
    font: helveticaBold,
    color: white
  });
  page.drawText("(Reference: Joint Travel Regulations (JTR), Chapter 3)", {
    x: 171,
    y: 713,
    size: 8,
    font: helvetica
  });
  page.drawText("(Read Privacy Act Statement on back before completing form.)", {
    x: 167,
    y: 700,
    size: 7,
    font: helveticaOblique
  });

  const column = (PAGE_WIDTH - MARGIN * 2) / 3;
  const half = (PAGE_WIDTH - MARGIN * 2) / 2;
  const x1 = MARGIN;
  const x2 = MARGIN + column;
  const x3 = MARGIN + column * 2;

  drawBlock(page, helvetica, helveticaBold, {
    number: "1",
    label: "DATE OF REQUEST (YYYYMMDD)",
    value: compactDate(new Date().toISOString().slice(0, 10)),
    x: x1,
    y: 654,
    width: column,
    height: 40
  });
  drawBlock(page, helvetica, helveticaBold, {
    number: "2",
    label: "NAME (Last, First, Middle Initial)",
    value: valueOrPending(fields.travelerName),
    x: x2,
    y: 654,
    width: column,
    height: 40
  });
  drawBlock(page, helvetica, helveticaBold, {
    number: "3",
    label: "GRADE/RANK",
    value: valueOrPending(fields.travelerRank),
    x: x3,
    y: 654,
    width: column,
    height: 40
  });
  drawBlock(page, helvetica, helveticaBold, {
    number: "4",
    label: "SSN (MASKED)",
    value: maskSsn(fields.travelerSsn),
    x: x1,
    y: 612,
    width: column,
    height: 40
  });
  drawBlock(page, helvetica, helveticaBold, {
    number: "5",
    label: "OFFICIAL STATION/ORGANIZATION",
    value: `${valueOrPending(fields.dutyStation)} / ${valueOrPending(fields.agency)}`,
    x: x2,
    y: 612,
    width: column,
    height: 40,
    multiline: true
  });
  drawBlock(page, helvetica, helveticaBold, {
    number: "6",
    label: "PHONE NUMBERS",
    value: "",
    x: x3,
    y: 612,
    width: column,
    height: 40
  });

  drawBlock(page, helvetica, helveticaBold, {
    number: "11",
    label: "ITINERARY (From/To/Departure/Return/Purpose)",
    value: [
      `FROM: ${valueOrPending(fields.origin)}`,
      `TO: ${valueOrPending(fields.destination)}`,
      `DEPART: ${compactDate(fields.departureDate)}`,
      `RETURN: ${compactDate(fields.returnDate)}`,
      `MODE: ${valueOrPending(fields.transportationMode)}`
    ].join("   "),
    x: MARGIN,
    y: 520,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 86,
    multiline: true
  });
  drawBlock(page, helvetica, helveticaBold, {
    number: "14",
    label: "PURPOSE OF TDY",
    value: valueOrPending(fields.purpose),
    x: MARGIN,
    y: 444,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 72,
    multiline: true
  });
  drawBlock(page, helvetica, helveticaBold, {
    number: "16",
    label: "ESTIMATED COSTS (Lodging / M&IE / First-Last Day M&IE / Total)",
    value: [
      `LODGING: $${fields.lodgingNightlyRate || rate.lodging}`,
      `M&IE: $${rate.mealsIncidentals}`,
      `FIRST/LAST DAY M&IE: $${rate.firstLastDayMeals}`,
      `TOTAL: $${totalCost.toFixed(2)}`
    ].join("     "),
    x: MARGIN,
    y: 378,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 62,
    multiline: true
  });
  drawBlock(page, helvetica, helveticaBold, {
    number: "18",
    label: "ACCOUNTING CLASSIFICATION",
    value: `${valueOrPending(fields.accountingClassification || fields.costCenter)} | STATUS: ${completeness.status}`,
    x: MARGIN,
    y: 300,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 74,
    multiline: true
  });

  drawSignatureLine(page, helvetica, helveticaBold, {
    number: "21",
    label: "AUTHORIZING OFFICIAL",
    value: valueOrPending(fields.approver),
    x: MARGIN,
    y: 210,
    width: half,
    height: 78
  });
  drawSignatureLine(page, helvetica, helveticaBold, {
    number: "22",
    label: "APPROVING OFFICIAL",
    value: "",
    x: MARGIN + half,
    y: 210,
    width: half,
    height: 78
  });

  page.drawText("DD FORM 1610, MAY 2003 (SIMULATED - FIELDDESK DRAFT)", {
    x: MARGIN,
    y: 64,
    size: 8,
    font: helveticaBold
  });
  page.drawText(`Generated draft packet ${valueOrPending(fields.documentId)}. Human review required before use.`, {
    x: MARGIN,
    y: 51,
    size: 7,
    font: helvetica
  });

  return pdfDoc.save();
}
