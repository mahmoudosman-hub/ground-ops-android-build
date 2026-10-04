/** Cached dropdown data (branches, shifts, employees). Lookups a role may not read simply come back empty. */
import { opt } from '../../components/ui.js';
import { t } from '../../core/i18n.js';
export function createLookups(api) {
  let cache = null;
  const safe = async (p, pick) => { try { return pick(await p); } catch (e) { return []; } };
  return {
    async load(force) {
      if (cache && !force) return cache;
      const [branches, shifts, employees] = await Promise.all([safe(api.call('getBranches', {}), (d) => d.branches), safe(api.call('getShifts', {}), (d) => d.shifts), safe(api.call('getEmployees', { page_size: 500 }), (d) => d.items)]);
      cache = { branches, shifts, employees }; return cache;
    },
    invalidate() { cache = null; },
    branchOpts: (l, any) => [opt('', any || t('All branches'))].concat(l.branches.map((b) => opt(b.branch_id, b.branch_name + (b.status === 'INACTIVE' ? ' (inactive)' : '')))),
    shiftOpts: (l, any) => [opt('', any || t('All shifts'))].concat(l.shifts.map((s) => opt(s.shift_id, `${s.shift_name} (${s.start_time}-${s.end_time})`))),
    employeeOpts: (l, any) => [opt('', any || t('All employees'))].concat(l.employees.map((e) => opt(e.employee_id, `${e.employee_id} - ${e.employee_name}`)))
  };
}
export const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null));
