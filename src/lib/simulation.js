function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clockMinutes(value = '') {
  const match = clean(value).match(/((?:[01]?\d|2[0-3]):[0-5]\d)/);
  if (!match) return null;
  const [hour, minute] = match[1].split(':').map(Number);
  return hour * 60 + minute;
}

function durationMinutes(value = '') {
  const text = clean(value).toLowerCase();
  const hour = text.match(/([\d.]+)\s*(?:小时|hour|hr|h)/);
  const minute = text.match(/([\d.]+)\s*(?:分钟|minute|min)/);
  const second = text.match(/([\d.]+)\s*(?:秒|second|sec|s)/);
  return Math.max(0, Math.round(Number(hour?.[1] || 0) * 60 + Number(minute?.[1] || 0) + Number(second?.[1] || 0) / 60));
}

function formatClock(value) {
  const minutes = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function defaultDelay(category = '') {
  return ({ 时间: 6, 冲突: 8, 版本冲突: 4, 备援: 8, 信号: 10, 动线: 6, 库存: 5, 合规: 6, 权限: 4 }[category] || 5);
}

function differenceMinutes(finding) {
  if (!finding?.sources?.length) return 0;
  if (finding.field === 'time') {
    const values = finding.sources.map((source) => clockMinutes(source.value)).filter((value) => value !== null);
    return values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
  }
  if (finding.field === 'duration') {
    const values = finding.sources.map((source) => durationMinutes(source.value)).filter((value) => value > 0);
    return values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
  }
  return 0;
}

function strategyLabel(strategy) {
  return ({ cascade: '顺延后续环节', hold: '守住原定时刻', recover: '压缩当前环节' }[strategy] || '顺延后续环节');
}

function effectTypeFor(risk = {}, finding = {}) {
  if (finding.field === 'duration') return 'duration-extension';
  if (finding.field === 'time' || risk.category === '时间') return 'start-delay';
  return 'interruption';
}

function effectLabel(effectType) {
  return ({
    'start-delay': '开始延后',
    'duration-extension': '时长增加',
    interruption: '中断恢复',
  }[effectType] || '流程影响');
}

function scenarioPriority(scenario) {
  const categoryWeight = ({ 备援: 60, 信号: 58, 设备: 56, 动线: 48, 合规: 46, 时间: 42, 冲突: 38, 版本冲突: 36, 库存: 28 }[scenario.category] || 20);
  const levelWeight = ({ 高: 100, 中: 45, 低: 10 }[scenario.level] || 0);
  return levelWeight + categoryWeight + Math.min(30, scenario.defaultDelay || 0);
}

export function buildScenarioCatalog(project) {
  const moments = Array.isArray(project?.moments) ? project.moments : [];
  const findings = new Map((project?.compileFindings || []).map((finding) => [finding.id, finding]));
  const openRisks = (Array.isArray(project?.risks) ? project.risks : []).filter((risk) => {
    const finding = findings.get(risk.compileFindingId);
    return !risk.closed && !['权限', '人员'].includes(risk.category) && finding?.field !== 'people' && moments.some((moment) => moment.id === risk.momentId);
  });
  const scenarios = openRisks.map((risk) => {
    const finding = findings.get(risk.compileFindingId);
    const measuredDifference = differenceMinutes(finding);
    const delay = measuredDifference || defaultDelay(risk.category);
    const effectType = effectTypeFor(risk, finding);
    return ({
    id: `scenario-${risk.id}`,
    riskId: risk.id,
    momentId: risk.momentId,
    title: risk.title,
    category: risk.category,
    level: risk.level,
    evidence: risk.evidence,
    defaultDelay: delay,
    effectType,
    effectLabel: effectLabel(effectType),
    assumption: measuredDifference
      ? `两份材料相差${measuredDifference}分钟，本次按“${effectLabel(effectType)}”推演。`
      : `先按${delay}分钟的“${effectLabel(effectType)}”进行压力测试，可按现场经验调整。`,
  }); }).sort((a, b) => scenarioPriority(b) - scenarioPriority(a));
  scenarios.forEach((scenario, index) => { scenario.recommended = index === 0; });
  if (moments[0] && !scenarios.length) scenarios.push({
    id: 'scenario-custom', riskId: '', momentId: moments[0].id, title: '自定义现场变化', category: '自定义', evidence: '由演练人员设定，不作为材料事实', defaultDelay: 5,
    effectType: 'start-delay', effectLabel: '开始延后', recommended: true,
    assumption: '影响分钟数由演练人员输入，系统按“开始延后”计算其传播结果。',
  });
  return scenarios;
}

function baselineRows(moments) {
  return moments.map((moment, index) => {
    const start = clockMinutes(moment.time);
    const nextStart = clockMinutes(moments[index + 1]?.time);
    const explicitDuration = durationMinutes(moment.duration);
    const inferredDuration = start !== null && nextStart !== null && nextStart > start ? nextStart - start : 5;
    return {
      id: moment.id,
      title: moment.title,
      plannedStart: start ?? (index ? null : 0),
      duration: explicitDuration || inferredDuration,
      durationBasis: explicitDuration ? '材料时长' : nextStart !== null ? '按下一环节反推' : '暂按5分钟',
      sourceName: moment.sourceName,
      sourceRef: moment.sourceRef,
    };
  }).map((row, index, rows) => ({
    ...row,
    plannedStart: row.plannedStart ?? ((rows[index - 1]?.plannedStart || 0) + (rows[index - 1]?.duration || 5)),
  }));
}

export function simulateEvent(project, options = {}) {
  const moments = Array.isArray(project?.moments) ? project.moments : [];
  const scenarios = buildScenarioCatalog(project);
  const scenario = scenarios.find((item) => item.id === options.scenarioId) || scenarios[0];
  if (!scenario || !moments.length) return null;
  const momentId = options.momentId || scenario.momentId || moments[0].id;
  const injectIndex = Math.max(0, moments.findIndex((moment) => moment.id === momentId));
  const delayMinutes = Math.max(0, Math.min(120, Number(options.delayMinutes ?? scenario.defaultDelay) || 0));
  const recoveryMinutes = Math.max(0, Math.min(60, Number(options.recoveryMinutes || 0) || 0));
  const strategy = ['cascade', 'hold', 'recover'].includes(options.strategy) ? options.strategy : 'cascade';
  const effectType = scenario.effectType || 'start-delay';
  const rows = baselineRows(moments);
  let previousEnd = null;
  const projected = rows.map((row, index) => {
    let projectedStart = row.plannedStart;
    let projectedDuration = row.duration;
    let overlapMinutes = 0;
    if (index === injectIndex) {
      if (effectType === 'start-delay') projectedStart += delayMinutes;
      else projectedDuration += delayMinutes;
      if (strategy === 'recover') projectedDuration = Math.max(1, projectedDuration - recoveryMinutes);
    } else if (index > injectIndex) {
      if (strategy === 'hold') {
        overlapMinutes = Math.max(0, (previousEnd ?? row.plannedStart) - row.plannedStart);
      } else {
        projectedStart = Math.max(row.plannedStart, previousEnd ?? row.plannedStart);
      }
    }
    const projectedEnd = projectedStart + projectedDuration;
    previousEnd = projectedEnd;
    const shiftMinutes = Math.max(0, projectedStart - row.plannedStart);
    const durationDelta = projectedDuration - row.duration;
    const status = overlapMinutes > 0 ? 'collision' : index === injectIndex ? 'changed' : shiftMinutes > 0 ? 'delayed' : 'on-time';
    return {
      ...row,
      projectedStart,
      projectedDuration,
      projectedEnd,
      shiftMinutes,
      durationDelta,
      overlapMinutes,
      status,
      plannedTime: formatClock(row.plannedStart),
      projectedTime: formatClock(projectedStart),
    };
  });
  const affected = projected.filter((row) => row.status !== 'on-time');
  const finalBaselineEnd = rows.at(-1).plannedStart + rows.at(-1).duration;
  const finalProjectedEnd = projected.at(-1).projectedEnd;
  const missingDurationCount = rows.filter((row) => row.durationBasis !== '材料时长').length;
  const dimensions = (Array.isArray(project?.dimensions) ? project.dimensions : []).filter((dimension) => dimension.id !== 'people').map((dimension) => ({
    id: dimension.id,
    label: dimension.label,
    atChange: dimension.cells?.[injectIndex] || '待确认',
    downstream: [...new Set((dimension.cells || []).slice(injectIndex + 1).filter((value) => value && !['待确认', '—'].includes(value)))].slice(0, 3),
  })).filter((dimension) => dimension.atChange !== '待确认' || dimension.downstream.length);
  const run = {
    id: options.id || `simulation-${scenario.id}-${momentId}-${strategy}`.replace(/[^a-zA-Z0-9\-_]/g, '-').slice(0, 120),
    scenarioId: scenario.id,
    riskId: scenario.riskId,
    momentId,
    title: scenario.title,
    category: scenario.category,
    evidence: scenario.evidence,
    strategy,
    strategyLabel: strategyLabel(strategy),
    effectType,
    effectLabel: scenario.effectLabel || effectLabel(effectType),
    delayMinutes,
    recoveryMinutes: strategy === 'recover' ? recoveryMinutes : 0,
    timeline: projected,
    dimensions,
    summary: {
      affectedCount: affected.length,
      delayedCount: projected.filter((row) => row.shiftMinutes > 0).length,
      collisionCount: projected.filter((row) => row.overlapMinutes > 0).length,
      maxDelay: Math.max(0, ...projected.map((row) => row.shiftMinutes)),
      endDelta: Math.max(0, finalProjectedEnd - finalBaselineEnd),
      missingDurationCount,
    },
    assumptions: [
      scenario.assumption,
      missingDurationCount ? `${missingDurationCount}个环节缺少明确时长，已按相邻时刻或5分钟推演。` : '所有环节均使用材料中的明确时长。',
      strategy === 'hold'
        ? '后续时刻不移动；重叠代表现场需要并行资源、删减内容或重新排时。'
        : strategy === 'recover'
          ? `从变化环节压缩${recoveryMinutes}分钟；剩余影响继续向后传播。`
          : effectType === 'start-delay'
            ? '所有环节时长不变，无法吸收的延迟继续向后传播。'
            : '变化环节的开始时刻不变，增加的占用时间继续向后传播。',
    ],
    createdAt: new Date().toISOString(),
  };
  return run;
}

export function saveSimulationRun(project, run) {
  if (!run) return project;
  const saved = { ...run, timeline: run.timeline.map(({ sourceName, sourceRef, ...row }) => row) };
  const simulations = [...(Array.isArray(project.simulations) ? project.simulations : []).filter((item) => item.id !== saved.id), saved].slice(-12);
  return { ...project, simulations, activeSimulationId: saved.id, updatedAt: new Date().toISOString() };
}

export function buildSimulationCue(project, run) {
  const selected = run || (project.simulations || []).find((item) => item.id === project.activeSimulationId) || project.simulations?.at(-1);
  if (!selected) return null;
  const focusIndex = Math.max(0, (project.moments || []).findIndex((moment) => moment.id === selected.momentId));
  const focus = project.moments?.[focusIndex];
  const affected = (selected.timeline || []).filter((row) => row.status !== 'on-time');
  const firstAfter = affected.find((row) => row.id !== selected.momentId);
  return {
    selected,
    originalLines: [
      { who: '流程', text: `${focus?.time || '原定时刻'}进入${focus?.title || '变化环节'}，后续按原流程执行。` },
      { who: '假设', text: `${selected.title}，${selected.effectLabel || '流程影响'}暂按${selected.delayMinutes}分钟。` },
    ],
    simulatedLines: [
      { who: '总控', text: `${focus?.title || '当前环节'}发生变化，执行“${selected.strategyLabel}”。` },
      { who: '流程', text: firstAfter ? `${firstAfter.title}调整为${firstAfter.projectedTime}${firstAfter.overlapMinutes ? `，与上一环节重叠${firstAfter.overlapMinutes}分钟` : ''}。` : '后续环节当前不受影响。' },
      { who: '联排', text: `从${focus?.title || '变化环节'}开始走到${affected.at(-1)?.title || '活动结束'}，核对实际时刻与模拟差异。` },
    ],
  };
}
