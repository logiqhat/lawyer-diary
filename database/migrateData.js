import { caseService } from './caseService';
import { dateService } from './dateService';
import { testCases, testDates } from '../data/testData';
import { loadTestCases, loadTestDates } from '../data/loadTestData';

// Function to migrate test data to database
export const migrateTestData = async () => {
  try {
    console.log('Starting data migration...');
    
    // Add test cases
    for (const testCase of testCases) {
      await caseService.addCase(testCase);
      console.log(`Added case: ${testCase.title}`);
    }
    
    // Add test dates
    for (const testDate of testDates) {
      await dateService.addDate(testDate);
      console.log(`Added date: ${testDate.eventDate}`);
    }
    
    console.log('Data migration completed successfully!');
  } catch (error) {
    console.error('Error during data migration:', error);
    throw error;
  }
};

export const migrateLoadTestData = async () => {
  try {
    console.log('Starting load data migration...');
    for (const testCase of loadTestCases) {
      await caseService.addCase(testCase);
    }
    for (const testDate of loadTestDates) {
      await dateService.addDate(testDate);
    }
    console.log('Load data migration completed successfully!');
  } catch (error) {
    console.error('Error during load data migration:', error);
    throw error;
  }
};

// Function to clear all data (useful for testing)
export const clearAllData = async () => {
  try {
    console.log('Clearing all data...');
    
    // Get all cases and dates first
    const cases = await caseService.getAllCases();
    const dates = await dateService.getAllDates();
    
    // Delete all dates
    for (const date of dates) {
      await dateService.deleteDate(date.id);
    }
    
    // Delete all cases
    for (const caseItem of cases) {
      await caseService.deleteCase(caseItem.id);
    }
    
    console.log('All data cleared successfully!');
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
};
