export interface NormalizedSubmission {
  submissionId: string;
  formId: string;
  createdAt: string;
  data: Record<string, any>;
  files: string[];
  rawFields: Record<string, any>;
}

/**
 * Normalizes raw Jotform submission payloads into a canonical, strictly-typed domain model.
 * Defensively extracts nested fields, compound types (names, addresses, dates), and file uploads.
 */
export function normalizeJotformPayload(
  submissionId: string,
  formId: string,
  raw: Record<string, any>,
  questionsMap?: Record<string, any>,
  createdAt?: string
): NormalizedSubmission {
  const normalizedData: Record<string, any> = {};
  const rawFields: Record<string, any> = {};
  const files: string[] = [];

  // Keys to exclude from normalized business data
  const internalKeys = new Set([
    'slug',
    'formID',
    'submissionID',
    'workflowInstanceId',
    'event_id',
    'uploadPath',
    'ip',
    'validatedNewRules',
    'path',
  ]);

  for (const [key, val] of Object.entries(raw)) {
    if (internalKeys.has(key)) {
      continue;
    }

    rawFields[key] = val;

    // Detect question ID from prefix (e.g., "q3_fullName" -> qid: "q3", fallback name: "fullName")
    const match = key.match(/^(q\d+)_(.+)$/);
    const qid = match ? match[1] : key.startsWith('q') ? key : null;
    let friendlyName = match ? match[2] : key;

    // If question schema mapping exists, prefer the canonical schema question name or text
    if (qid && questionsMap) {
      const qidNum = qid.replace('q', '');
      const questionDef = questionsMap[qidNum] || questionsMap[qid];
      if (questionDef) {
        if (questionDef.name && questionDef.name.trim()) {
          friendlyName = questionDef.name;
        } else if (questionDef.text && questionDef.text.trim()) {
          // Slugify text label if no name is available
          friendlyName = questionDef.text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
        }
      }
    }

    // Process value based on type structure
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      // Compound Name field: { first, last, middle, prefix }
      if ('first' in val || 'last' in val) {
        const parts = [val.prefix, val.first, val.middle, val.last]
          .filter(Boolean)
          .map((s) => String(s).trim());
        const fullName = parts.join(' ').trim();
        normalizedData[friendlyName] = fullName;
        normalizedData[`${friendlyName}_details`] = val;
      }
      // Compound Address field: { addr_line1, addr_line2, city, state, postal, country }
      else if ('addr_line1' in val || 'city' in val || 'postal' in val) {
        normalizedData[friendlyName] = {
          line1: val.addr_line1 || '',
          line2: val.addr_line2 || '',
          city: val.city || '',
          state: val.state || '',
          postal: val.postal || '',
          country: val.country || '',
        };
      }
      // Compound Date field: { month, day, year }
      else if ('year' in val && 'month' in val && 'day' in val) {
        const y = String(val.year).padStart(4, '0');
        const m = String(val.month).padStart(2, '0');
        const d = String(val.day).padStart(2, '0');
        normalizedData[friendlyName] = `${y}-${m}-${d}`;
        normalizedData[`${friendlyName}_details`] = val;
      }
      // Compound Phone field: { area, phone }
      else if ('area' in val || 'phone' in val) {
        const fullPhone = `${val.area || ''}${val.phone || ''}`.trim();
        normalizedData[friendlyName] = fullPhone;
        normalizedData[`${friendlyName}_details`] = val;
      } else {
        normalizedData[friendlyName] = val;
      }
    } else if (typeof val === 'string') {
      const trimmed = val.trim();

      // Check if value is a Jotform file upload URL
      if (
        (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
        (trimmed.includes('jotform.com/uploads/') ||
          trimmed.includes('jotform.pro/uploads/') ||
          trimmed.includes('files.jotform.com/'))
      ) {
        files.push(trimmed);
        normalizedData[friendlyName] = trimmed;
      } else {
        // Try parsing JSON if value is stringified array or object
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            const parsed = JSON.parse(trimmed);
            normalizedData[friendlyName] = parsed;
          } catch {
            normalizedData[friendlyName] = trimmed;
          }
        } else {
          normalizedData[friendlyName] = trimmed;
        }
      }
    } else if (Array.isArray(val)) {
      // Check for array of file URLs
      val.forEach((item) => {
        if (
          typeof item === 'string' &&
          (item.includes('jotform.com/uploads/') || item.includes('files.jotform.com/'))
        ) {
          files.push(item);
        }
      });
      normalizedData[friendlyName] = val;
    } else {
      normalizedData[friendlyName] = val;
    }
  }

  return {
    submissionId: String(submissionId),
    formId: String(formId),
    createdAt: createdAt || new Date().toISOString(),
    data: normalizedData,
    files,
    rawFields,
  };
}
