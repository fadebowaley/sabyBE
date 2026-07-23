const httpStatus = require('http-status');
const { nanoid } = require('nanoid');
const { CmsPage } = require('../models');
const ApiError = require('../utils/ApiError');

const ALLOWED_SECTION_TYPES = new Set(['hero', 'text', 'cards', 'faq', 'image_text']);

const normalizeSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

const normalizeItemSlug = (item) => {
  const explicitSlug = normalizeSlug(item.slug);
  if (explicitSlug) return explicitSlug;

  const href = String(item.href || '').trim();
  const blogMatch = href.match(/\/blog\/([^/?#]+)/);
  if (blogMatch?.[1]) return normalizeSlug(decodeURIComponent(blogMatch[1]));

  return normalizeSlug(item.title || item.id);
};

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 24).map((item) => {
    if (!item || typeof item !== 'object') return { text: String(item || '') };
    return {
      id: String(item.id || nanoid(8)),
      slug: normalizeItemSlug(item),
      image: normalizeImage(item.image),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : 0,
      title: String(item.title || '').trim(),
      subtitle: String(item.subtitle || '').trim(),
      body: String(item.body || '').trim(),
      description: String(item.description || '').trim(),
      href: String(item.href || '').trim(),
      badge: String(item.badge || '').trim(),
      category: String(item.category || '').trim(),
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 12).map((tag) => String(tag || '').trim()).filter(Boolean) : [],
      author: String(item.author || '').trim(),
      publishedOn: String(item.publishedOn || '').trim(),
      readTime: String(item.readTime || '').trim(),
      lead: String(item.lead || '').trim(),
      status: String(item.status || '').trim(),
      target: String(item.target || '').trim(),
      summary: String(item.summary || '').trim(),
      seoTitle: String(item.seoTitle || '').trim(),
      seoDescription: String(item.seoDescription || '').trim(),
      contentJson: item.contentJson && typeof item.contentJson === 'object' ? item.contentJson : null,
      contentHtml: String(item.contentHtml || '').trim(),
      contentText: String(item.contentText || '').trim(),
      paragraphs: Array.isArray(item.paragraphs)
        ? item.paragraphs.slice(0, 24).map((paragraph) => String(paragraph || '').trim())
        : [],
      bullets: Array.isArray(item.bullets)
        ? item.bullets.slice(0, 24).map((bullet) => String(bullet || '').trim())
        : [],
    };
  });
};

const normalizeImage = (image) => {
  if (!image || typeof image !== 'object') return null;
  return {
    fileId: image.fileId ? String(image.fileId) : null,
    url: image.url ? String(image.url).trim() : null,
    alt: image.alt ? String(image.alt).trim() : '',
    caption: image.caption ? String(image.caption).trim() : '',
  };
};

const normalizeSections = (sections) => {
  if (!Array.isArray(sections)) return [];
  return sections.slice(0, 40).map((section) => ({
    id: String(section.id || nanoid(8)),
    type: ALLOWED_SECTION_TYPES.has(section.type) ? section.type : 'text',
    title: String(section.title || '').trim(),
    subtitle: String(section.subtitle || '').trim(),
    body: String(section.body || '').trim(),
    image: normalizeImage(section.image),
    items: normalizeItems(section.items),
  }));
};

const normalizePayload = (payload = {}, fallback = {}) => {
  const key = normalizeSlug(payload.key || fallback.key);
  const title = String(payload.title || fallback.title || '').trim();
  const slug = normalizeSlug(payload.slug || fallback.slug || key);

  return {
    key,
    title,
    slug,
    sections: normalizeSections(payload.sections || fallback.sections),
    seoTitle: String(payload.seoTitle || '').trim(),
    seoDescription: String(payload.seoDescription || '').trim(),
    images: Array.isArray(payload.images) ? payload.images.map(normalizeImage).filter(Boolean) : fallback.images || [],
  };
};

