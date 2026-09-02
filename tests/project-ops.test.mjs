import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeScriptTiming,
  adoptCompileValue,
  assessMaterialNeeds,
  buildBriefMarkdown,
  buildCueRehearsal,
  calculateReadiness,
  loadWorkspace,
  mergeProjectAnalysis,
  normalizeProject,
  parseProjectExport,
  recordDecision,
  recordRerun,
  reopenRisk,
  reviseCompileResolution,
  saveWorkspace,
  serializeProject,
  synchronizeTimingChecks,
  timingPortfolio,
  upsertProject,
  upsertTimingCheck,
} from '../src/lib/projectOps.js';

function project(overrides = {}) {
  return {
    id: 'project-1', title: '测试发布会', date: '2026-10-01', venue: 'A厅', confidence: 80,
    materials: [{ id: 'source-1', name: '流程.xlsx', type: '表格' }],
    moments: [{ id: 'moment-1', title: '新品演示', time: '14:00', sourceName: '流程.xlsx', sourceRef: '第8行' }],
    dimensions: [],
    risks: [{ id: 'risk-1', level: '高', category: '权限', title: '没有责任人', evidence: '流程.xlsx · 第8行', owner: '总控', deadline: '联排前', rerun: '口头复述', momentId: 'moment-1', closed: false }],
    injects: [{ id: 'inject-1', riskId: 'risk-1', title: '没有责任人', time: '14:00', owner: '总控', rerun: '口头复述', choices: ['指定唯一负责人'] }],
    decisions: [], audio: { risk: [], revised: [] },
    ...overrides,
  };
}

test('workspace saves, restores and keeps the active project', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const projects = [project(), project({ id: 'project-2', title: '培训会' })];
  assert.equal(saveWorkspace(projects, 'project-2', storage), true);
  const restored = loadWorkspace(storage);
  assert.equal(restored.activeId, 'project-2');
  assert.equal(restored.projects.length, 2);
  assert.deepEqual(restored.projects[0].decisions, []);
});

test('project export round-trips without losing decisions', async () => {
  const source = project({ decisions: [{ id: 'decision-1', injectId: 'inject-1', instruction: '切换备援', owner: '项目总控', notify: '主持、技术', rerun: '复跑主备切换' }] });
  const restored = await parseProjectExport(serializeProject(source));
  assert.equal(restored.title, source.title);
  assert.equal(restored.decisions[0].instruction, '切换备援');
});

test('adding materials refreshes the same project without losing still-valid decisions and reruns', () => {
  const current = project({
    risks: [{ ...project().risks[0], closed: true, closedAt: '2026-09-02T10:00:00.000Z' }],
    decisions: [{ id: 'decision-1', injectId: 'inject-1', instruction: '指定总控接管', owner: '项目总控', notify: '主持、技术' }],
    reruns: [{ id: 'rerun-1', riskId: 'risk-1', performedBy: '执行人', verifiedBy: '复核人', note: '已按口令复跑' }],
  });
  const analyzed = project({
    id: 'temporary-project',
    materials: [{ id: 'source-1', name: '流程.xlsx', type: '表格' }, { id: 'source-2', name: '技术说明.pdf', type: 'PDF' }],
    moments: [{ ...project().moments[0], id: 'moment-new' }],
    risks: [{ ...project().risks[0], id: 'risk-new', momentId: 'moment-new' }],
    injects: [{ ...project().injects[0], id: 'inject-new', riskId: 'risk-new' }],
  });

  const merged = mergeProjectAnalysis(current, analyzed);
  assert.equal(merged.id, 'project-1');
  assert.equal(merged.materials.length, 2);
  assert.equal(merged.risks[0].id, 'risk-1');
  assert.equal(merged.injects[0].id, 'inject-1');
  assert.equal(merged.decisions.length, 1);
  assert.equal(merged.reruns.length, 1);
});

test('project import rejects files that only spoof the format and id', async () => {
  await assert.rejects(
    () => parseProjectExport(JSON.stringify({ format: 'rehearse-project', version: 1, project: { id: 'fake' } })),
    /不是有效的 REHEARSE 项目文件/,
  );
});

