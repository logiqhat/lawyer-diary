import { configureStore } from '@reduxjs/toolkit'
import casesReducer from './casesSlice'
import caseDatesReducer from './caseDatesSlice'
import { usingWatermelon } from '../config/featureFlags'
import { auth } from '../firebase'

// Fire a background sync after local writes when using Watermelon
const syncAfterWriteMiddleware = (storeAPI) => (next) => (action) => {
  const result = next(action)
  if (usingWatermelon()) {
    const t = action.type || ''
    if (
      t === 'cases/addCase/fulfilled' ||
      t === 'cases/updateCase/fulfilled' ||
      t === 'cases/removeCase/fulfilled' ||
      t === 'caseDates/addDate/fulfilled' ||
      t === 'caseDates/updateDate/fulfilled' ||
      t === 'caseDates/removeDate/fulfilled'
    ) {
      // Lazy import to avoid bundling when not needed
      try {
        // eslint-disable-next-line global-require
        const { syncIfWatermelon } = require('../services/syncService')
        if (auth?.currentUser) setTimeout(() => syncIfWatermelon(), 0)
      } catch {}
    }
  }
  return result
}

// Wiring: This is where slices are registered with the Redux store.
// The keys here (cases, caseDates) become state.cases and state.caseDates in selectors/components.

export const store = configureStore({
  reducer: {
    cases: casesReducer,
    caseDates: caseDatesReducer,
  },
  middleware: (getDefault) => getDefault().concat(syncAfterWriteMiddleware),
})
