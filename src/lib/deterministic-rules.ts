import gsaFixture from "../../data/gsa_per_diem_fixture.json";
import type { TripFacts } from "./fielddesk-types";

export function buildPerDiemVerification(tripFacts: TripFacts) {
  validateTripFacts(tripFacts);

  const rate = findRate(tripFacts.destination || tripFacts.locality);
  const travelers = tripFacts.travelers;
  const startDate = new Date(tripFacts.startDate);
  const endDate = new Date(tripFacts.endDate);

  const nights = nightsBetween(startDate, endDate);
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
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
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
    summary: `Math verified from GSA fixture: ${travelDays} travel days and ${nights} nights; lodging $${rate.lodging} x ${travelers} travelers x ${nights} nights = $${lodgingSubtotal.toLocaleString("en-US")}; full M&IE $${rate.mealsIncidentals} x ${travelers} x ${fullMealsIncidentalsDays} days = $${mealsIncidentalsSubtotal.toLocaleString("en-US")}; first/last day M&IE $${rate.firstLastDayMeals} x ${travelers} x 2 days = $${firstLastDayMealsSubtotal.toLocaleString("en-US")}; total ${formattedTotal}.`
  };
}

function validateTripFacts(tripFacts: TripFacts) {
  if (!tripFacts.destination && !tripFacts.locality) {
    throw new Error("Trip facts must include a destination or locality.");
  }

  if (!Number.isInteger(tripFacts.travelers) || tripFacts.travelers <= 0) {
    throw new Error("Trip facts must include a positive integer traveler count.");
  }

  if (!isIsoDate(tripFacts.startDate) || !isIsoDate(tripFacts.endDate)) {
    throw new Error("Trip facts must include ISO travel dates.");
  }

  const startDate = new Date(tripFacts.startDate);
  const endDate = new Date(tripFacts.endDate);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Trip facts include invalid travel dates.");
  }

  if (endDate.getTime() < startDate.getTime()) {
    throw new Error("Trip end date cannot be before trip start date.");
  }
}

function findRate(destination: string) {
  const rate = gsaFixture.rates.find((candidate) =>
    candidate.city.toLowerCase() === destination.toLowerCase() ||
    candidate.locality.toLowerCase().includes(destination.toLowerCase())
  );
  if (!rate) throw new Error(`No per diem rate configured for ${destination}.`);
  return rate;
}

function nightsBetween(startDate: Date, endDate: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return Math.max(0, Math.round((end - start) / msPerDay));
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
