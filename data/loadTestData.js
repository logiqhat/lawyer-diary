// loadTestData.js
// Heavy test dataset: 100 mock cases, each with 10 scheduled dates spread across the next 100 days.

const CASE_COUNT = 100;
const DATES_PER_CASE = 10;
const DAY_SPREAD = 100;

const firstNames = ['Alexander', 'Elizabeth', 'Christopher', 'Katherine', 'Benjamin', 'Margaret'];
const lastNames = ['Montgomery', 'Harrington', 'Fitzgerald', 'Chamberlain', 'Kingsley', 'Worthington'];
const companies = ['International Holdings', 'Metropolitan Bank & Trust', 'Advanced Innovations Group', 'Strategic Capital Partners', 'Heritage Development Consortium'];
const suffixes = ['LLC', 'Incorporated', 'Group', 'Consortium', 'Partners'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildClientName(idx) {
  return `${pick(firstNames)} ${pick(lastNames)} ${idx + 1}`;
}

function buildOpposingName(idx) {
  return `${pick(companies)} ${pick(suffixes)} ${idx + 1}`;
}

function buildCaseDetails(idx) {
  return `Case ${idx + 1} narrative: fully detailed complaint summary, witness overview, discovery timeline, motion history, and trial strategy notes to maximize string length.`;
}

function buildNotes(caseIdx, dateIdx) {
  return `Case ${caseIdx + 1} date ${dateIdx + 1}: preparation notes covering witnesses, exhibits, cross-examination, settlement posture, and filing deadlines.`;
}

function buildDates(caseId, caseIdx, baseDate) {
  const dates = [];
  for (let j = 0; j < DATES_PER_CASE; j++) {
    const dayOffset = caseIdx + j * 10 + Math.floor(Math.random() * 10);
    const event = new Date(baseDate);
    event.setDate(event.getDate() + Math.min(dayOffset, DAY_SPREAD));
    dates.push({
      id: createId('date'),
      caseId,
      eventDate: event.toISOString().slice(0, 10),
      notes: buildNotes(caseIdx, j),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      photoUri: null,
    });
  }
  return dates;
}

export const loadTestCases = [];
export const loadTestDates = [];

const today = new Date();

for (let i = 0; i < CASE_COUNT; i++) {
  const id = createId('case');
  const clientName = buildClientName(i);
  const opposingName = buildOpposingName(i);
  loadTestCases.push({
    id,
    clientName,
    oppositePartyName: opposingName,
    title: `${clientName} vs ${opposingName}`,
    details: buildCaseDetails(i),
    createdAt: today.getTime(),
    updatedAt: today.getTime(),
  });
  loadTestDates.push(...buildDates(id, i, today));
}

let idCounter = 0;
function createId(prefix) {
  idCounter += 1;
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${idCounter.toString(16)}-${randomPart}`;
}
