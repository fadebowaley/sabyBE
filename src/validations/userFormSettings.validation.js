const Joi = require('joi');
const { objectId } = require('./custom.validation');
const tenantIdSchema = Joi.string().pattern(/^[a-zA-Z0-9_-]+$/);

const createUserFormSettings = {
  body: Joi.object().keys({
    user: Joi.string().required().custom(objectId),
    tenantId: tenantIdSchema,
    defaultFormSettings: Joi.object()
      .required()
      .keys({
        access: Joi.object()
          .keys({
            type: Joi.string()
              .valid('public', 'role-based', 'invite-only')
              .default('public'),
            requiresLogin: Joi.boolean().default(false),
            allowedRoles: Joi.array().items(Joi.string()).default([]),
            submissionLimit: Joi.number().integer().min(0).default(0),
            allowMultipleSubmissions: Joi.boolean().default(true),
            allowAnonymous: Joi.boolean().default(true),
          })
          .default({}),
        behavior: Joi.object()
          .keys({
            autosave: Joi.boolean().default(true),
            saveDraft: Joi.boolean().default(false),
            allowResubmission: Joi.boolean().default(false),
            showProgressBar: Joi.boolean().default(true),
            timeoutInMinutes: Joi.number().integer().min(0).default(0),
            redirectAfterSubmit: Joi.string().uri().allow(''),
            customSuccessMessage: Joi.string().allow(''),
          })
          .default({}),
        distribution: Joi.object()
          .keys({
            enablePublicUrl: Joi.boolean().default(true),
            enablePrivateUrl: Joi.boolean().default(false),
            enableHtmlEmbed: Joi.boolean().default(false),
            enableApiSubmission: Joi.boolean().default(false),
            enableJsEmbed: Joi.boolean().default(false),
            customDomain: Joi.string().allow(''),
          })
          .default({}),
        notifications: Joi.object()
          .keys({
            onSubmit: Joi.object()
              .keys({
                sendToUser: Joi.boolean().default(false),
                sendToOwner: Joi.boolean().default(true),
                emailTemplateId: Joi.string().default('default'),
                customEmails: Joi.array()
                  .items(Joi.string().email())
                  .default([]),
              })
              .default({}),
            onFailure: Joi.object()
              .keys({
                sendToOwner: Joi.boolean().default(false),
                emailTemplateId: Joi.string().default('error'),
              })
              .default({}),
          })
          .default({}),
        ui: Joi.object()
          .keys({
            theme: Joi.string()
              .valid('light', 'dark', 'auto', 'custom')
              .default('light'),
            layout: Joi.string()
              .valid('single-page', 'multi-step', 'wizard')
              .default('single-page'),
            branding: Joi.object()
              .keys({
                logoUrl: Joi.string().uri().allow(''),
                primaryColor: Joi.string().default('#3b82f6'),
                backgroundColor: Joi.string().default('#ffffff'),
                fontFamily: Joi.string().default('Inter'),
                customCss: Joi.string().allow(''),
              })
              .default({}),
            language: Joi.string().default('en'),
            showFormTitle: Joi.boolean().default(true),
            showFormDescription: Joi.boolean().default(true),
          })
          .default({}),
        builder: Joi.object()
          .keys({
            selectedStyle: Joi.string().default('default'),
            wizardMode: Joi.boolean().default(false),
            columnSpans: Joi.object().default({}),
            elements: Joi.array().default([]),
            formLayout: Joi.object()
              .keys({
                spacing: Joi.string()
                  .valid('compact', 'normal', 'comfortable')
                  .default('normal'),
                labelPosition: Joi.string()
                  .valid('top', 'left', 'floating')
                  .default('top'),
                buttonAlignment: Joi.string()
                  .valid('left', 'center', 'right')
                  .default('left'),
              })
              .default({}),
            validation: Joi.object()
              .keys({
                showRequiredAsterisk: Joi.boolean().default(true),
                validateOnSubmit: Joi.boolean().default(true),
                validateOnBlur: Joi.boolean().default(false),
              })
              .default({}),
          })
          .default({}),
        profileModal: Joi.object().optional().default({}),
      }),
  }),
};

const getUserFormSettings = {
  query: Joi.object().keys({
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
    user: Joi.string().custom(objectId),
    tenantId: tenantIdSchema,
  }),
};

const getUserFormSettingsById = {
  params: Joi.object().keys({
    settingsId: Joi.string().required().custom(objectId),
  }),
};

const getUserFormSettingsByUserId = {
  params: Joi.object().keys({
    userId: Joi.string().required().min(1),
  }),
};

