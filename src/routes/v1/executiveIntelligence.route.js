const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const executiveIntelligenceValidation = require('../../validations/executiveIntelligence.validation');
const executiveIntelligenceController = require('../../controllers/executiveIntelligence.controller');

const router = express.Router();

router.get(
  '/capabilities',
  auth(),
  executiveIntelligenceController.getCapabilities
);

router
  .route('/knowledge-artifact')
  .get(auth(), executiveIntelligenceController.getKnowledgeArtifact);

router.get(
  '/knowledge-artifact/status',
  auth(),
  executiveIntelligenceController.getKnowledgeArtifactStatus
);

router.get(
  '/knowledge-artifact/versions',
  auth(),
  validate(executiveIntelligenceValidation.listKnowledgeArtifactVersions),
  executiveIntelligenceController.listKnowledgeArtifactVersions
);

router.post(
  '/knowledge-artifact/rebuild',
  auth(),
  validate(executiveIntelligenceValidation.rebuildKnowledgeArtifact),
  executiveIntelligenceController.rebuildKnowledgeArtifact
);

router
  .route('/semantic-memory')
  .get(
    auth(),
    validate(executiveIntelligenceValidation.listSemanticMemory),
    executiveIntelligenceController.listSemanticMemory
  )
  .post(
    auth(),
    validate(executiveIntelligenceValidation.createSemanticMemory),
    executiveIntelligenceController.createSemanticMemory
  );

router.patch(
  '/semantic-memory/:memoryId/review',
  auth(),
  validate(executiveIntelligenceValidation.reviewSemanticMemory),
  executiveIntelligenceController.reviewSemanticMemory
);

router.post(
  '/context',
  auth(),
  validate(executiveIntelligenceValidation.createRequestContext),
  executiveIntelligenceController.createRequestContext
);

router.post(
  '/execution-plan',
  auth(),
  validate(executiveIntelligenceValidation.createExecutionPlan),
  executiveIntelligenceController.createExecutionPlan
);

router.post(
  '/internal/generated-sql',
  auth(),
  validate(executiveIntelligenceValidation.executeGeneratedSqlTool),
  executiveIntelligenceController.executeGeneratedSqlTool
);

router.post(
  '/internal/generated-python',
  auth(),
  validate(executiveIntelligenceValidation.executeGeneratedPythonTool),
  executiveIntelligenceController.executeGeneratedPythonTool
);

router.post(
  '/project-form-report',
  auth(),
  validate(executiveIntelligenceValidation.executeProjectFormReport),
  executiveIntelligenceController.executeProjectFormReport
);

router.post(
  '/project-form-analysis',
  auth(),
  validate(executiveIntelligenceValidation.executeProjectFormAnalysis),
  executiveIntelligenceController.executeProjectFormAnalysis
);

router.post(
  '/project-form-ranking',
  auth(),
  validate(executiveIntelligenceValidation.executeProjectFormRanking),
  executiveIntelligenceController.executeProjectFormRanking
);

router.post(
  '/project-form-trend',
  auth(),
  validate(executiveIntelligenceValidation.executeProjectFormTrend),
  executiveIntelligenceController.executeProjectFormTrend
);

router.post(
  '/project-form-period-comparison',
  auth(),
  validate(executiveIntelligenceValidation.executeProjectFormPeriodComparison),
  executiveIntelligenceController.executeProjectFormPeriodComparison
);

router.post(
  '/project-form-anomalies',
  auth(),
  validate(executiveIntelligenceValidation.executeProjectFormAnomalies),
  executiveIntelligenceController.executeProjectFormAnomalies
);

router.post(
  '/project-form-aggregation',
  auth(),
  validate(executiveIntelligenceValidation.executeProjectFormAggregation),
  executiveIntelligenceController.executeProjectFormAggregation
);

router.post(
  '/project-form-multi-comparison',
  auth(),
  validate(executiveIntelligenceValidation.executeMultiProjectFormComparison),
  executiveIntelligenceController.executeMultiProjectFormComparison
);

router.get(
  '/exports/:exportId/download',
  auth(),
  validate(executiveIntelligenceValidation.downloadReportExport),
  executiveIntelligenceController.downloadReportExport
);

router.get(
  '/audit-events',
  auth(),
  validate(executiveIntelligenceValidation.listAuditEvents),
  executiveIntelligenceController.listAuditEvents
);

module.exports = router;
