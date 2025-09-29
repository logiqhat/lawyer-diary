// store/caseDatesSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { dateService } from '../database'
import { removeCase } from './casesSlice'

// Async thunks for database operations
export const fetchDates = createAsyncThunk(
  'caseDates/fetchDates',
  async (_, { rejectWithValue }) => {
    try {
      console.log('Fetching dates from database...');
      const dates = await dateService.getAllDates()
      console.log('Fetched dates:', dates);
      console.log('Dates type:', typeof dates, 'Is array:', Array.isArray(dates));
      
      if (!Array.isArray(dates)) {
        console.error('Database returned non-array data:', dates);
        return rejectWithValue('Database returned invalid data format');
      }
      
      return dates;
    } catch (error) {
      console.error('Error in fetchDates thunk:', error);
      return rejectWithValue(error.message);
    }
  }
)

export const addDate = createAsyncThunk(
  'caseDates/addDate',
  async (dateData) => {
    await dateService.addDate(dateData)
    return dateData
  }
)

export const updateDate = createAsyncThunk(
  'caseDates/updateDate',
  async (dateData) => {
    await dateService.updateDate(dateData)
    return dateData
  }
)

export const removeDate = createAsyncThunk(
  'caseDates/removeDate',
  async (dateId) => {
    await dateService.deleteDate(dateId)
    return dateId
  }
)

const caseDatesSlice = createSlice({
  name: 'caseDates',
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
      // Fetch dates
      .addCase(fetchDates.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchDates.fulfilled, (state, action) => {
        state.loading = false
        // Clear existing items and add new ones
        state.items.length = 0
        if (action.payload && Array.isArray(action.payload)) {
          state.items.push(...action.payload)
        }
      })
      .addCase(fetchDates.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      // Add date
      .addCase(addDate.fulfilled, (state, action) => {
        state.items.push(action.payload)
      })
      // Update date
      .addCase(updateDate.fulfilled, (state, action) => {
        const idx = state.items.findIndex(d => d.id === action.payload.id)
        if (idx !== -1) {
          state.items[idx] = action.payload
        }
      })
      // Remove date
      .addCase(removeDate.fulfilled, (state, action) => {
        const index = state.items.findIndex(d => d.id === action.payload)
        if (index !== -1) {
          state.items.splice(index, 1)
        }
      })
      // When a case is removed, delete all its associated dates
      .addCase(removeCase.fulfilled, (state, action) => {
        const caseId = action.payload
        for (let i = state.items.length - 1; i >= 0; i--) {
          if (state.items[i].caseId === caseId) {
            state.items.splice(i, 1)
          }
        }
      })
  }
})

export const { clearError } = caseDatesSlice.actions
export default caseDatesSlice.reducer
