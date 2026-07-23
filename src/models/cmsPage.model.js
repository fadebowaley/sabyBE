const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const cmsImageSchema = new mongoose.Schema(
  {
    fileId: { type: String, default: null, trim: true },
    url: { type: String, default: null, trim: true },
    alt: { type: String, default: '', trim: true },
    caption: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const cmsSectionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['hero', 'text', 'cards', 'faq', 'image_text'],
      default: 'text',
    },
    title: { type: String, default: '', trim: true },
    subtitle: { type: String, default: '', trim: true },
    body: { type: String, default: '', trim: true },
    image: { type: cmsImageSchema, default: null },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const cmsPublishedContentSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true },
    slug: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      match: /^[a-z0-9][a-z0-9-]*$/,
    },
    sections: { type: [cmsSectionSchema], default: [] },
    seoTitle: { type: String, default: '', trim: true },
    seoDescription: { type: String, default: '', trim: true },
    images: { type: [cmsImageSchema], default: [] },
  },
  { _id: false }
);

const cmsPageSchema = mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9][a-z0-9-]*$/,
    },
    title: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      index: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9][a-z0-9-]*$/,
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
    sections: { type: [cmsSectionSchema], default: [] },
    seoTitle: { type: String, default: '', trim: true },
    seoDescription: { type: String, default: '', trim: true },
    images: { type: [cmsImageSchema], default: [] },
    publishedContent: { type: cmsPublishedContentSchema, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

cmsPageSchema.plugin(toJSON);
cmsPageSchema.plugin(paginate);

module.exports = mongoose.model('CmsPage', cmsPageSchema);
