const STORAGE_KEY = 'rehearse.workspace.v1';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function flowRisks(project) {
  const peopleFindingIds = new Set(safeArray(project.compileFindings)
    .filter((finding) => finding.field === 'people')
    .map((finding) => finding.id));
  return safeArray(project.risks)
    .filter((risk) => !['权限', '人员'].includes(risk.category) && !peopleFindingIds.has(risk.compileFindingId));
}

function normalizeRerunText(value) {
  return value === '确认唯一版本后重新导入材料，并检查下游时间与岗位'
    ? '采用唯一版本后重新计算流程，并检查下游时刻与现场条件'
    : value;
}

export function normalizeProject(project) {
  if (!project || typeof project !== 'object') return null;
  return {
    ...project,
    schemaVersion: 1,
    materials: safeArray(project.materials),
    moments: safeArray(project.moments),
    dimensions: safeArray(project.dimensions).map((dimension) => ({
      ...dimension,
      ...(dimension.id === 'people' && /人员|权限|责任人|负责人/.test(dimension.label || '') ? { label: '参与角色' } : {}),
    })),
    risks: safeArray(project.risks).map((risk) => {
      const legacyPeopleRisk = risk.category === '权限' && /责任字段|责任人/.test(risk.title || '');
      return { closed: false, ...risk, rerun: normalizeRerunText(risk.rerun), ...(legacyPeopleRisk ? { category: '人员', level: '中', title: String(risk.title || '').replace('没有可执行责任人', '参与角色尚未写入流程').replace('人员或责任字段', '参与角色字段') } : {}) };
    }),
    injects: safeArray(project.injects),
    decisions: safeArray(project.decisions),
    timingChecks: safeArray(project.timingChecks),
    compileFindings: safeArray(project.compileFindings).map((finding) => ({ ...finding, rerun: normalizeRerunText(finding.rerun) })),
    compileResolutions: safeArray(project.compileResolutions),
    simulations: safeArray(project.simulations),
    reruns: safeArray(project.reruns),
    updatedAt: project.updatedAt || project.generatedAt || new Date().toISOString(),
  };
}

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isMissing(value = '') {
  return !clean(value) || /^(?:待确认|待定|—|-|无|未提供)$/i.test(clean(value));
}

function coverage(project, dimensionId) {
  const dimension = safeArray(project.dimensions).find((item) => item.id === dimensionId);
  if (!dimension || !safeArray(dimension.cells).length) return 0;
  return dimension.cells.filter((cell) => !isMissing(cell)).length / dimension.cells.length;
}

function needStatus(value, required = true) {
  if (!required) return '不适用';
  if (value >= 0.8) return '已覆盖';
  if (value > 0) return '部分覆盖';
  return '需补充';
}

