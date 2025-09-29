import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import uuid from 'react-native-uuid';
import { addDate, updateDate } from '../store/caseDatesSlice';
import { selectDateById } from '../store/selectors';
import { toLocalYMD, parseYMDLocal } from '../utils/dateFmt';

export function useAddOrEditDate({ dateId }) {
  const dispatch = useDispatch();
  const existingDate = useSelector(selectDateById(dateId));

  const mode = existingDate ? 'edit' : 'add';

  // Values the UI should start with
  const initialValues = useMemo(() => ({
    caseId: existingDate?.caseId || '',
    // keep default as today for minimal UI change; set to null if you want to force explicit pick
    date: existingDate ? parseYMDLocal(existingDate.eventDate) : new Date(),
    notes: existingDate?.notes || '',
  }), [existingDate]);

  const canSave = ({ caseId, date }) => Boolean(caseId && date);

  const save = ({ caseId, date, notes }) => {
    if (!canSave({ caseId, date })) return false;

    const eventDate = toLocalYMD(date);

    if (mode === 'edit') {
      dispatch(updateDate({
        ...existingDate,
        caseId,
        eventDate,
        notes: notes || '',
        // store as ms epoch
        updatedAt: Date.now(),
      }));
    } else {
      dispatch(addDate({
        id: uuid.v4(),
        caseId,
        eventDate,
        notes: notes || '',
        // store as ms epoch
        createdAt: Date.now(),
      }));
    }
    return true;
  };

  return { mode, initialValues, canSave, save };
}
