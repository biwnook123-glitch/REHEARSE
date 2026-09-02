import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('operational workspace contains no product pitch or quiz copy', () => {
  const prohibited = [
    '现在使用它的理由',
    '别把关键决定留到现场',
    'REHEARSE 不替代流程表',
    '核心闭环',
    '这一轮只做四件事',
    '给出一个真实突发问题，逼出',
    '适合现在使用',
  ];

  prohibited.forEach((phrase) => assert.equal(appSource.includes(phrase), false, `不应在产品界面出现：${phrase}`));
});

test('primary navigation stays task-oriented', () => {
  ['流程模拟', '材料检查', '联排与校时', '验证记录'].forEach((label) => {
    assert.equal(appSource.includes(label), true, `缺少操作入口：${label}`);
  });
});

test('primary simulation journey does not introduce a second responsibility system', () => {
  ['独立复核人', '必须是另一位成员', '记录执行人、复核人'].forEach((phrase) => {
    assert.equal(appSource.includes(phrase), false, `不应要求活动团队重复分工：${phrase}`);
  });
});

test('interactive state is exposed and empty material submission is disabled', () => {
  assert.equal(appSource.includes('aria-pressed={strategy === value}'), true);
  assert.equal(appSource.includes('aria-live="polite"'), true);
  assert.equal(appSource.includes("disabled={!files.length || status !== 'idle'}"), true);
});

test('people differences remain reference-only while flow differences drive simulation', () => {
  assert.equal(appSource.includes("finding.field !== 'people'"), true);
  assert.equal(appSource.includes('不阻断流程模拟'), true);
  assert.equal(appSource.includes('改用 {source.sourceName}'), true);
});

test('the product describes time propagation honestly', () => {
  assert.equal(appSource.includes('查看时间如何传播，并同时核对'), true);
  assert.equal(appSource.includes('沿时间、空间、设备和内容继续传播'), false);
});
