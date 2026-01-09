// Watermelon is now the only provider; re-export the Watermelon services for compatibility.
import { wmCaseService } from './wmProvider';

export const caseService = wmCaseService;
