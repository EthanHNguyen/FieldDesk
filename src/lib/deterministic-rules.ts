import gsaFixture from "../../data/gsa_per_diem_fixture.json";
import type { AgentRunInput } from "./fielddesk-types";

type TripFacts = {
  destination: string;
  travelers: number;
  startDate: Date;
  endDate: Date;
};

export function buildPerDiemVerification(input: Pick<AgentRunInput, "intent">) {
  const trip = parseTripFacts(input.intent);
  const rate = findRate(trip.destination);
  const travelers = trip.travelers;
  const nights = nightsBetween(trip.startDate, trip.endDate);
  const travelDays = nights + 1;
  const fullMealsIncidentalsDays = Math.max(0, travelDays - 2);
  const lodgingSubtotal = rate.lodging * travelers * nights;
  const mealsIncidentalsSubtotal = rate.mealsIncidentals * travelers * fullMealsIncidentalsDays;
  const firstLastDayMealsSubtotal = rate.firstLastDayMeals * travelers * 2;
  const estimatedTotal = lodgingSubtotal + mealsIncidentalsSubtotal + firstLastDayMealsSubtotal;
  const formattedTotal = `$${estimatedTotal.toLocaleString("en-US")}`;

  return {
    locality: rate.locality,
    fiscalYear: gsaFixture.fiscalYear,
    startDate: formatDate(trip.startDate),
    endDate: formatDate(trip.endDate),
    lodgingRate: rate.lodging,
    mealsIncidentalsRate: rate.mealsIncidentals,
    firstLastDayMealsRate: rate.firstLastDayMeals,
    travelers,
    nights,
    travelDays,
    fullMealsIncidentalsDays,
    lodgingSubtotal,
    mealsIncidentalsSubtotal,
    firstLastDayMealsSubtotal,
    estimatedTotal,
    formattedTotal,
    summary: `Math verified from GSA fixture: lodging $${rate.lodging} x ${travelers} travelers x ${nights} nights = $${lodgingSubtotal.toLocaleString("en-US")}; full M&IE $${rate.mealsIncidentals} x ${travelers} x ${fullMealsIncidentalsDays} days = $${mealsIncidentalsSubtotal.toLocaleString("en-US")}; first/last day M&IE $${rate.firstLastDayMeals} x ${travelers} x 2 days = $${firstLastDayMealsSubtotal.toLocaleString("en-US")}; total ${formattedTotal}.`
  };
}

export function perDiemDtsValue(input: Pick<AgentRunInput, "intent">) {
  const perDiem = buildPerDiemVerification(input);
  return `${perDiem.formattedTotal} verified from GSA fixture`;
}

function parseTripFacts(intent: string): TripFacts {
  const travelers = Number(intent.match(/(\d+)\s+(?:soldiers|travelers|personnel)/i)?.[1] ?? 1);
  const destination = gsaFixture.rates.find((candidate) => intent.toLowerCase().includes(candidate.city.toLowerCase()))?.city ?? gsaFixture.rates[0].city;
  const dateMatch = intent.match(/from\s+([A-Za-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2})/i) ?? intent.match(/([A-Za-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2})/i);
  const year = gsaFixture.fiscalYear;

  if (!dateMatch) {
    throw new Error(`Unable to parse travel dates from intent: ${intent}`);
  }

  const [, monthName, startDay, endDay] = dateMatch;
  const month = monthIndex(monthName);
  const startDate = new Date(Date.UTC(year, month, Number(startDay)));
  const endDate = new Date(Date.UTC(year, month, Number(endDay)));

  return {
    destination,
    travelers,
    startDate,
    endDate
  };
}

function findRate(destination: string) {
  const rate = gsaFixture.rates.find((candidate) => candidate.city.toLowerCase() === destination.toLowerCase());
  if (!rate) throw new Error(`No per diem rate configured for ${destination}.`);
  return rate;
}

function nightsBetween(startDate: Date, endDate: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / msPerDay));
}

function monthIndex(monthName: string) {
  const month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(monthName.toLowerCase());
  if (month === -1) throw new Error(`Unable to parse month: ${monthName}`);
  return month;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
