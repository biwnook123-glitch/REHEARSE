import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScenarioCatalog, buildSimulationCue, saveSimulationRun, simulateEvent } from '../src/lib/simulation.js';

function project() {
  return {
    id: 'p1',
    moments: [
      { id: 'm1', time: '14:00', title: '开场影片', duration: '5分钟', sourceName: '流程.xlsx', sourceRef: '第2行' },
      { id: 'm2', time: '14:05', title: '主题演讲', duration: '10分钟', sourceName: '流程.xlsx', sourceRef: '第3行' },
      { id: 'm3', time: '14:15', title: '产品演示', duration: '8分钟', sourceName: '流程.xlsx', sourceRef: '第4行' },
    ],
    dimensions: [
      { id: 'space', label: '场地', cells: ['主舞台', '主舞台', '演示区'] },
      { id: 'resource', label: '设备与内容', cells: ['开场片v3', '提词器', '演示机'] },
    ],
    risks: [{ id: 'r1', momentId: 'm1', category: '备援', title: '主播放机无法切换', evidence: '流程.xlsx · 第2行', closed: false }],
    simulations: [],
  };
}

test('scenario catalog turns material-backed risks into adjustable simulation inputs', () => {
  const scenarios = buildScenarioCatalog(project());
  assert.equal(scenarios[0].riskId, 'r1');
  assert.equal(scenarios[0].momentId, 'm1');
  assert.ok(!scenarios.some((item) => item.id === 'scenario-custom'), 'material-backed scenarios should be the default when available');
  assert.equal(scenarios[0].recommended, true);
  assert.equal(scenarios[0].effectType, 'interruption');
});

test('a clean project still offers a custom what-if simulation', () => {
  const scenarios = buildScenarioCatalog({ ...project(), risks: [] });
  assert.equal(scenarios[0].id, 'scenario-custom');
});

test('an operational interruption extends the current moment and propagates without moving its start', () => {
  const run = simulateEvent(project(), { scenarioId: 'scenario-r1', delayMinutes: 6, strategy: 'cascade' });
  assert.equal(run.timeline[0].projectedTime, '14:00');
  assert.equal(run.timeline[0].projectedDuration, 11);
  assert.equal(run.timeline[1].projectedTime, '14:11');
  assert.equal(run.timeline[2].projectedTime, '14:21');
  assert.equal(run.summary.affectedCount, 3);
  assert.equal(run.summary.endDelta, 6);
});

test('holding the original clock exposes collisions instead of pretending the delay disappeared', () => {
  const run = simulateEvent(project(), { scenarioId: 'scenario-r1', delayMinutes: 6, strategy: 'hold' });
  assert.equal(run.timeline[1].projectedTime, '14:05');
  assert.equal(run.timeline[1].overlapMinutes, 6);
  assert.ok(run.summary.collisionCount >= 1);
});

test('a material duration conflict extends duration instead of inventing a late start', () => {
  const source = project();
  source.compileFindings = [{ id: 'finding-duration', field: 'duration', sources: [
    { value: '10分钟' }, { value: '18分钟' },
  ] }];
  source.risks = [{ id: 'r-duration', momentId: 'm2', category: '版本冲突', level: '中', title: '主题演讲时长不一致', evidence: '流程.xlsx × 讲稿.docx', compileFindingId: 'finding-duration', closed: false }];
  const scenario = buildScenarioCatalog(source)[0];
  const run = simulateEvent(source, { scenarioId: scenario.id, strategy: 'cascade' });
  assert.equal(scenario.effectType, 'duration-extension');
  assert.equal(run.timeline[1].projectedTime, '14:05');
  assert.equal(run.timeline[1].projectedDuration, 18);
  assert.equal(run.timeline[2].projectedTime, '14:23');
});

test('higher-severity operational scenarios are recommended before minor material differences', () => {
  const source = project();
  source.compileFindings = [{ id: 'finding-time', field: 'time', sources: [{ value: '14:05' }, { value: '14:07' }] }];
  source.risks = [
    { id: 'r-time', momentId: 'm2', category: '版本冲突', level: '中', title: '演讲时刻相差2分钟', evidence: '两份流程', compileFindingId: 'finding-time', closed: false },
    { id: 'r-device', momentId: 'm1', category: '备援', level: '高', title: '主播放机没有备援', evidence: '技术表', closed: false },
  ];
  const scenarios = buildScenarioCatalog(source);
  assert.equal(scenarios[0].riskId, 'r-device');
  assert.equal(scenarios[0].recommended, true);
});

test('saved simulations generate a neutral rehearsal script without assigning blame', () => {
  const run = simulateEvent(project(), { scenarioId: 'scenario-r1', delayMinutes: 6, strategy: 'recover', recoveryMinutes: 4 });
  const saved = saveSimulationRun(project(), run);
  const cue = buildSimulationCue(saved);
  assert.equal(saved.simulations.length, 1);
  assert.match(cue.simulatedLines[0].text, /压缩当前环节/);
  assert.doesNotMatch(JSON.stringify(cue), /追责|责任人|放行人/);
});
