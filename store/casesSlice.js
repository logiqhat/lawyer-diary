import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { caseService } from '../database'

// Thunk + slice flow (quick map):
// 1) UI calls dispatch(addCase(payload))
// 2) The addCase thunk below runs its async function, persists via caseService, then returns payload
// 3) Redux Toolkit dispatches lifecycle actions: cases/addCase/pending → fulfilled → rejected
// 4) This slice listens in extraReducers for addCase.fulfilled and updates state.items
// 5) Components using useSelector(state => state.cases.items) re-render with new data

// Async thunks for database operations
// Fetch all cases from SQLite and replace items in state
export const fetchCases = createAsyncThunk(
  'cases/fetchCases',
  async (_, { rejectWithValue }) => {
    try {
      console.log('Fetching cases from database...');
      const cases = await caseService.getAllCases()
      console.log('Fetched cases:', cases);
      console.log('Cases type:', typeof cases, 'Is array:', Array.isArray(cases));
      
      if (!Array.isArray(cases)) {
        console.error('Database returned non-array data:', cases);
        return rejectWithValue('Database returned invalid data format');
      }
      
      return cases;
    } catch (error) {
      console.error('Error in fetchCases thunk:', error);
      return rejectWithValue(error.message);
    }
  }
)

// Create a new case: write to DB first, then update Redux state via fulfilled action
export const addCase = createAsyncThunk(
  'cases/addCase',
  async (caseData) => {
    await caseService.addCase(caseData)
    return caseData
  }
)

// Update an existing case: persist, then reflect change in Redux state
export const updateCase = createAsyncThunk(
  'cases/updateCase',
  async (caseData) => {
    await caseService.updateCase(caseData)
    return caseData
  }
)

// Delete a case: remove from DB (and related dates by service), then from Redux state
export const removeCase = createAsyncThunk(
  'cases/removeCase',
  async (caseId) => {
    await caseService.deleteCase(caseId)
    return caseId
  }
)

const casesSlice = createSlice({
  name: 'cases',
  initialState: {
    items: [],
    loading: false,
    error: null
  },
  reducers: {
    clearError: (state) => {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch cases
      .addCase(fetchCases.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCases.fulfilled, (state, action) => {
        console.log('fetchCases.fulfilled - payload:', action.payload);
        console.log('fetchCases.fulfilled - current state.items:', state.items);
        state.loading = false
        // Clear existing items and add new ones
        state.items.length = 0
        if (action.payload && Array.isArray(action.payload)) {
          console.log('Adding cases to state:', action.payload.length, 'items');
          state.items.push(...action.payload)
        }
        console.log('fetchCases.fulfilled - final state.items:', state.items);
      })
      .addCase(fetchCases.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      // Add case
      .addCase(addCase.fulfilled, (state, action) => {
        state.items.push(action.payload)
      })
      // Update case
      .addCase(updateCase.fulfilled, (state, action) => {
        const idx = state.items.findIndex(c => c.id === action.payload.id)
        if (idx !== -1) {
          state.items[idx] = action.payload
        }
      })
      // Remove case
      .addCase(removeCase.fulfilled, (state, action) => {
        const index = state.items.findIndex(c => c.id === action.payload)
        if (index !== -1) {
          state.items.splice(index, 1)
        }
      })
  }
})

export const { clearError } = casesSlice.actions
export default casesSlice.reducer