export function assessMaterialNeeds(project) {
  const normalized = normalizeProject(project);
  const text = normalized.moments.map((moment) => `${moment.title} ${moment.duration || ''}`).join(' ');
  const speechRequired = /演讲|致辞|分享|主持|串场|讲解|发布|宣讲|培训|presentation|speech|keynote/i.test(text);
  const productionRequired = /影片|视频|演示|直播|连线|抽奖|表演|主秀|颁奖|灯光|音响|投屏|presentation|demo|livestream|video/i.test(text);
  const crowdRequired = /入场|签到|散场|离场|巡游|合影|报到|展区|体验|registration|check-in|entry|exit/i.test(text) || coverage(normalized, 'space') > 0;
  const approvalRequired = /健康|营养|功效|抗衰|美白|产品|新品|医学|科研|配方|health|nutrition|claim|product/i.test(text);
  const inventoryRequired = /样品|礼品|礼包|体验|试用|赠品|物资发放|swag|sample|kit/i.test(text);
  const durationCoverage = normalized.moments.length
    ? normalized.moments.filter((moment) => !isMissing(moment.duration)).length / normalized.moments.length
    : 0;
  const scriptCoverage = normalized.timingChecks.length ? 1 : 0;
  const productionCoverage = Math.min(1, (coverage(normalized, 'resource') + coverage(normalized, 'contingency')) / 2);

  const items = [
    {
      id: 'flow', label: '流程与时间', owner: '项目总控／流程负责人', required: true,
      status: needStatus(normalized.moments.length ? Math.max(0.45, durationCoverage) : 0),
      ask: '流程表、日程或 Run of Show', why: '建立环节、开始时间、预算时长与转场关系',
      substitute: '最少提供“时间＋环节＋时长”的表格或文字清单',
    },
    {
      id: 'roles', label: '活动角色信息', owner: '现有岗位表／流程维护人', required: normalized.moments.length > 1,
      status: needStatus(coverage(normalized, 'people'), normalized.moments.length > 1),
      ask: '岗位表、嘉宾主持名单或执行通讯录', why: '检查同一角色是否被多个环节同时占用',
      substitute: '可直接在流程表增加“参与角色／执行岗位”列',
    },
    {
      id: 'script', label: '讲稿与主持词', owner: '讲者／主持／内容负责人', required: speechRequired,
      status: needStatus(scriptCoverage, speechRequired),
      ask: '最终讲稿、主持串词或提词稿', why: '把文字量和实测用时与流程预算逐段核对',
      substitute: '没有定稿时可先粘贴当前版本，系统会标记为估算',
    },
    {
      id: 'production', label: '技术与备援', owner: '技术统筹／舞台监督／供应商', required: productionRequired,
      status: needStatus(productionCoverage, productionRequired),
      ask: 'Cue表、设备清单、播放清单与备援说明', why: '核对切换条件、主备路径和跨岗位交接',
      substitute: '可在流程表补充“设备／平台／备援”三列',
    },
    {
      id: 'space', label: '场地与动线', owner: '场务／观众运营／场地方', required: crowdRequired,
      status: needStatus(coverage(normalized, 'space'), crowdRequired),
      ask: '平面图、区域表、入退场与分流说明', why: '检查同时占用、转场距离和异常人流处置',
      substitute: '没有图纸时先提供区域名称和入口／出口文字说明',
    },
    {
      id: 'approval', label: '对外口径与审批', owner: '内容／合规／业务负责人', required: approvalRequired,
      status: needStatus(coverage(normalized, 'approval'), approvalRequired),
      ask: '已审核讲稿、产品口径或版本确认记录', why: '确认现场只能使用的内容版本',
      substitute: '可在材料中标注“已审核／待审核＋版本号”',
    },
    {
      id: 'inventory', label: '样品与库存', owner: '物料负责人／体验区负责人', required: inventoryRequired,
      status: needStatus(coverage(normalized, 'inventory'), inventoryRequired),
      ask: '数量表、领用表、补货与回收规则', why: '按峰值核对余量、补货责任和缺货动作',
      substitute: '可在流程表增加“数量／补货人／最低余量”',
    },
  ];
  return items.filter((item) => item.required);
}

function durationSeconds(value = '') {
  const text = clean(value).toLowerCase();
  const hour = text.match(/([\d.]+)\s*(?:小时|hour|hr|h)/);
  const minute = text.match(/([\d.]+)\s*(?:分钟|minute|min)/);
  const second = text.match(/([\d.]+)\s*(?:秒|second|sec|s)/);
  return Math.round(Number(hour?.[1] || 0) * 3600 + Number(minute?.[1] || 0) * 60 + Number(second?.[1] || 0));
}

function clockSeconds(time = '') {
  const match = clean(time).match(/((?:[01]?\d|2[0-3]):[0-5]\d)/);
  if (!match) return null;
  const [hour, minute] = match[1].split(':').map(Number);
  return hour * 3600 + minute * 60;
}

