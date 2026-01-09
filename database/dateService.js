// Watermelon is now the only provider; re-export the Watermelon services for compatibility.
import { wmDateService } from './wmProvider';

export const dateService = wmDateService;
