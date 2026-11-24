import { describe, it, expect } from 'vitest';
import { normalizeJotformPayload } from '../src/services/jotform/normalizer.js';
import fixture from './fixtures/jotformPayload.json';

describe('Jotform Payload Normalizer', () => {
  it('should parse compound fields, names, addresses, and phone numbers', () => {
    const raw = JSON.parse(fixture.rawRequest);
    const normalized = normalizeJotformPayload(
      fixture.submissionID,
      fixture.formID,
      raw
    );

    expect(normalized.submissionId).toBe('583920194820192849');
    expect(normalized.formId).toBe('240123456789012');

    // Name normalization
    expect(normalized.data.fullName).toBe('Jane Doe');
    expect(normalized.data.fullName_details).toEqual({ first: 'Jane', last: 'Doe' });

    // Email
    expect(normalized.data.email).toBe('jane.doe@example.com');

    // Phone
    expect(normalized.data.phone).toBe('5550199');

    // Address
    expect(normalized.data.address).toEqual({
      line1: '123 Main St',
      line2: 'Suite 400',
      city: 'Metropolis',
      state: 'NY',
      postal: '10001',
      country: 'United States',
    });

    // Date
    expect(normalized.data.appointmentDate).toBe('2026-11-25');

    // File upload
    expect(normalized.files).toHaveLength(1);
    expect(normalized.files[0]).toBe(
      'https://www.jotform.com/uploads/user/240123456789012/583920194820192849/resume.pdf'
    );
  });

  it('should map question IDs using provided schema question map', () => {
    const raw = {
      q1_input: 'Custom Title',
      q2_number: '42',
    };

    const questionsMap = {
      '1': { name: 'projectTitle', text: 'What is your project title?' },
      '2': { name: 'teamSize', text: 'How many team members?' },
    };

    const normalized = normalizeJotformPayload('sub123', 'form456', raw, questionsMap);

    expect(normalized.data.projectTitle).toBe('Custom Title');
    expect(normalized.data.teamSize).toBe('42');
  });

  it('should exclude internal Jotform metadata fields', () => {
    const raw = {
      slug: 'submit/123',
      formID: '123',
      submissionID: '456',
      workflowInstanceId: 'wf_789',
      q1_name: { first: 'John', last: 'Smith' },
    };

    const normalized = normalizeJotformPayload('456', '123', raw);

    expect(normalized.data.slug).toBeUndefined();
    expect(normalized.data.workflowInstanceId).toBeUndefined();
    expect(normalized.data.name).toBe('John Smith');
  });
});