const buildPublishedContent = (page = {}) => ({
  title: String(page.title || '').trim(),
  slug: normalizeSlug(page.slug || page.key),
  sections: normalizeSections(page.sections),
  seoTitle: String(page.seoTitle || '').trim(),
  seoDescription: String(page.seoDescription || '').trim(),
  images: Array.isArray(page.images) ? page.images.map(normalizeImage).filter(Boolean) : [],
});

const materializePublishedPage = (page) => {
  if (!page) return page;
  const plain = page.toObject ? page.toObject() : page;
  const live = plain.publishedContent;
  if (!live) return plain;

  return {
    ...plain,
    title: live.title || plain.title,
    slug: live.slug || plain.slug,
    sections: Array.isArray(live.sections) ? live.sections : [],
    seoTitle: live.seoTitle || '',
    seoDescription: live.seoDescription || '',
    images: Array.isArray(live.images) ? live.images : [],
    status: 'published',
  };
};

const listPages = async ({ status } = {}) => {
  const filter = status ? { status } : {};
  return CmsPage.find(filter)
    .sort({ updatedAt: -1 })
    .select('key title slug status seoTitle seoDescription publishedAt updatedAt createdAt')
    .lean();
};

const getPageByKey = async (key, { publishedOnly = false } = {}) => {
  const filter = { key: normalizeSlug(key) };
  if (publishedOnly) filter.status = 'published';
  const page = await CmsPage.findOne(filter).lean();
  return publishedOnly ? materializePublishedPage(page) : page;
};

const createPage = async (payload, actor) => {
  const normalized = normalizePayload(payload);
  if (!normalized.key || !normalized.title || !normalized.slug) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Page key, title and slug are required');
  }

  const existing = await CmsPage.findOne({ key: normalized.key });
  if (existing) {
    throw new ApiError(httpStatus.CONFLICT, 'CMS page key already exists');
  }

  const status = payload.status === 'published' ? 'published' : 'draft';

  return CmsPage.create({
    ...normalized,
    status,
    publishedContent: status === 'published' ? buildPublishedContent(normalized) : null,
    createdBy: actor?._id || actor?.id || null,
    updatedBy: actor?._id || actor?.id || null,
    publishedAt: status === 'published' ? new Date() : null,
  });
};

const upsertPageByKey = async (key, payload, actor) => {
  const pageKey = normalizeSlug(key || payload.key);
  if (!pageKey) throw new ApiError(httpStatus.BAD_REQUEST, 'Page key is required');

  const existing = await CmsPage.findOne({ key: pageKey });
  const normalized = normalizePayload({ ...payload, key: pageKey }, existing || { key: pageKey });
  if (!normalized.title) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Page title is required');
  }

  const update = {
    ...normalized,
    updatedBy: actor?._id || actor?.id || null,
  };

  const page = await CmsPage.findOneAndUpdate(
    { key: pageKey },
    { $set: update, $setOnInsert: { createdBy: actor?._id || actor?.id || null } },
    { upsert: true, new: true, runValidators: true }
  );

  return page;
};

const publishPage = async (key, actor) => {
  const existing = await CmsPage.findOne({ key: normalizeSlug(key) }).lean();
  if (!existing) throw new ApiError(httpStatus.NOT_FOUND, 'CMS page not found');
  const publishedContent = buildPublishedContent(existing);

  const page = await CmsPage.findOneAndUpdate(
    { key: normalizeSlug(key) },
    {
      $set: {
        status: 'published',
        publishedAt: new Date(),
        publishedContent,
        updatedBy: actor?._id || actor?.id || null,
      },
    },
    { new: true }
  );
  return page;
};

const unpublishPage = async (key, actor) => {
  const page = await CmsPage.findOneAndUpdate(
    { key: normalizeSlug(key) },
    { $set: { status: 'draft', updatedBy: actor?._id || actor?.id || null } },
    { new: true }
  );
  if (!page) throw new ApiError(httpStatus.NOT_FOUND, 'CMS page not found');
  return page;
};

module.exports = {
  listPages,
  getPageByKey,
  createPage,
  upsertPageByKey,
  publishPage,
  unpublishPage,
  normalizeSlug,
};