export function analyzeScriptTiming(project, check) {
  const normalized = normalizeProject(project);
  const momentIndex = normalized.moments.findIndex((moment) => moment.id === check?.momentId);
  const moment = normalized.moments[momentIndex];
  if (!moment) return null;
  const text = String(check?.text || '');
  const chineseCharacters = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latinWords = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
  const speakable = chineseCharacters + latinWords;
  const punctuation = (text.match(/[，。！？；：,.!?;:]/g) || []).length;
  const rate = Number(check?.rate || 230);
  const estimatedSeconds = speakable ? Math.max(1, Math.round((chineseCharacters / rate) * 60 + (latinWords / 130) * 60 + punctuation * 0.09)) : 0;
  const measuredSeconds = Number(check?.measuredSeconds || 0);
  const measurementType = measuredSeconds ? (check?.measurementType || 'stopwatch') : '';
  const budgetSeconds = durationSeconds(moment.duration);
  const measurementConfirmedFull = Boolean(check?.measurementConfirmedFull);
  const suspiciousThreshold = budgetSeconds ? Math.max(30, Math.round(budgetSeconds * 0.25)) : 0;
  const measurementSuspicious = Boolean(measuredSeconds && suspiciousThreshold && measuredSeconds < suspiciousThreshold && !measurementConfirmedFull);
  const usedSeconds = measurementSuspicious && estimatedSeconds ? estimatedSeconds : measuredSeconds || estimatedSeconds;
  const basis = measurementSuspicious
    ? estimatedSeconds ? '文字估算（实测异常）' : '异常实测'
    : measuredSeconds
      ? measurementType === 'media' ? '音视频实测' : '真人计时'
      : estimatedSeconds ? '文字估算' : '未测';
  const next = normalized.moments[momentIndex + 1];
  const start = clockSeconds(moment.time);
  const nextStart = clockSeconds(next?.time);
  const availableUntilNext = start !== null && nextStart !== null && nextStart >= start ? nextStart - start : 0;
  const deltaSeconds = budgetSeconds ? usedSeconds - budgetSeconds : 0;
  const spillSeconds = availableUntilNext ? Math.max(0, usedSeconds - availableUntilNext) : Math.max(0, deltaSeconds);
  let status = '未校验';
  if (measurementSuspicious) status = '证据异常';
  else if (usedSeconds && !budgetSeconds) status = '缺少流程时长';
  else if (deltaSeconds > 0) status = measuredSeconds ? '实测超时' : '预计超时';
  else if (budgetSeconds && usedSeconds >= budgetSeconds * 0.85) status = '余量过少';
  else if (usedSeconds) status = measuredSeconds ? '实测可控' : '预计可控';
  return { moment, next, speakable, rate, estimatedSeconds, measuredSeconds, measurementType, measurementSource: check?.measurementSource || '', measurementHash: check?.measurementHash || '', measurementSegments: safeArray(check?.measurementSegments), measuredAt: check?.measuredAt || '', measurementConfirmedFull, measurementSuspicious, suspiciousThreshold, usedSeconds, basis, budgetSeconds, deltaSeconds, spillSeconds, status };
}

