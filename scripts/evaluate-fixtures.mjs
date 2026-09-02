import { File } from 'node:buffer';
import { BENCHMARK_VERSION, GOLD_CASES } from '../benchmarks/gold.mjs';

globalThis.File = File;

const engine = await import('../src/lib/eventEngine.js');
const { buildScenarioCatalog } = await import('../src/lib/simulation.js');

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function setScore(predictedValues, expectedValues) {
  const predicted = new Set(predictedValues);
  const expected = new Set(expectedValues);
  const matched = [...predicted].filter((value) => expected.has(value)).length;
  const precision = predicted.size ? matched / predicted.size : expected.size ? 0 : 1;
  const recall = expected.size ? matched / expected.size : predicted.size ? 0 : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { matched, predicted: predicted.size, expected: expected.size, precision, recall, f1 };
}

function flowRisks(project) {
  const peopleFindingIds = new Set((project.compileFindings || []).filter((finding) => finding.field === 'people').map((finding) => finding.id));
  return (project.risks || []).filter((risk) => !['权限', '人员'].includes(risk.category) && !peopleFindingIds.has(risk.compileFindingId));
}

const totals = {
  metadata: { matched: 0, expected: 0 },
  moments: { matched: 0, predicted: 0, expected: 0 },
  durations: { matched: 0, expected: 0 },
  sources: { matched: 0, expected: 0 },
  dimensions: { matched: 0, predicted: 0, expected: 0 },
  findings: { matched: 0, predicted: 0, expected: 0 },
  risks: { matched: 0, expected: 0 },
  traceability: { matched: 0, expected: 0 },
  scenarios: { matched: 0, expected: 0 },
};
const cases = [];

for (const [kind, gold] of Object.entries(GOLD_CASES)) {
  const project = engine.inferEventModel(await engine.parseFiles(engine.makeSampleFiles(kind)));
  const goldMoments = gold.moments.map((value) => {
    const [time, title, duration] = value.split('|');
    return { time, title, duration };
  });
  const momentScore = setScore(project.moments.map((moment) => `${moment.time}|${moment.title}`), goldMoments.map((moment) => `${moment.time}|${moment.title}`));
  const dimensionScore = setScore(project.dimensions.map((dimension) => dimension.id), gold.dimensions);
  const findingScore = setScore(project.compileFindings.map((finding) => `${finding.momentTitle}|${finding.field}`), gold.compileFindings);
  const metadataMatched = ['title', 'date', 'venue'].filter((field) => project[field] === gold[field]).length;
  const durationGold = goldMoments.filter((moment) => moment.duration);
  const durationMatched = durationGold.filter((expected) => project.moments.some((moment) => moment.time === expected.time && moment.title === expected.title && moment.duration === expected.duration)).length;
  const sourceMatched = goldMoments.filter((expected, index) => project.moments.some((moment) => moment.time === expected.time
    && moment.title === expected.title
    && moment.sourceName === gold.source.name
    && moment.sourceRef.endsWith(`第${gold.source.firstRow + index}行`))).length;
  const risks = flowRisks(project);
  const momentTitles = new Map(project.moments.map((moment) => [moment.id, moment.title]));
  const riskKeys = new Set(risks.map((risk) => `${risk.category}|${momentTitles.get(risk.momentId) || ''}`));
  const requiredRiskMatched = gold.requiredRisks.filter((key) => riskKeys.has(key)).length;
  const traceable = risks.filter((risk) => risk.evidence && risk.rerun && risk.momentId && momentTitles.has(risk.momentId)).length;
  const scenarioRiskIds = new Set(buildScenarioCatalog(project).map((scenario) => scenario.riskId).filter(Boolean));
  const scenarioMatched = risks.filter((risk) => scenarioRiskIds.has(risk.id)).length;

  totals.metadata.matched += metadataMatched; totals.metadata.expected += 3;
  totals.moments.matched += momentScore.matched; totals.moments.predicted += momentScore.predicted; totals.moments.expected += momentScore.expected;
  totals.durations.matched += durationMatched; totals.durations.expected += durationGold.length;
  totals.sources.matched += sourceMatched; totals.sources.expected += goldMoments.length;
  totals.dimensions.matched += dimensionScore.matched; totals.dimensions.predicted += dimensionScore.predicted; totals.dimensions.expected += dimensionScore.expected;
  totals.findings.matched += findingScore.matched; totals.findings.predicted += findingScore.predicted; totals.findings.expected += findingScore.expected;
  totals.risks.matched += requiredRiskMatched; totals.risks.expected += gold.requiredRisks.length;
  totals.traceability.matched += traceable; totals.traceability.expected += risks.length;
  totals.scenarios.matched += scenarioMatched; totals.scenarios.expected += risks.length;

  cases.push({
    kind, title: gold.title,
    metadata: `${metadataMatched}/3`,
    moments: `${momentScore.matched}/${momentScore.expected}`,
    dimensions: `${dimensionScore.matched}/${dimensionScore.expected}`,
    findings: `${findingScore.matched}/${findingScore.expected}`,
    requiredRisks: `${requiredRiskMatched}/${gold.requiredRisks.length}`,
  });
}

