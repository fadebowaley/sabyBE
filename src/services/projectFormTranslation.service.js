const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const getTranslationEntries = (projectForm) => {
  const entries = {};
  const elements = Array.isArray(projectForm?.elements) ? projectForm.elements : [];

  elements.forEach((element) => {
    const id = String(element?.id || '').trim();
    const properties = element?.properties || {};
    if (!id) return;
    if (properties.label) entries[`${id}.label`] = String(properties.label);
    if (properties.description) entries[`${id}.description`] = String(properties.description);
    if (properties.placeholder) entries[`${id}.placeholder`] = String(properties.placeholder);
    if (Array.isArray(properties.options)) {
      properties.options.forEach((option, index) => {
        entries[`${id}.option.${index}`] = String(option);
      });
    }
  });

  entries['submit.button'] = 'Submit';
  entries['form.completed'] = 'Thanks for completing this form';
  return entries;
};

const generateTranslationDraft = async ({ projectForm, targetLanguage }) => {
  const language = String(targetLanguage || '').trim();
  if (!language) throw new ApiError(httpStatus.BAD_REQUEST, 'targetLanguage is required.');

  const sourceEntries = getTranslationEntries(projectForm);
  if (!Object.keys(sourceEntries).length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This form has no translatable content.');
  }

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'AI translation is not configured.');
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Translate the values in the JSON object. Preserve every key exactly. Return JSON only.',
        },
        {
          role: 'user',
          content: JSON.stringify({ targetLanguage: language, entries: sourceEntries }),
        },
      ],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(httpStatus.BAD_GATEWAY, payload?.error?.message || 'AI translation failed.');
  }

  let translated;
  try {
    translated = JSON.parse(payload?.choices?.[0]?.message?.content || '{}');
  } catch (_) {
    throw new ApiError(httpStatus.BAD_GATEWAY, 'AI returned an invalid translation response.');
  }

  const result = {};
  Object.keys(sourceEntries).forEach((key) => {
    result[key] = String(translated?.[key] || sourceEntries[key]);
  });
  return { language, sourceEntries, translations: result, status: 'draft' };
};

module.exports = { getTranslationEntries, generateTranslationDraft };