export function upsertTimingCheck(project, values) {
  const normalized = normalizeProject(project);
  const check = {
    id: values.id || `timing-${values.momentId}`,
    momentId: values.momentId,
    scriptName: clean(values.scriptName) || '粘贴讲稿',
    text: String(values.text || ''),
    rate: Number(values.rate || 230),
    measuredSeconds: Math.round(Number(values.measuredSeconds || 0)),
    measurementType: values.measuredSeconds ? (values.measurementType || 'stopwatch') : '',
    measurementSource: values.measuredSeconds ? clean(values.measurementSource) : '',
    measurementHash: values.measuredSeconds ? clean(values.measurementHash) : '',
    measurementSegments: values.measuredSeconds ? safeArray(values.measurementSegments).map((segment, index) => ({ id: segment.id || `segment-${index + 1}`, label: clean(segment.label) || `分段${index + 1}`, start: Number(segment.start || 0), end: Number(segment.end || 0) })) : [],
    measurementConfirmedFull: Boolean(values.measuredSeconds && values.measurementConfirmedFull),
    measuredAt: values.measuredSeconds ? (values.measuredAt || new Date().toISOString()) : '',
    updatedAt: new Date().toISOString(),
  };
  const timingChecks = [...normalized.timingChecks.filter((item) => item.momentId !== check.momentId), check];
  const draft = { ...normalized, timingChecks };
  const result = analyzeScriptTiming(draft, check);
  const riskId = `risk-timing-${check.momentId}`;
  const injectId = `inject-timing-${check.momentId}`;
  const baseRisks = draft.risks.filter((risk) => risk.id !== riskId);
  const baseInjects = draft.injects.filter((inject) => inject.id !== injectId);
  const shouldFlag = result && ['实测超时', '预计超时', '余量过少', '缺少流程时长', '证据异常'].includes(result.status);
  if (!shouldFlag) return normalizeProject({ ...draft, risks: baseRisks, injects: baseInjects });
  const overText = result.status === '证据异常'
    ? `${result.basis}只有${result.measuredSeconds}秒，明显短于${result.budgetSeconds}秒流程预算，需确认是否为完整跑稿或完整播放`
    : result.budgetSeconds
    ? `${result.basis}${Math.ceil(Math.abs(result.deltaSeconds) / 10) * 10}秒${result.deltaSeconds > 0 ? '超出' : '接近'}流程预算`
    : '流程表没有可比较的预算时长';
  const risk = {
    id: riskId, timingCheckId: check.id, closed: false,
    level: result.status === '实测超时' || result.spillSeconds > 0 || result.status === '证据异常' ? '高' : '中', category: '时间',
    title: `“${result.moment.title}”讲稿与流程时间不一致`,
    evidence: `${check.scriptName} × ${result.moment.sourceName || '流程表'} · ${result.moment.sourceRef || result.moment.time}`,
    owner: '内容负责人／流程负责人', deadline: '讲稿锁版前',
    rerun: '讲者按最终稿完整计时，连同上下台与下一环节再走一次', momentId: check.momentId,
    detail: overText,
    measurement: result.measurementType ? {
      type: result.measurementType,
      source: result.measurementSource,
      hash: result.measurementHash,
      segments: result.measurementSegments,
      measuredAt: result.measuredAt,
      seconds: result.measuredSeconds,
    } : null,
  };
  const inject = {
    id: injectId, riskId, title: risk.title, tag: '时间', severity: risk.level, time: result.moment.time,
    evidence: risk.evidence, owner: risk.owner, rerun: risk.rerun,
    prompt: `${overText}。记录采用的删减、延后或压缩方案，并注明对下一环节的影响。`,
    choices: [
      '按已确认优先级删减讲稿并重新实测',
      '调整流程结束时刻并同步后续环节',
      '设定超时后的硬切口令与备用收尾',
    ].map((label) => ({ label, impact: [`涉及范围：${result.moment.title}`, `下一环节：${result.next?.title || '活动收尾'}`, `复测：${risk.rerun}`] })),
  };
  return normalizeProject({ ...draft, risks: [...baseRisks, risk], injects: [...baseInjects, inject] });
}

export function synchronizeTimingChecks(project) {
  const normalized = normalizeProject(project);
  const momentIds = new Set(normalized.moments.map((moment) => moment.id));
  const timingChecks = normalized.timingChecks.filter((check) => momentIds.has(check.momentId));
  const base = { ...normalized, timingChecks };
  return timingChecks.reduce((current, check) => upsertTimingCheck(current, check), base);
}

export function timingPortfolio(project) {
  const normalized = normalizeProject(project);
  const speechMoments = normalized.moments.filter((moment) => /演讲|致辞|分享|主持|串场|讲解|发布|宣讲|培训|presentation|speech|keynote/i.test(moment.title));
  const results = normalized.timingChecks.map((check) => analyzeScriptTiming(normalized, check)).filter(Boolean);
  return {
    speechMoments,
    results,
    conflicts: results.filter((item) => ['实测超时', '预计超时', '余量过少', '缺少流程时长', '证据异常'].includes(item.status)),
    measured: results.filter((item) => item.measuredSeconds > 0 && !item.measurementSuspicious),
  };
}

function normalizedMomentTitle(value = '') {
  return clean(value).toLowerCase().replace(/[\s·｜|：:，,。.!！?？()（）\-_]/g, '');
}