test('legacy people decisions remain readable without lowering flow-simulation readiness', () => {
  const source = project();
  const first = recordDecision(source, source.injects[0], { instruction: '指定总控接管并同步主持人与技术岗位', owner: '项目总控', notify: '主持、技术', score: 3 });
  const second = recordDecision(first, source.injects[0], { instruction: '切换备援并在30秒后复核', owner: '项目总控', notify: '全体岗位', score: 3 });
  assert.equal(second.decisions.length, 1);
  assert.equal(second.decisions[0].notify, '全体岗位');
  assert.equal(calculateReadiness(second).simulationCoverage, 100);
  assert.ok(calculateReadiness(second).score >= 80, 'people-only legacy records are not flow blockers');
});

test('brief contains evidence, simulation results and rerun actions', () => {
  const source = project({
    risks: [{ id: 'risk-device', level: '高', category: '设备', title: '主播放机没有备用路径', evidence: '流程.xlsx · 第8行', owner: '技术统筹', deadline: '联排前', rerun: '断开主播放机后计时恢复', momentId: 'moment-1', closed: false }],
    simulations: [{ id: 'simulation-1', riskId: 'risk-device', title: '主播放机中断', strategy: 'cascade', strategyLabel: '顺延后续环节', delayMinutes: 6, evidence: '流程.xlsx · 第8行', summary: { affectedCount: 3, maxDelay: 6, collisionCount: 0 } }],
  });
  const brief = buildBriefMarkdown(source);
  assert.match(brief, /流程\.xlsx · 第8行/);
  assert.match(brief, /主播放机中断/);
  assert.match(brief, /3个环节/);
  assert.match(brief, /断开主播放机后计时恢复/);
  assert.doesNotMatch(brief, /\d+\/100/);
});

test('cue rehearsal follows the selected risk and uses the recorded decision', () => {
  const base = project({
    moments: [
      { id: 'moment-0', title: '嘉宾签到', time: '13:30', sourceName: '流程.xlsx', sourceRef: '第7行' },
      { id: 'moment-1', title: '新品演示', time: '14:00', sourceName: '流程.xlsx', sourceRef: '第8行' },
      { id: 'moment-2', title: '媒体问答', time: '14:20', sourceName: '流程.xlsx', sourceRef: '第9行' },
    ],
    injects: [{ id: 'inject-1', riskId: 'risk-1', title: '没有责任人', time: '14:00', owner: '总控', rerun: '口头复述', choices: [{ label: '由总控接管' }] }],
  });
  const decided = recordDecision(base, base.injects[0], { instruction: '暂停演示并切换到已审核影片', owner: '项目总控', notify: '主持、视频、直播', score: 3 });
  const script = buildCueRehearsal(decided, 'inject-1');
  assert.equal(script.focus.title, '新品演示');
  assert.equal(script.next.title, '媒体问答');
  assert.match(script.revisedLines[0].text, /暂停演示并切换到已审核影片/);
  assert.match(script.revisedLines[1].text, /主持、视频、直播/);
});

test('upsert updates one project without duplicating it', () => {
  const result = upsertProject([project()], project({ title: '更新后的名称' }));
  assert.equal(result.length, 1);
  assert.equal(result[0].title, '更新后的名称');
});

test('readiness never claims a perfect event', () => {
  const ready = project({
    confidence: 100,
    risks: project().risks.map((risk) => ({ ...risk, closed: true })),
    decisions: [{ id: 'decision-1', injectId: 'inject-1', instruction: '已验证', owner: '总控', notify: '全体', rerun: '通过' }],
    simulations: [{ id: 'simulation-1', riskId: 'risk-1' }],
  });
  assert.equal(calculateReadiness(ready).score, 95);
});

test('material intake tells the team who must provide missing event evidence', () => {
  const source = project({
    moments: [
      { id: 'moment-1', title: '品牌主题演讲', time: '14:00', duration: '3分钟', sourceName: '流程.xlsx', sourceRef: '第8行' },
      { id: 'moment-2', title: '产品体验', time: '14:05', duration: '20分钟', sourceName: '流程.xlsx', sourceRef: '第9行' },
    ],
    dimensions: [{ id: 'people', cells: ['品牌负责人', '体验负责人'] }],
  });
  const needs = assessMaterialNeeds(source);
  const script = needs.find((item) => item.id === 'script');
  assert.equal(script.status, '需补充');
  assert.match(script.owner, /讲者/);
  assert.match(script.substitute, /粘贴/);
  assert.ok(needs.some((item) => item.id === 'approval'));
});