const updateUserFormSettings = {
  params: Joi.object().keys({
    settingsId: Joi.string().required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      tenantId: tenantIdSchema,
      defaultFormSettings: Joi.object().keys({
        access: Joi.object().keys({
          type: Joi.string().valid('public', 'role-based', 'invite-only'),
          requiresLogin: Joi.boolean(),
          allowedRoles: Joi.array().items(Joi.string()),
          submissionLimit: Joi.number().integer().min(0),
          allowMultipleSubmissions: Joi.boolean(),
          allowAnonymous: Joi.boolean(),
        }),
        behavior: Joi.object().keys({
          autosave: Joi.boolean(),
          saveDraft: Joi.boolean(),
          allowResubmission: Joi.boolean(),
          showProgressBar: Joi.boolean(),
          timeoutInMinutes: Joi.number().integer().min(0),
          redirectAfterSubmit: Joi.string().uri().allow(''),
          customSuccessMessage: Joi.string().allow(''),
        }),
        distribution: Joi.object().keys({
          enablePublicUrl: Joi.boolean(),
          enablePrivateUrl: Joi.boolean(),
          enableHtmlEmbed: Joi.boolean(),
          enableApiSubmission: Joi.boolean(),
          enableJsEmbed: Joi.boolean(),
          customDomain: Joi.string().allow(''),
        }),
        notifications: Joi.object().keys({
          onSubmit: Joi.object().keys({
            sendToUser: Joi.boolean(),
            sendToOwner: Joi.boolean(),
            emailTemplateId: Joi.string().allow(''),
            customEmails: Joi.array().items(Joi.string().email()),
          }),
          onFailure: Joi.object().keys({
            sendToOwner: Joi.boolean(),
            emailTemplateId: Joi.string().allow(''),
          }),
        }),
        ui: Joi.object().keys({
          theme: Joi.string().valid('light', 'dark', 'auto', 'custom'),
          layout: Joi.string().valid('single-page', 'multi-step', 'wizard'),
          branding: Joi.object().keys({
            logoUrl: Joi.string().uri().allow(''),
            primaryColor: Joi.string(),
            backgroundColor: Joi.string(),
            fontFamily: Joi.string(),
            customCss: Joi.string().allow(''),
          }),
          language: Joi.string(),
          showFormTitle: Joi.boolean(),
          showFormDescription: Joi.boolean(),
        }),
        builder: Joi.object().keys({
          selectedStyle: Joi.string(),
          wizardMode: Joi.boolean(),
          columnSpans: Joi.object(),
          elements: Joi.array(),
          formLayout: Joi.object().keys({
            spacing: Joi.string().valid('compact', 'normal', 'comfortable'),
            labelPosition: Joi.string().valid('top', 'left', 'floating'),
            buttonAlignment: Joi.string().valid('left', 'center', 'right'),
          }),
          validation: Joi.object().keys({
            showRequiredAsterisk: Joi.boolean(),
            validateOnSubmit: Joi.boolean(),
            validateOnBlur: Joi.boolean(),
          }),
        }),
        profileModal: Joi.object().optional().default({}),
      }),
    })
    .min(1),
};

const updateUserFormSettingsByUserId = {
  params: Joi.object().keys({
    userId: Joi.string().required().min(1),
  }),
  body: Joi.object()
    .keys({
      tenantId: tenantIdSchema,
      defaultFormSettings: Joi.object().keys({
        access: Joi.object().keys({
          type: Joi.string().valid('public', 'role-based', 'invite-only'),
          requiresLogin: Joi.boolean(),
          allowedRoles: Joi.array().items(Joi.string()),
          submissionLimit: Joi.number().integer().min(0),
          allowMultipleSubmissions: Joi.boolean(),
          allowAnonymous: Joi.boolean(),
        }),
        behavior: Joi.object().keys({
          autosave: Joi.boolean(),
          saveDraft: Joi.boolean(),
          allowResubmission: Joi.boolean(),
          showProgressBar: Joi.boolean(),
          timeoutInMinutes: Joi.number().integer().min(0),
          redirectAfterSubmit: Joi.string().uri().allow(''),
          customSuccessMessage: Joi.string().allow(''),
        }),
        distribution: Joi.object().keys({
          enablePublicUrl: Joi.boolean(),
          enablePrivateUrl: Joi.boolean(),
          enableHtmlEmbed: Joi.boolean(),
          enableApiSubmission: Joi.boolean(),
          enableJsEmbed: Joi.boolean(),
          customDomain: Joi.string().allow(''),
        }),
        notifications: Joi.object().keys({
          onSubmit: Joi.object().keys({
            sendToUser: Joi.boolean(),
            sendToOwner: Joi.boolean(),
            emailTemplateId: Joi.string().allow(''),
            customEmails: Joi.array().items(Joi.string().email()),
          }),
          onFailure: Joi.object().keys({
            sendToOwner: Joi.boolean(),
            emailTemplateId: Joi.string().allow(''),
          }),
        }),
        ui: Joi.object().keys({
          theme: Joi.string().valid('light', 'dark', 'auto', 'custom'),
          layout: Joi.string().valid('single-page', 'multi-step', 'wizard'),
          branding: Joi.object().keys({
            logoUrl: Joi.string().uri().allow(''),
            primaryColor: Joi.string(),
            backgroundColor: Joi.string(),
            fontFamily: Joi.string(),
            customCss: Joi.string().allow(''),
          }),
          language: Joi.string(),
          showFormTitle: Joi.boolean(),
          showFormDescription: Joi.boolean(),
        }),
        builder: Joi.object().keys({
          selectedStyle: Joi.string(),
          wizardMode: Joi.boolean(),
          columnSpans: Joi.object(),
          elements: Joi.array(),
          formLayout: Joi.object().keys({
            spacing: Joi.string().valid('compact', 'normal', 'comfortable'),
            labelPosition: Joi.string().valid('top', 'left', 'floating'),
            buttonAlignment: Joi.string().valid('left', 'center', 'right'),
          }),
          validation: Joi.object().keys({
            showRequiredAsterisk: Joi.boolean(),
            validateOnSubmit: Joi.boolean(),
            validateOnBlur: Joi.boolean(),
          }),
        }),
        profileModal: Joi.object().optional().default({}),
      }),
    })
    .min(1),
};

