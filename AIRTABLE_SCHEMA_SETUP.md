# Airtable Schema Setup Requirements

## Credit Reservations Table - Resolution Reason Field

The `Resolution Reason` field is a **Select** type field with the following required options:

### Required Select Options

- `Lesson Completed` - Used when a lesson completes normally
- `Lesson Canceled` - Used when a lesson is canceled (all cancellation reasons)
- `Lesson No-Show` - Used when a lesson results in a no-show
- `Policy Release` - Used for manual policy-based releases
- `Administrative Void` - Used for administrative voids

### Usage

- **cancelLesson()**: Uses `"Lesson Canceled"` for all cancellation paths (Client Canceled, Coach Canceled, Bad Weather, etc.)
- **completeLesson()**: Uses `"Lesson Completed"` when lesson completes
- **recordNoShow()**: Uses `"Lesson No-Show"` when lesson is no-show
- **releaseReservation()**: Uses `"Policy Release"` for manual releases or `"Lesson Canceled"` for lesson-based releases

### Configuration Steps

1. Open Airtable
2. Go to the **Credit Reservations** table
3. Click on the **Resolution Reason** field to edit it
4. Ensure it's a **Single select** field type
5. Add these options (if missing):
   - `Lesson Completed`
   - `Lesson Canceled`
   - `Lesson No-Show`
   - `Policy Release`
   - `Administrative Void`
6. Save the field

### Lesson Cancellation Behavior Matrix

Based on cancellation reason:

| Cancellation Reason | Resolution Reason | Lock Debit Reversed | Forfeit Lesson Debit Created | Net Credit Effect |
|---|---|---|---|---|
| Client Canceled | Lesson Canceled | Yes (if locked) | Yes | Credits consumed |
| Coach Canceled | Lesson Canceled | Yes (if locked) | No | Credits restored |
| Bad Weather | Lesson Canceled | Yes (if locked) | No | Credits restored |
| Access Issue | Lesson Canceled | Yes (if locked) | No | Credits restored |
| Scheduling Error | Lesson Canceled | Yes (if locked) | No | Credits restored |
| Duplicate Lesson | Lesson Canceled | Yes (if locked) | No | Credits restored |

For **Reserved (non-locked)** reservations, Lock Debit Reversal is N/A, and the net effect is "Soft hold ends".