function aggregateSetRatios(total) {
  const precision = total.predicted ? total.matched / total.predicted : total.expected ? 0 : 1;
  const recall = total.expected ? total.matched / total.expected : total.predicted ? 0 : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

const momentSet = aggregateSetRatios(totals.moments);
const dimensionSet = aggregateSetRatios(totals.dimensions);
const findingSet = aggregateSetRatios(totals.findings);
const ratios = {
  metadataAccuracy: totals.metadata.matched / totals.metadata.expected,
  momentPrecision: momentSet.precision,
  momentRecall: momentSet.recall,
  momentF1: momentSet.f1,
  durationAccuracy: totals.durations.matched / totals.durations.expected,
  sourceReferenceAccuracy: totals.sources.matched / totals.sources.expected,
  dimensionPrecision: dimensionSet.precision,
  dimensionRecall: dimensionSet.recall,
  compileFindingPrecision: findingSet.precision,
  compileFindingRecall: findingSet.recall,
  requiredRiskRecall: totals.risks.matched / totals.risks.expected,
  riskTraceability: totals.traceability.matched / totals.traceability.expected,
  scenarioCoverage: totals.scenarios.matched / totals.scenarios.expected,
};
const passed = Object.values(ratios).every((value) => value === 1);
const report = { benchmark: `fixture-${BENCHMARK_VERSION}`, scope: '7个公开结构化活动夹具；确定性回归基准，不代表任意生产文档准确率', cases, totals, metrics: ratios, passed };

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`REHEARSE fixture benchmark ${BENCHMARK_VERSION}`);
  console.log('Scope: 7 curated public-structure fixtures. This is a deterministic regression gate, not a claim about arbitrary production documents.\n');
  console.table(cases);
  console.log(`Metadata exact accuracy       ${percent(ratios.metadataAccuracy)} (${totals.metadata.matched}/${totals.metadata.expected})`);
  console.log(`Moment extraction P/R/F1     ${percent(ratios.momentPrecision)} / ${percent(ratios.momentRecall)} / ${percent(ratios.momentF1)}`);
  console.log(`Duration exact accuracy       ${percent(ratios.durationAccuracy)} (${totals.durations.matched}/${totals.durations.expected})`);
  console.log(`Source-reference accuracy     ${percent(ratios.sourceReferenceAccuracy)} (${totals.sources.matched}/${totals.sources.expected})`);
  console.log(`Dimension precision/recall    ${percent(ratios.dimensionPrecision)} / ${percent(ratios.dimensionRecall)}`);
  console.log(`Compile finding P/R           ${percent(ratios.compileFindingPrecision)} / ${percent(ratios.compileFindingRecall)}`);
  console.log(`Required risk recall          ${percent(ratios.requiredRiskRecall)} (${totals.risks.matched}/${totals.risks.expected})`);
  console.log(`Risk traceability             ${percent(ratios.riskTraceability)} (${totals.traceability.matched}/${totals.traceability.expected})`);
  console.log(`Flow-risk scenario coverage   ${percent(ratios.scenarioCoverage)} (${totals.scenarios.matched}/${totals.scenarios.expected})`);
  console.log(`\nGate: ${passed ? 'PASS' : 'FAIL'}`);
}

if (!passed) process.exitCode = 1;
