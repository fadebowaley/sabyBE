const express = require('express');
const multer = require('multer');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const cmsPageValidation = require('../../validations/cmsPage.validation');
const cmsPageController = require('../../controllers/cmsPage.controller');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

router.get('/public/pages/:key', validate(cmsPageValidation.pageKey), cmsPageController.getPublishedPage);
router.get('/public/images/:fileId', validate(cmsPageValidation.imageFileParam), cmsPageController.getPublicImage);

router
  .route('/pages')
  .get(auth(), validate(cmsPageValidation.listPages), cmsPageController.listPages)
  .post(auth(), validate(cmsPageValidation.createPage), cmsPageController.createPage);

router
  .route('/pages/:key')
  .get(auth(), validate(cmsPageValidation.pageKey), cmsPageController.getPage)
  .patch(auth(), validate(cmsPageValidation.updatePage), cmsPageController.updatePage);

router.post('/pages/:key/publish', auth(), validate(cmsPageValidation.pageKey), cmsPageController.publishPage);
router.post('/pages/:key/unpublish', auth(), validate(cmsPageValidation.pageKey), cmsPageController.unpublishPage);
router.get('/images/:fileId', auth(), validate(cmsPageValidation.imageFileParam), cmsPageController.getEditorImage);
router.post('/images/upload', auth(), upload.single('file'), cmsPageController.uploadImage);

module.exports = router;