export function adoptCompileValue(project, findingId, sourceValue) {
  const normalized = normalizeProject(project);
  const finding = normalized.compileFindings.find((item) => item.id === findingId);
  const source = finding?.sources?.find((item) => item.sourceId === sourceValue?.sourceId && item.sourceRef === sourceValue?.sourceRef)
    || finding?.sources?.find((item) => item.value === sourceValue?.value);
  if (!finding || !source) return normalized;
  const momentIndex = normalized.moments.findIndex((moment) => normalizedMomentTitle(moment.title) === normalizedMomentTitle(finding.momentTitle));
  if (momentIndex < 0) return normalized;
  const updatedMoments = normalized.moments.map((moment, index) => {
    if (index !== momentIndex) return moment;
    if (finding.field === 'time' || finding.field === 'duration') return { ...moment, [finding.field]: source.value, resolvedSource: `${source.sourceName} · ${source.sourceRef}` };
    return { ...moment, fields: { ...(moment.fields || {}), [finding.field]: source.value }, resolvedSource: `${source.sourceName} · ${source.sourceRef}` };
  });
  const order = updatedMoments.map((moment, oldIndex) => ({ moment, oldIndex })).sort((a, b) => (clockSeconds(a.moment.time) ?? 0) - (clockSeconds(b.moment.time) ?? 0));
  const moments = order.map((item) => item.moment);
  const dimensions = normalized.dimensions.map((dimension) => {
    const cells = order.map(({ oldIndex }) => dimension.id === finding.field && oldIndex === momentIndex ? source.value : dimension.cells[oldIndex]);
    return { ...dimension, cells };
  });
  const compileFindings = normalized.compileFindings.filter((item) => item.id !== finding.id);
  const removedRiskIds = new Set(normalized.risks.filter((risk) => risk.compileFindingId === finding.id).map((risk) => risk.id));
  const risks = normalized.risks.filter((risk) => !removedRiskIds.has(risk.id));
  const injects = normalized.injects.filter((inject) => !removedRiskIds.has(inject.riskId));
  const activeInjectIds = new Set(injects.map((inject) => inject.id));
  const resolution = { id: `resolution-${finding.id}`, findingId: finding.id, momentTitle: finding.momentTitle, title: finding.title, field: finding.field, fieldLabel: finding.fieldLabel, value: source.value, sourceId: source.sourceId, sourceName: source.sourceName, sourceRef: source.sourceRef, sources: safeArray(finding.sources), resolvedAt: new Date().toISOString() };
  return normalizeProject({ ...normalized, moments, dimensions, compileFindings, risks, injects, decisions: normalized.decisions.filter((decision) => activeInjectIds.has(decision.injectId)), compileResolutions: [...normalized.compileResolutions.filter((item) => item.findingId !== finding.id), resolution] });
}

export function reviseCompileResolution(project, resolutionId, sourceValue) {
  const normalized = normalizeProject(project);
  const resolution = normalized.compileResolutions.find((item) => item.id === resolutionId);
  if (!resolution?.sources?.length) return normalized;
  const finding = { ...resolution, id: resolution.findingId, sources: resolution.sources };
  return adoptCompileValue({ ...normalized, compileFindings: [...normalized.compileFindings, finding] }, finding.id, sourceValue);
}

export function recordRerun(project, riskId, values) {
  const normalized = normalizeProject(project);
  const risk = normalized.risks.find((item) => item.id === riskId);
  if (!risk) return normalized;
  const confirmedBy = clean(values?.confirmedBy || values?.performedBy || values?.verifiedBy);
  const note = clean(values?.note);
  if (!note) return normalized;
  const rerun = {
    id: values?.id || `rerun-${riskId}`,
    riskId,
    confirmedBy,
    performedBy: confirmedBy || '现场团队',
    verifiedBy: confirmedBy || '现场团队',
    note,
    performedAt: values?.performedAt || new Date().toISOString(),
    evidenceName: clean(values?.evidenceName),
    evidenceType: clean(values?.evidenceType),
    evidenceSize: Number(values?.evidenceSize || 0),
    evidenceHash: clean(values?.evidenceHash),
  };
  const reruns = [...normalized.reruns.filter((item) => item.riskId !== riskId), rerun];
  const risks = normalized.risks.map((item) => item.id === riskId ? { ...item, closed: true, closedAt: rerun.performedAt } : item);
  return normalizeProject({ ...normalized, risks, reruns });
}