test('script timing compares a real script with the scheduled budget and creates a traceable rehearsal risk', () => {
  const source = project({
    moments: [
      { id: 'moment-1', title: '品牌主题演讲', time: '14:00', duration: '1分钟', sourceName: '流程.xlsx', sourceRef: '第8行' },
      { id: 'moment-2', title: '新品演示', time: '14:01', duration: '10分钟', sourceName: '流程.xlsx', sourceRef: '第9行' },
    ],
    timingChecks: [],
  });
  const checked = upsertTimingCheck(source, { momentId: 'moment-1', scriptName: '演讲稿-v3.docx', text: '这是需要完整讲述的品牌内容。'.repeat(40) });
  const result = analyzeScriptTiming(checked, checked.timingChecks[0]);
  assert.equal(result.status, '预计超时');
  assert.ok(result.spillSeconds > 0);
  assert.ok(checked.risks.some((risk) => risk.timingCheckId && risk.evidence.includes('演讲稿-v3.docx')));
  assert.ok(checked.injects.some((inject) => inject.id === 'inject-timing-moment-1'));
  assert.equal(timingPortfolio(checked).conflicts.length, 1);
});

test('measured rehearsal time takes precedence over text estimation', () => {
  const source = project({
    moments: [{ id: 'moment-1', title: '领导致辞', time: '14:00', duration: '2分钟', sourceName: '流程.xlsx', sourceRef: '第8行' }],
    timingChecks: [],
  });
  const checked = upsertTimingCheck(source, { momentId: 'moment-1', scriptName: '领导致辞.txt', text: '简短内容'.repeat(10), measuredSeconds: 145 });
  const result = analyzeScriptTiming(checked, checked.timingChecks[0]);
  assert.equal(result.basis, '真人计时');
  assert.equal(result.status, '实测超时');
  assert.equal(result.usedSeconds, 145);
  assert.match(buildBriefMarkdown(checked), /实测超时/);
});

test('media measurement keeps its source, fingerprint and editable waveform segments', () => {
  const source = project({
    moments: [{ id: 'moment-1', title: '领导致辞', time: '14:00', duration: '2分钟', sourceName: '流程.xlsx', sourceRef: '第8行' }],
    timingChecks: [],
  });
  const checked = upsertTimingCheck(source, { momentId: 'moment-1', scriptName: '领导致辞-v5', text: '最终讲稿', measuredSeconds: 132, measurementType: 'media', measurementSource: '联排录音.wav', measurementHash: 'abc123', measurementSegments: [{ label: '开场', start: 0, end: 32 }, { label: '核心内容', start: 32, end: 118 }] });
  const result = analyzeScriptTiming(checked, checked.timingChecks[0]);
  assert.equal(result.basis, '音视频实测');
  assert.equal(result.measurementSource, '联排录音.wav');
  assert.equal(result.measurementSegments.length, 2);
  assert.match(buildBriefMarkdown(checked), /联排录音\.wav/);
});

test('an implausibly short measurement is quarantined until the user confirms it is complete', () => {
  const source = project({
    moments: [{ id: 'moment-1', title: '主题演讲', time: '14:00', duration: '16分钟', sourceName: '流程.xlsx', sourceRef: '第8行' }],
    timingChecks: [],
  });
  const suspicious = upsertTimingCheck(source, { momentId: 'moment-1', scriptName: '主题演讲-v5', text: '完整讲稿内容。'.repeat(180), measuredSeconds: 2, measurementType: 'media', measurementSource: '试听片段.mp3' });
  const first = analyzeScriptTiming(suspicious, suspicious.timingChecks[0]);
  assert.equal(first.status, '证据异常');
  assert.equal(first.measurementSuspicious, true);
  assert.equal(first.usedSeconds, first.estimatedSeconds, 'suspicious media must not outrank the text estimate');
  assert.ok(suspicious.risks.some((risk) => risk.timingCheckId));
  assert.equal(timingPortfolio(suspicious).measured.length, 0);

  const confirmed = upsertTimingCheck(suspicious, { ...suspicious.timingChecks[0], measurementConfirmedFull: true });
  const second = analyzeScriptTiming(confirmed, confirmed.timingChecks[0]);
  assert.equal(second.measurementSuspicious, false);
  assert.equal(second.usedSeconds, 2);
  assert.equal(second.status, '实测可控');
});

