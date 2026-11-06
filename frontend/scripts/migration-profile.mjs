// Keep historical telephone checkout migrations available for legacy test fixtures,
// but exclude them from an explicitly selected direct verbal-order release.
const telephoneOnly = new Set([
  '0011_telephone_checkout.sql',
  '0012_completed_notification_jobs.sql',
  '0013_telephone_command_stages.sql',
]);

export function migrationFiles(files, {directVoice = false} = {}) {
  return files.filter(name => name.endsWith('.sql') && (!directVoice || !telephoneOnly.has(name))).sort();
}