const deleteUserFormSettings = {
  params: Joi.object().keys({
    settingsId: Joi.string().required().custom(objectId),
  }),
};

const deleteUserFormSettingsByUserId = {
  params: Joi.object().keys({
    userId: Joi.string().required().min(1),
  }),
};

const upsertUserFormSettings = {
  params: Joi.object().keys({
    userId: Joi.string().required().min(1),
  }),
  body: Joi.object().keys({
    tenantId: tenantIdSchema,
    defaultFormSettings: Joi.object()
      .required()
      .keys({
        access: Joi.object()
          .keys({
            type: Joi.string()
              .valid('public', 'role-based', 'invite-only')
              .default('public'),
            requiresLogin: Joi.boolean().default(false),
            allowedRoles: Joi.array().items(Joi.string()).default([]),
            submissionLimit: Joi.number().integer().min(0).default(0),
            allowMultipleSubmissions: Joi.boolean().default(true),
            allowAnonymous: Joi.boolean().default(true),
          })
          .default({}),
        behavior: Joi.object()
          .keys({
            autosave: Joi.boolean().default(true),
            saveDraft: Joi.boolean().default(false),
            allowResubmission: Joi.boolean().default(false),
            showProgressBar: Joi.boolean().default(true),
            timeoutInMinutes: Joi.number().integer().min(0).default(0),
            redirectAfterSubmit: Joi.string().uri().allow(''),
            customSuccessMessage: Joi.string().allow(''),
          })
          .default({}),
        distribution: Joi.object()
          .keys({
            enablePublicUrl: Joi.boolean().default(true),
            enablePrivateUrl: Joi.boolean().default(false),
            enableHtmlEmbed: Joi.boolean().default(false),
            enableApiSubmission: Joi.boolean().default(false),
            enableJsEmbed: Joi.boolean().default(false),
            customDomain: Joi.string().allow(''),
          })
          .default({}),
        notifications: Joi.object()
          .keys({
            onSubmit: Joi.object()
              .keys({
                sendToUser: Joi.boolean().default(false),
                sendToOwner: Joi.boolean().default(true),
                emailTemplateId: Joi.string().default('default'),
                customEmails: Joi.array()
                  .items(Joi.string().email())
                  .default([]),
              })
              .default({}),
            onFailure: Joi.object()
              .keys({
                sendToOwner: Joi.boolean().default(false),
                emailTemplateId: Joi.string().default('error'),
              })
              .default({}),
          })
          .default({}),
        ui: Joi.object()
          .keys({
            theme: Joi.string()
              .valid('light', 'dark', 'auto', 'custom')
              .default('light'),
            layout: Joi.string()
              .valid('single-page', 'multi-step', 'wizard')
              .default('single-page'),
            branding: Joi.object()
              .keys({
                logoUrl: Joi.string().uri().allow(''),
                primaryColor: Joi.string().default('#3b82f6'),
                backgroundColor: Joi.string().default('#ffffff'),
                fontFamily: Joi.string().default('Inter'),
                customCss: Joi.string().allow(''),
              })
              .default({}),
            language: Joi.string().default('en'),
            showFormTitle: Joi.boolean().default(true),
            showFormDescription: Joi.boolean().default(true),
          })
          .default({}),
        builder: Joi.object()
          .keys({
            selectedStyle: Joi.string().default('default'),
            wizardMode: Joi.boolean().default(false),
            columnSpans: Joi.object().default({}),
            elements: Joi.array().default([]),
            formLayout: Joi.object()
              .keys({
                spacing: Joi.string()
                  .valid('compact', 'normal', 'comfortable')
                  .default('normal'),
                labelPosition: Joi.string()
                  .valid('top', 'left', 'floating')
                  .default('top'),
                buttonAlignment: Joi.string()
                  .valid('left', 'center', 'right')
                  .default('left'),
              })
              .default({}),
            validation: Joi.object()
              .keys({
                showRequiredAsterisk: Joi.boolean().default(true),
                validateOnSubmit: Joi.boolean().default(true),
                validateOnBlur: Joi.boolean().default(false),
              })
              .default({}),
          })
          .default({}),
        profileModal: Joi.object().optional().default({}),
      }),
  }),
};

module.exports = {
  createUserFormSettings,
  getUserFormSettings,
  getUserFormSettingsById,
  getUserFormSettingsByUserId,
  updateUserFormSettings,
  updateUserFormSettingsByUserId,
  deleteUserFormSettings,
  deleteUserFormSettingsByUserId,
  upsertUserFormSettings,
};