export function reopenRisk(project, riskId) {
  const normalized = normalizeProject(project);
  return normalizeProject({
    ...normalized,
    risks: normalized.risks.map((item) => item.id === riskId ? { ...item, closed: false, closedAt: '' } : item),
    reruns: normalized.reruns.filter((item) => item.riskId !== riskId),
  });
}

export function loadWorkspace(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    const projects = safeArray(parsed?.projects).map(normalizeProject).filter(Boolean);
    const activeId = projects.some((project) => project.id === parsed?.activeId)
      ? parsed.activeId
      : projects[0]?.id;
    return { projects, activeId };
  } catch {
    return { projects: [], activeId: undefined };
  }
}

export function saveWorkspace(projects, activeId, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, activeId, projects }));
    return true;
  } catch {
    return false;
  }
}

export function upsertProject(projects, project) {
  const next = normalizeProject({ ...project, updatedAt: new Date().toISOString() });
  const index = projects.findIndex((item) => item.id === next.id);
  if (index < 0) return [next, ...projects];
  return projects.map((item) => item.id === next.id ? next : item);
}

function riskSignature(risk) {
  return [risk.category, risk.title, risk.evidence].map(clean).join('|');
}

function momentSignature(moment) {
  return [moment.title, moment.time].map(clean).join('|');
}

export function mergeProjectAnalysis(currentProject, analyzedProject) {
  const current = normalizeProject(currentProject);
  const analyzed = normalizeProject(analyzedProject);
  if (!current || !analyzed) return current || analyzed;

  const previousRisks = new Map(current.risks.map((risk) => [riskSignature(risk), risk]));
  const remappedRiskIds = new Map();
  const risks = analyzed.risks.map((risk) => {
    const previous = previousRisks.get(riskSignature(risk));
    const id = previous?.id || risk.id;
    remappedRiskIds.set(risk.id, id);
    return previous ? { ...risk, id, closed: previous.closed, closedAt: previous.closedAt || '' } : risk;
  });

  const previousInjects = new Map(current.injects.map((inject) => [inject.riskId, inject]));
  const injects = analyzed.injects.map((inject) => {
    const riskId = remappedRiskIds.get(inject.riskId) || inject.riskId;
    const previous = previousInjects.get(riskId);
    return previous ? { ...inject, id: previous.id, riskId } : { ...inject, riskId };
  });
  const activeInjectIds = new Set(injects.map((inject) => inject.id));
  const activeRiskIds = new Set(risks.map((risk) => risk.id));

  const analyzedMoments = new Map(analyzed.moments.map((moment) => [momentSignature(moment), moment]));
  const retainedMeasurements = current.timingChecks.flatMap((check) => {
    if (!check.measuredSeconds) return [];
    const oldMoment = current.moments.find((moment) => moment.id === check.momentId);
    const nextMoment = oldMoment && analyzedMoments.get(momentSignature(oldMoment));
    return nextMoment ? [{ ...check, momentId: nextMoment.id }] : [];
  });
  const measuredKeys = new Set(retainedMeasurements.map((check) => `${check.momentId}|${clean(check.scriptName)}`));
  const timingChecks = [
    ...retainedMeasurements,
    ...analyzed.timingChecks.filter((check) => !measuredKeys.has(`${check.momentId}|${clean(check.scriptName)}`)),
  ];

  return normalizeProject({
    ...analyzed,
    id: current.id,
    title: current.title,
    date: current.date,
    venue: current.venue,
    decisions: current.decisions.filter((decision) => activeInjectIds.has(decision.injectId)),
    reruns: current.reruns.filter((rerun) => activeRiskIds.has(rerun.riskId)),
    risks,
    injects,
    timingChecks,
    updatedAt: new Date().toISOString(),
  });
}

