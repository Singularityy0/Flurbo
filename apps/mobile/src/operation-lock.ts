import { storage } from './runtime';
let busy = false;
export function hasOtherPending(except = '') {
  return ['flurbo.pilot.pending.v1', 'flurbo.rehearsal.pending.v1', 'flurbo.mobile.operation.v1'].some(k => k !== except && storage.getItem(k));
}
export function lockOperation() {
  if (busy || hasOtherPending()) throw new Error('Check your pending transaction before starting another action.');
  busy = true;
  return () => { busy = false; };
}