test('a risk closes after a concrete rerun result is recorded', () => {
  const source = project();
  const incomplete = recordRerun(source, 'risk-1', { confirmedBy: '舞监', note: '' });
  assert.equal(incomplete.risks[0].closed, false);
  const closed = recordRerun(source, 'risk-1', { confirmedBy: '舞监', note: '断开主播放机后，备用机在18秒内恢复画面', evidenceName: '联排视频.mp4', evidenceHash: 'deadbeef' });
  assert.equal(closed.risks[0].closed, true);
  assert.equal(closed.reruns[0].confirmedBy, '舞监');
  assert.match(buildBriefMarkdown(closed), /断开主播放机后/);
  const reopened = reopenRisk(closed, 'risk-1');
  assert.equal(reopened.risks[0].closed, false);
  assert.equal(reopened.reruns.length, 0);
});

test('a rerun can be recorded without creating a second responsibility workflow', () => {
  const source = project();
  const closed = recordRerun(source, source.risks[0].id, { confirmedBy: '现场记录', note: '备用流程已完整走通' });
  assert.equal(closed.risks[0].closed, true);
  assert.equal(closed.reruns[0].confirmedBy, '现场记录');
});

test('a cross-file conflict can be resolved inside the product and keeps the adopted source', () => {
  const source = project({
    compileFindings: [{ id: 'compile-1', category: '版本冲突', momentTitle: '新品演示', field: 'time', fieldLabel: '开始时间', sources: [
      { sourceId: 'a', sourceName: '流程.xlsx', sourceRef: '第8行', value: '14:00' },
      { sourceId: 'b', sourceName: 'Cue.xlsx', sourceRef: '第5行', value: '14:05' },
    ] }],
    risks: [{ ...project().risks[0], id: 'compile-1', compileFindingId: 'compile-1' }],
    injects: [{ ...project().injects[0], riskId: 'compile-1' }],
  });
  const resolved = adoptCompileValue(source, 'compile-1', source.compileFindings[0].sources[1]);
  assert.equal(resolved.moments[0].time, '14:05');
  assert.equal(resolved.compileFindings.length, 0);
  assert.equal(resolved.compileResolutions[0].sourceName, 'Cue.xlsx');
  assert.equal(resolved.compileResolutions[0].sources.length, 2);

  const revised = reviseCompileResolution(resolved, resolved.compileResolutions[0].id, resolved.compileResolutions[0].sources[0]);
  assert.equal(revised.moments[0].time, '14:00');
  assert.equal(revised.compileResolutions[0].sourceName, '流程.xlsx');
});

test('legacy people dimensions are displayed as non-accountability reference data', () => {
  const normalized = normalizeProject(project({ dimensions: [{ id: 'people', label: '人员与权限', cells: ['主持人'] }] }));
  assert.equal(normalized.dimensions[0].label, '参与角色');
});

test('changing the rundown budget recalculates timing risk and deleted moments do not leave dangling checks', () => {
  const source = project({
    moments: [{ id: 'moment-1', title: '领导致辞', time: '14:00', duration: '1分钟', sourceName: '流程.xlsx', sourceRef: '第8行' }],
    timingChecks: [],
  });
  const checked = upsertTimingCheck(source, { momentId: 'moment-1', scriptName: '领导致辞.txt', text: '需要完整讲述的内容。'.repeat(35) });
  assert.ok(checked.risks.some((risk) => risk.timingCheckId));
  const expanded = synchronizeTimingChecks({ ...checked, moments: [{ ...checked.moments[0], duration: '10分钟' }] });
  assert.ok(!expanded.risks.some((risk) => risk.timingCheckId));
  const removed = synchronizeTimingChecks({ ...checked, moments: [] });
  assert.equal(removed.timingChecks.length, 0);
});
