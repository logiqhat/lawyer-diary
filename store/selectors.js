export const selectCases = (state) => state.cases?.items || [];
export const selectCaseDates = (state) => state.caseDates?.items || [];

export const selectDateById = (dateId) => (state) =>
  (state.caseDates?.items || []).find(d => d.id === dateId) || null;

export const selectCaseById = (caseId) => (state) =>
  (state.cases?.items || []).find(c => c.id === caseId) || null;
