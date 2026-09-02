import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';

globalThis.File = File;

const engine = await import('../src/lib/eventEngine.js');

test('市集材料生成观众维度、六个真实环节和场景相关风险', async () => {
  const materials = await engine.parseFiles(engine.makeSampleFiles('market'));
  const model = engine.inferEventModel(materials);
  assert.equal(model.title, '城市健康生活市集');
  assert.deepEqual(model.moments.map((moment) => moment.title), ['摊主签到', '晨间巡检', '市集开放', '养生工坊', '国风巡游', '闭市清场']);
  assert.ok(model.dimensions.some((dimension) => dimension.id === 'audience'));
  assert.ok(!model.dimensions.some((dimension) => dimension.id === 'channel'));
  assert.ok(model.risks.some((risk) => risk.category === '人员' && risk.title.includes('养生工坊')));
  assert.ok(model.risks.some((risk) => risk.category === '动线'));
});

test('品牌盛典同时生成平台与备援维度并暴露责任和备援阻断项', async () => {
  const project = engine.inferEventModel(await engine.parseFiles(engine.makeSampleFiles('gala')));
  assert.equal(project.title, '东方生活美学品牌盛典');
  assert.equal(project.moments.length, 9);
  assert.ok(project.dimensions.some((dimension) => dimension.id === 'channel'));
  assert.ok(project.dimensions.some((dimension) => dimension.id === 'contingency'));
  assert.ok(project.risks.some((risk) => risk.title.includes('国风大赏主秀') && risk.category === '人员'));
  assert.ok(project.risks.some((risk) => risk.title.includes('开场国风影片') && risk.category === '备援'));
  assert.equal(project.timingChecks.length, 1);
  assert.match(project.timingChecks[0].scriptName, /品牌主题演讲稿/);
});

test('培训材料生成平台维度而不是复用市集结构', async () => {
  const materials = await engine.parseFiles(engine.makeSampleFiles('training'));
  const model = engine.inferEventModel(materials);
  assert.equal(model.title, '区域伙伴产品训练营');
  assert.equal(model.moments.length, 5);
  assert.ok(model.dimensions.some((dimension) => dimension.id === 'channel'));
  assert.ok(!model.dimensions.some((dimension) => dimension.id === 'audience'));
  assert.ok(model.risks.some((risk) => risk.category === '时间'));
  assert.ok(model.risks.some((risk) => risk.category === '人员'));
});

test('真实 XLSX 二进制被解析为发布会结构并保留行号', async () => {
  const file = await engine.makeSpreadsheetSampleFile();
  const materials = await engine.parseFiles([file]);
  const model = engine.inferEventModel(materials);
  assert.equal(model.title, '品牌新品发布会');
  assert.equal(model.date, '2026-12-08');
  assert.equal(model.venue, '城市会展中心');
  assert.equal(model.moments.length, 5);
  assert.ok(model.dimensions.some((dimension) => dimension.id === 'channel'));
  assert.ok(model.risks.every((risk) => risk.evidence.includes('品牌新品发布会流程.xlsx')));
});

test('人工修改环节后，相关风险与压力注入同步重建', async () => {
  const materials = await engine.parseFiles([await engine.makeSpreadsheetSampleFile()]);
  const model = engine.inferEventModel(materials);
  const target = model.moments.find((moment) => moment.title === '新品演示');
  target.title = '产品演示与直播连线';
  const rebuilt = engine.rebuildProject(model);
  assert.ok(rebuilt.injects.some((inject) => inject.title.includes('产品演示与直播连线')));
  assert.ok(rebuilt.risks.some((risk) => risk.title.includes('产品演示与直播连线')));
});

test('公开活动结构样本覆盖科技、美妆、伙伴大会和多城健康活动', async () => {
  const expected = {
    launch: ['备援', '合规'],
    beauty: ['库存'],
    convention: ['人员', '合规'],
    roadshow: ['合规', '库存'],
  };
  for (const [kind, categories] of Object.entries(expected)) {
    const project = engine.inferEventModel(await engine.parseFiles(engine.makeSampleFiles(kind)));
    assert.ok(project.moments.length >= 6, `${kind} should expose a usable rundown`);
    assert.ok(project.dimensions.length >= 5, `${kind} should build event-specific dimensions`);
    categories.forEach((category) => assert.ok(project.risks.some((risk) => risk.category === category), `${kind} should trigger ${category}`));
    assert.ok(project.risks.every((risk) => risk.evidence && risk.rerun && risk.owner));
  }
});

test('真正可并行的同一时刻分会场不被误判为时间冲突', async () => {
  const file = new File([`活动名称：分论坛测试\n时间,环节,时长,负责人,会场\n10:00,论坛A,60分钟,负责人A,A厅\n10:00,论坛B,60分钟,负责人B,B厅`], 'parallel.csv', { type: 'text/csv' });
  const project = engine.inferEventModel(await engine.parseFiles([file]));
  assert.ok(!project.risks.some((risk) => risk.category === '冲突'));
});

test('同场地或同负责人发生重叠时生成可追溯冲突', async () => {
  const file = new File([`活动名称：冲突测试\n时间,环节,时长,负责人,会场\n10:00,主旨演讲,40分钟,总控,主会场\n10:20,颁奖仪式,30分钟,总控,主会场`], 'overlap.csv', { type: 'text/csv' });
  const project = engine.inferEventModel(await engine.parseFiles([file]));
  assert.ok(project.risks.some((risk) => risk.category === '冲突' && risk.evidence.includes('overlap.csv')));
});

test('非结构性确认不会让已经记录的演练场景失联', async () => {
  const original = engine.inferEventModel(await engine.parseFiles(engine.makeSampleFiles('gala')));
  const injectId = original.injects[0].id;
  const rebuilt = engine.rebuildProject({ ...original, venue: 'A馆主会场' });
  assert.equal(rebuilt.injects[0].id, injectId);
  assert.equal(rebuilt.injects[0].riskId, original.injects[0].riskId);
});

test('两份流程材料对同一环节给出不同时间、时长或负责人时生成精确版本冲突', async () => {
  const project = engine.inferEventModel(await engine.parseFiles(engine.makeSampleFiles('launch')));
  assert.ok(project.compileFindings.length >= 3);
  const timingConflict = project.compileFindings.find((finding) => finding.momentTitle === '品牌主题演讲' && finding.field === 'duration');
  assert.ok(timingConflict);
  assert.match(timingConflict.evidence, /智能生活新品发布会\.csv/);
  assert.match(timingConflict.evidence, /发布会执行Cue表\.csv/);
  assert.ok(project.risks.some((risk) => risk.category === '版本冲突' && risk.compileFindingId === timingConflict.id));
  assert.equal(project.moments.filter((moment) => moment.title === '品牌主题演讲').length, 1, 'conflicting versions should not create duplicate timeline moments');
});
