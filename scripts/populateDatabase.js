import { initDatabase } from '../database/database';
import { caseService } from '../database/caseService';
import { dateService } from '../database/dateService';
import { testCases, testDates } from '../data/testData';

const populateDatabase = async () => {
  try {
    console.log('Initializing database...');
    await initDatabase();
    
    console.log('Adding test cases...');
    for (const testCase of testCases) {
      await caseService.addCase(testCase);
      console.log(`Added case: ${testCase.title}`);
    }
    
    console.log('Adding test dates...');
    for (const testDate of testDates) {
      await dateService.addDate(testDate);
      console.log(`Added date: ${testDate.eventDate}`);
    }
    
    console.log('Database populated successfully!');
  } catch (error) {
    console.error('Error populating database:', error);
  }
};

// Run if called directly
if (require.main === module) {
  populateDatabase();
}

export default populateDatabase;