export function calculateReadiness(project) {
  const normalized = normalizeProject(project);
  const relevantRisks = flowRisks(normalized);
  const highOpen = relevantRisks.filter((risk) => risk.level === '高' && !risk.closed).length;
  const mediumOpen = relevantRisks.filter((risk) => risk.level !== '高' && !risk.closed).length;
  const closed = relevantRisks.filter((risk) => risk.closed).length;
  const sourceCoverage = normalized.moments.length
    ? Math.round((normalized.moments.filter((moment) => moment.sourceName && moment.sourceRef).length / normalized.moments.length) * 100)
    : 0;
  const relevantRiskIds = new Set(relevantRisks.map((risk) => risk.id));
  const decisionCoverage = relevantRisks.length
    ? Math.round((new Set(normalized.simulations.map((run) => run.riskId).filter((id) => relevantRiskIds.has(id))).size / relevantRisks.length) * 100)
    : 100;
  // The score is a decision aid, not a guarantee of a perfect live event.
  // Keep a small human-verification reserve even after all modeled checks pass.
  const rawScore = Math.max(0, Math.min(95,
    Math.round((normalized.confidence || 0) * 0.45 + sourceCoverage * 0.25 + decisionCoverage * 0.3 - highOpen * 7 - mediumOpen * 2 + closed * 2),
  ));
  // A documented decision is not the same as a tested contingency. Any open
  // blocking risk caps readiness below the "ready for full rehearsal" band.
  const score = highOpen > 0 ? Math.min(rawScore, 79) : rawScore;
  const label = highOpen > 0 ? '存在阻断项' : score >= 82 ? '可进入联排' : score >= 65 ? '需要补证' : '尚未就绪';
  return { score, label, highOpen, mediumOpen, closed, sourceCoverage, decisionCoverage, simulationCoverage: decisionCoverage };
}

export function recordDecision(project, inject, values) {
  const decision = {
    id: `decision-${Date.now().toString(36)}`,
    injectId: inject.id,
    riskId: inject.riskId,
    title: inject.title,
    time: inject.time,
    instruction: values.instruction.trim(),
    owner: values.owner.trim() || inject.owner || '待确认',
    notify: values.notify.trim() || '受影响岗位待确认',
    rerun: inject.rerun || '重新走台',
    score: values.score || 0,
    createdAt: new Date().toISOString(),
  };
  const existing = safeArray(project.decisions).filter((item) => item.injectId !== inject.id);
  return normalizeProject({ ...project, decisions: [...existing, decision] });
}

export function buildCueRehearsal(project, injectId) {
  const normalized = normalizeProject(project);
  const latestDecision = normalized.decisions.at(-1);
  const inject = normalized.injects.find((item) => item.id === injectId)
    || normalized.injects.find((item) => item.id === latestDecision?.injectId)
    || normalized.injects[0];
  if (!inject) return null;

  const risk = normalized.risks.find((item) => item.id === inject.riskId);
  const focusIndex = Math.max(0, normalized.moments.findIndex((moment) => moment.id === risk?.momentId));
  const focus = normalized.moments[focusIndex] || normalized.moments[0] || { time: inject.time || '待定', title: '关键环节' };
  const next = normalized.moments[focusIndex + 1] || focus;
  const decision = normalized.decisions.find((item) => item.injectId === inject.id);
  const suggestedInstruction = inject.choices?.[0]?.label || `暂停${focus.title}，由${inject.owner || '项目负责人'}确认下一动作`;
  const instruction = decision?.instruction || suggestedInstruction;
  const owner = decision?.owner || inject.owner || '放行人待确认';
  const notify = decision?.notify || '通知范围待确认';
  const rerun = decision?.rerun || inject.rerun || '重新走台';

  return {
    inject,
    risk,
    focus,
    next,
    decision,
    riskLines: [
      { who: '总控', text: `${focus.time}，${focus.title}无法按原计划执行，现场等待确认。` },
      { who: '相关岗位', text: `放行人、通知范围或止损动作尚未形成统一口令。` },
      { who: '主持', text: `继续垫场，${next.title}暂不切换。` },
    ],
    revisedLines: [
      { who: owner, text: instruction },
      { who: '总控', text: `同步范围：${notify}。` },
      { who: '复测', text: `${rerun}。` },
    ],
  };
}

export function serializeProject(project) {
  return JSON.stringify({
    format: 'rehearse-project',
    version: 1,
    exportedAt: new Date().toISOString(),
    project: normalizeProject(project),
  }, null, 2);
}

