import { t } from './i18n.js';
const MAP = {
  OFFLINE: 'You are offline. Connect to the internet and try again.', NETWORK_ERROR: 'Cannot reach the server. Check your connection and try again.',
  SERVER_UNAVAILABLE: 'The server is not responding correctly. Please try again shortly.', NOT_CONFIGURED: 'The app is not configured yet (API_URL missing in config.js).',
  INVALID_CREDENTIALS: 'Wrong ID or password.', ACCOUNT_LOCKED: 'Too many failed attempts. Try again in a few minutes.', ACCOUNT_INACTIVE: 'This account is inactive. Contact your administrator.',
  INVALID_SESSION: 'Your session has ended. Please sign in again.', SESSION_EXPIRED: 'Your session has expired. Please sign in again.', RATE_LIMITED: 'Too many requests. Wait a minute and try again.',
  PASSWORD_CHANGE_REQUIRED: 'You must change your password first.', WEAK_PASSWORD: 'Password is too weak.', FORBIDDEN: 'You do not have permission to do this.',
  LAST_ADMIN: 'This is the last active administrator. Create or activate another one first.', GPS_UNAVAILABLE: 'Location is not available. Turn on GPS and allow location access.',
  LOW_ACCURACY: 'GPS accuracy is too low. Move to an open area and retry.', STALE_LOCATION: 'The GPS fix is too old. Please try again.', OUTSIDE_GEOFENCE: 'You are outside the assigned branch.',
  DUPLICATE_CHECKIN: 'You have already checked in for this shift.', ALREADY_CHECKED_OUT: 'You have already checked out.', NOT_CHECKED_IN: 'You have not checked in.',
  NO_ASSIGNMENT: 'You have no shift assigned for today.', CHECKIN_WINDOW_CLOSED: 'Check-in is not open right now.', ON_LEAVE: 'You are on leave for this date.',
  SELFIE_REQUIRED: 'A selfie is required to check in.', INVALID_IMAGE: 'The selfie could not be used. Take it again.', IMAGE_TOO_LARGE: 'The selfie is too large. Take it again.',
  NO_ACTIVE_SHIFT: 'There is no active shift.', SERVER_BUSY: 'The server is busy. Try again in a moment.', ALREADY_EXISTS: 'This already exists.', NOT_FOUND: 'Not found.',
  REQUEST_CONFLICT: 'This request is no longer possible because the schedule changed.', REQUEST_TOO_LATE: 'It is too late for this request.', LEAVE_BALANCE_EXCEEDED: 'Not enough annual leave balance.', LEAVE_WEEK_LIMIT: 'Too many leave days in one week.', FILE_REQUIRED: 'Attach at least one proof file.', TOO_MANY_FILES: 'Too many files.', INVALID_FILE: 'This file cannot be used.',
  ALREADY_ON_BREAK: 'You are already on a break.', NOT_ON_BREAK: 'You are not on a break.', BREAK_ALLOWANCE_USED: 'You have used all your break time for this shift.', MOCK_LOCATION_REJECTED: 'A fake location was detected.',
  BRANCH_IN_USE: 'This branch still has current or future assignments.', ASSIGNMENT_LOCKED: 'This assignment can no longer be changed (attendance exists).', EXPORT_TOO_LARGE: 'Too many rows to export. Narrow the date range or add filters.'
};
export function errorMessage(e) {
  if (!e) return t('Something went wrong.');
  if (['VALIDATION_ERROR', 'INVALID_ASSIGNMENT', 'WEAK_PASSWORD', 'REQUEST_CONFLICT', 'REQUEST_TOO_LATE', 'LEAVE_BALANCE_EXCEEDED', 'LEAVE_WEEK_LIMIT', 'FILE_REQUIRED', 'TOO_MANY_FILES', 'INVALID_FILE'].includes(e.code)) return e.message || t('Invalid input.'); // the server message is specific (dates, counts) and already clear
  return MAP[e.code] ? t(MAP[e.code]) : (e.message || t('Something went wrong.'));
}
