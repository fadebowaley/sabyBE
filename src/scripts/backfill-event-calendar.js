/**
 * backfill-event-calendar.js
 *
 * One-shot script: for every PERM-enabled active project form, generate
 * event_calendar rows for every month in the current calendar year (Jan–Dec).
 *
 * Safe to re-run: generateCalendarFromForm uses ON CONFLICT … DO UPDATE,
 * so existing rows are only refreshed, never duplicated.
 *
 * Usage (from inside the container or with docker exec):
 *   node src/scripts/backfill-event-calendar.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const mongoUrl = process.env.MONGODB_URL || process.env.MONGO_URL;
if (!mongoUrl) {
  console.error('MONGODB_URL env var is required');
  process.exit(1);
}

async function main() {
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });
  console.log('✅ MongoDB connected');

  // Import after connect so models register correctly
  const { ProjectForm } = require('../models');
  const { eventCalendarService } = require('../services');

  // Build the 12 months of the current calendar year
  const year   = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    return { month: `${year}-${m}-01`, year };
  });

  // Fetch all PERM-enabled active forms
  const forms = await ProjectForm.find({
    status: 'active',
    'permSettings.enabled': true,
  }).lean();

  console.log(`\nFound ${forms.length} active PERM-enabled form(s). Backfilling ${months.length} months each...\n`);

  let totalOk  = 0;
  let totalErr = 0;

  for (const rawForm of forms) {
    // Attach the helpers that generateCalendarFromForm expects
    const form = {
      ...rawForm,
      tenantId:   rawForm.tenantId,
      projectId:  rawForm.projectId,
      formId:     rawForm.formId || rawForm._id?.toString(),
      _id:        rawForm._id,
      permSettings: rawForm.permSettings,
    };

    const label = `[${form.tenantId}] ${form.projectId} (${form.permSettings?.trackingMode ?? 'none'})`;
    const results = [];

    for (const { month, year: y } of months) {
      try {
        await eventCalendarService.generateCalendarFromForm(form, month, y);
        results.push({ month, ok: true });
        totalOk++;
      } catch (err) {
        results.push({ month, ok: false, error: err.message });
        totalErr++;
      }
    }

    const ok  = results.filter((r) => r.ok).map((r) => r.month.slice(0, 7));
    const bad = results.filter((r) => !r.ok);

    console.log(`${label}`);
    console.log(`  ✓ ${ok.length} months OK: ${ok.join(', ')}`);
    if (bad.length) {
      bad.forEach((b) => console.log(`  ✗ ${b.month}: ${b.error}`));
    }
    console.log('');
  }

  console.log('─────────────────────────────────────────');
  console.log(`Backfill complete: ${totalOk} succeeded, ${totalErr} failed`);

  await mongoose.disconnect();
  process.exit(totalErr > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