export async function parseProjectExport(text) {
  const { validateProjectExportText } = await import('./projectValidator.js');
  const parsed = validateProjectExportText(text);
  return normalizeProject(parsed.project);
}

export function buildBriefMarkdown(project) {
  const readiness = calculateReadiness(project);
  const openRisks = flowRisks(project).filter((risk) => !risk.closed);
  const simulations = safeArray(project.simulations);
  const needs = assessMaterialNeeds(project);
  const timing = timingPortfolio(project);
  const lines = [
    `# ${project.title}｜流程模拟与联排清单`,
    '',
    `- 日期：${project.date}`,
    `- 场地：${project.venue}`,
    `- 开场前状态：${openRisks.length}个变化仍待验证｜${readiness.closed}项已通过联排`,
    `- 材料：${project.materials.length}份｜环节：${project.moments.length}个｜已保存模拟方案：${simulations.length}个`,
    '',
    '## 待模拟或验证的变化',
    ...(openRisks.length ? openRisks.map((risk, index) => `${index + 1}. **[${risk.level}] ${risk.title}**\n   - 来源：${risk.evidence}\n   - 建议联排：${risk.rerun}`) : ['当前识别出的变化均已有验证结果。']),
    '',
    '## 已保存的模拟方案',
    ...(simulations.length ? simulations.map((run, index) => `${index + 1}. **${run.title}｜${run.strategyLabel || run.strategy}**\n   - 变化：${run.delayMinutes}分钟\n   - 影响：${run.summary?.affectedCount || 0}个环节，最大延迟${run.summary?.maxDelay || 0}分钟，${run.summary?.collisionCount || 0}处重叠\n   - 依据：${run.evidence || '自定义演练假设'}`) : ['尚未保存流程模拟方案。']),
    '',
    '## 还需要补什么材料',
    ...needs.filter((item) => item.status !== '已覆盖').map((item) => `- **${item.label}｜${item.status}**：${item.ask}\n  - 建议来源：${item.owner}\n  - 用途：${item.why}\n  - 没有现成文件时：${item.substitute}`),
    ...(needs.every((item) => item.status === '已覆盖') ? ['本场演练需要的材料类型当前均已覆盖。'] : []),
    '',
    '## 讲稿时长核对',
    ...(timing.results.length ? timing.results.map((item) => `- **${item.moment.time}｜${item.moment.title}｜${item.status}**：流程预算${item.budgetSeconds ? `${Math.round(item.budgetSeconds / 60 * 10) / 10}分钟` : '未填写'}；${item.basis}${Math.round(item.usedSeconds / 6) / 10}分钟${item.measurementSource ? `（${item.measurementSource}）` : ''}${item.next ? `；下一环节${item.next.time} ${item.next.title}` : ''}`) : [timing.speechMoments.length ? '尚无讲稿或真实音视频记录，无法核对人工演讲时长。' : '当前材料未识别出需要校时的演讲或播放环节。']),
    '',
    '## 复测证据',
    ...(safeArray(project.reruns).length ? safeArray(project.reruns).map((rerun) => `- **${project.risks.find((risk) => risk.id === rerun.riskId)?.title || rerun.riskId}**：${rerun.performedAt}\n  - 结果：${rerun.note}${rerun.confirmedBy ? `\n  - 记录：${rerun.confirmedBy}` : ''}${rerun.evidenceName ? `\n  - 附件：${rerun.evidenceName}${rerun.evidenceHash ? `（SHA-256 ${rerun.evidenceHash.slice(0, 12)}…）` : ''}` : ''}`) : ['尚无完成复测的证据记录。']),
    '',
    '## 来源材料',
    ...project.materials.map((material) => `- ${material.name}（${material.type}）`),
    '',
    '> 本清单由 REHEARSE 根据已导入材料、模拟结果和联排记录生成。空间容量、人群感受、设备切换与现场可行性仍需专业人员核验。',
  ];
  return lines.join('\n');
}

export function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function safeFilename(value) {
  return String(value || 'rehearse-project').replace(/[\\/:*?"<>|]/g, '-').slice(0, 64);
}

export { STORAGE_KEY };
