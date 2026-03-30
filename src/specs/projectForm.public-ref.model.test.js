const { ProjectForm } = require('../models');

describe('ProjectForm.generatePublicRef', () => {
  test('generates URL-safe canonical refs with frm_ prefix', () => {
    const ref = ProjectForm.generatePublicRef('Weekly Attendance Report');
    expect(ref).toMatch(/^frm_[a-z0-9-]+-[a-z0-9]{8}$/);
    expect(ref.includes(' ')).toBe(false);
    expect(ref).not.toContain('#');
  });

  test('generates unique refs across repeated calls', () => {
    const generated = new Set();
    for (let i = 0; i < 100; i += 1) {
      generated.add(ProjectForm.generatePublicRef('Weekly Attendance Report'));
    }
    expect(generated.size).toBe(100);
  });
});
