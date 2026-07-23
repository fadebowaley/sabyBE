const Joi = require('joi');

const slug = Joi.string().trim().lowercase().pattern(/^[a-z0-9][a-z0-9-]*$/).max(120);

const image = Joi.object({
  fileId: Joi.string().allow('', null).optional(),
  url: Joi.string().allow('', null).optional(),
  alt: Joi.string().allow('').max(200).optional(),
  caption: Joi.string().allow('').max(300).optional(),
}).allow(null);

const sectionItem = Joi.object({
  id: Joi.string().allow('', null).optional(),
  slug: slug.allow('').optional(),
  image: image.optional(),
  order: Joi.number().integer().min(0).max(100000).optional(),
  title: Joi.string().allow('').max(240).optional(),
  subtitle: Joi.string().allow('').max(300).optional(),
  body: Joi.string().allow('').max(3000).optional(),
  description: Joi.string().allow('').max(1200).optional(),
  href: Joi.string().allow('').max(300).optional(),
  badge: Joi.string().allow('').max(80).optional(),
  category: Joi.string().allow('').max(120).optional(),
  tags: Joi.array().items(Joi.string().allow('').max(60)).max(12).optional(),
  author: Joi.string().allow('').max(120).optional(),
  publishedOn: Joi.string().allow('').max(120).optional(),
  readTime: Joi.string().allow('').max(80).optional(),
  lead: Joi.string().allow('').max(1600).optional(),
  status: Joi.string().allow('').max(80).optional(),
  target: Joi.string().allow('').max(120).optional(),
  summary: Joi.string().allow('').max(1200).optional(),
  seoTitle: Joi.string().allow('').max(180).optional(),
  seoDescription: Joi.string().allow('').max(300).optional(),
  contentJson: Joi.object().unknown(true).allow(null).optional(),
  contentHtml: Joi.string().allow('').max(60000).optional(),
  contentText: Joi.string().allow('').max(30000).optional(),
  paragraphs: Joi.array().items(Joi.string().allow('').max(3000)).max(24).optional(),
  bullets: Joi.array().items(Joi.string().allow('').max(1200)).max(24).optional(),
}).unknown(true);

const section = Joi.object({
  id: Joi.string().allow('', null).optional(),
  type: Joi.string().valid('hero', 'text', 'cards', 'faq', 'image_text').default('text'),
  title: Joi.string().allow('').max(240).optional(),
  subtitle: Joi.string().allow('').max(500).optional(),
  body: Joi.string().allow('').max(10000).optional(),
  image: image.optional(),
  items: Joi.array().items(sectionItem).max(24).optional(),
});

const pageBody = Joi.object({
  key: slug.optional(),
  title: Joi.string().trim().min(1).max(180).required(),
  slug: slug.optional(),
  status: Joi.string().valid('draft', 'published').optional(),
  sections: Joi.array().items(section).max(40).default([]),
  seoTitle: Joi.string().allow('').max(180).optional(),
  seoDescription: Joi.string().allow('').max(300).optional(),
  images: Joi.array().items(image).optional(),
  _id: Joi.any().strip(),
  __v: Joi.any().strip(),
  createdAt: Joi.any().strip(),
  createdBy: Joi.any().strip(),
  publishedAt: Joi.any().strip(),
  updatedAt: Joi.any().strip(),
  updatedBy: Joi.any().strip(),
  publishedContent: Joi.any().strip(),
});

const keyParam = {
  params: Joi.object({ key: slug.required() }),
};

const imageFileParam = {
  params: Joi.object({
    fileId: Joi.string().trim().min(1).max(160).required(),
  }),
};

const listPages = {
  query: Joi.object({ status: Joi.string().valid('draft', 'published').optional() }),
};

const createPage = { body: pageBody.keys({ key: slug.required() }) };
const updatePage = { ...keyParam, body: pageBody };
const pageKey = keyParam;

module.exports = {
  listPages,
  createPage,
  updatePage,
  pageKey,
  imageFileParam,
};
