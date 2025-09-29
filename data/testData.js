// testData.js
// Sample test data for cases and dates with realistic client & party names and scenario descriptions

export const testCases = [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      clientName: 'Alice Johnson',
      oppositePartyName: 'Acme Manufacturing',
      title: 'Alice Johnson vs Acme Manufacturing',
      details: 'Scenario: this case has no associated dates',
      createdAt: Date.parse('2025-01-01T00:00:00.000Z'),
      updatedAt: '', // no updates yet (will be coerced to createdAt)
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      clientName: 'Michael Brown',
      oppositePartyName: 'Green Energy Inc',
      title: 'Michael Brown vs Green Energy Inc',
      details: 'Scenario: case with exactly three date entries',
      createdAt: Date.parse('2025-02-01T00:00:00.000Z'),
      updatedAt: Date.parse('2025-04-01T10:30:00.000Z'),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      clientName: 'Jessica Lee',
      oppositePartyName: 'Urban Developers',
      title: 'Jessica Lee vs Urban Developers',
      details: 'Scenario: missing case details',
      createdAt: Date.parse('2025-03-01T00:00:00.000Z'),
      updatedAt: '', // details to be added (will be coerced)
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      clientName: 'Robert King',
      oppositePartyName: 'Global Logistics',
      title: 'Robert King vs Global Logistics',
      details: 'Scenario: case has a date entry without notes',
      createdAt: Date.parse('2025-04-01T00:00:00.000Z'),
      updatedAt: Date.parse('2025-07-02T14:45:00.000Z'),
    },
  ];
  
  export const testDates = [
    {
      id: '550e8400-e29b-41d4-a716-446655440010',
      caseId: '550e8400-e29b-41d4-a716-446655440001',
      eventDate: '2025-09-10',
      notes: 'First of three dates for Michael Brown',
      createdAt: Date.parse('2025-04-15T12:00:00.000Z'),
      updatedAt: '', // no changes (will be coerced)
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440011',
      caseId: '550e8400-e29b-41d4-a716-446655440001',
      eventDate: '2025-09-15',
      notes: 'Second of three dates for Michael Brown',
      createdAt: Date.parse('2025-04-16T12:00:00.000Z'),
      updatedAt: Date.parse('2025-05-01T09:00:00.000Z'),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440012',
      caseId: '550e8400-e29b-41d4-a716-446655440001',
      eventDate: '2025-07-20',
      notes: 'Third of three dates for Michael Brown',
      createdAt: Date.parse('2025-04-17T12:00:00.000Z'),
      updatedAt: '', // pending review (will be coerced)
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440013',
      caseId: '550e8400-e29b-41d4-a716-446655440003',
      eventDate: '2025-09-05',
      notes: 'Scenario: no notes provided for this date',
      createdAt: Date.parse('2025-07-01T08:00:00.000Z'),
      updatedAt: '',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440014',
      caseId: '550e8400-e29b-41d4-a716-446655440002',
      eventDate: '2025-09-10',
      notes: 'Detail-only date entry for a case missing case details',
      createdAt: Date.parse('2025-08-01T09:00:00.000Z'),
      updatedAt: Date.parse('2025-08-15T11:20:00.000Z'),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440015',
      caseId: '550e8400-e29b-41d4-a716-446655440002',
      eventDate: '2025-08-23',
      notes: 'Detail-only date entry for a case missing case details',
      createdAt: Date.parse('2025-08-01T09:00:00.000Z'),
      updatedAt: Date.parse('2025-08-15T11:20:00.000Z'),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440016',
      caseId: '550e8400-e29b-41d4-a716-446655440002',
      eventDate: '2025-08-24',
      notes: 'Detail-only date entry for a case missing case details',
      createdAt: Date.parse('2025-08-01T09:00:00.000Z'),
      updatedAt: Date.parse('2025-08-15T11:20:00.000Z'),
    },
  ];
