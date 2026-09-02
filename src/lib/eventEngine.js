const TIME_RE = /(?:^|\D)((?:[01]?\d|2[0-3]):[0-5]\d)(?:\D|$)/;
const HEADER_WORDS = {
  time: ['时间', '开始', '时刻', 'time', 'start'],
  title: ['环节', '流程', '内容', '事项', '节目', '议程', 'session', 'activity', 'item'],
  duration: ['时长', '分钟', 'duration', '用时'],
  people: ['人员', '角色', '负责人', '执行人', '嘉宾', '主持', '讲师', '教练', 'owner', 'speaker'],
  space: ['场地', '地点', '区域', '动线', '教室', '会场', '展位', 'location', 'venue', 'room'],
  resource: ['设备', '物料', '文件', '素材', '资料', '技术', 'av', 'device', 'asset'],
  audience: ['观众', '参与者', '学员', '来宾', '人群', 'audience'],
  channel: ['平台', '直播', '推流', '网络', 'channel', 'platform'],
  contingency: ['备援', '备选', '备用', '预案', '应急', 'fallback', 'backup', 'contingency'],
  approval: ['审批', '审核', '合规', '法务', '口径', 'review', 'approval', 'claim'],
  inventory: ['库存', '数量', '份数', '样品', '礼品', '物资', 'inventory', 'stock', 'quantity'],
};

const DIMENSION_META = {
  people: { label: '参与角色', hint: '嘉宾、主持与执行岗位' },
  space: { label: '场地与动线', hint: '位置、容量、移动路径' },
  resource: { label: '设备与内容', hint: '文件、设备、物料、备份' },
  audience: { label: '观众与服务', hint: '参与者、人流、接待' },
  channel: { label: '平台与信号', hint: '直播、网络、分发平台' },
  contingency: { label: '备援与切换', hint: '备用路径、触发条件、切换动作' },
  approval: { label: '审批与口径', hint: '合规、法务、内容审核' },
  inventory: { label: '样品与库存', hint: '数量、领用、补货与回收' },
};

export const SAMPLE_CATALOG = [
  { id: 'gala', label: '品牌盛典', note: '舞台、直播、抽奖与观众入场' },
  { id: 'launch', label: '科技发布会', note: '影片、演示、媒体问答与多平台直播' },
  { id: 'beauty', label: '美妆体验节', note: '分时入场、主理人课堂、样品与VIP权益' },
  { id: 'convention', label: '伙伴大会', note: '主题演讲、产品培训、表彰与集体收尾' },
  { id: 'roadshow', label: '多城消费者活动', note: '主会场直播、分会场互动与健康口径' },
  { id: 'market', label: '户外市集', note: '摊位、天气、人流与巡游' },
  { id: 'training', label: '培训会', note: '讲师、分组、发表与反馈' },
];

function id(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function extOf(name = '') {
  return name.toLowerCase().split('.').pop();
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function findHeaderIndex(headers, words) {
  return headers.findIndex((h) => words.some((word) => clean(h).toLowerCase().includes(word)));
}

function normalizeTime(value) {
  const match = clean(value).match(TIME_RE);
  if (!match) return '';
  const [h, m] = match[1].split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

function fileKind(ext) {
  if (['xlsx', 'xls', 'csv'].includes(ext)) return '表格';
  if (ext === 'docx') return 'Word';
  if (ext === 'pdf') return 'PDF';
  if (['json'].includes(ext)) return 'JSON';
  return '文本';
}

export async function parseMaterial(file) {
  const extension = extOf(file.name);
  const base = { id: id('source'), name: file.name, type: fileKind(extension), size: file.size, rows: [], text: '', warnings: [] };

  if (['xlsx', 'xls', 'csv'].includes(extension)) {
    const XLSX = await import('xlsx');
    const workbook = extension === 'csv'
      ? XLSX.read(await file.text(), { type: 'string', cellDates: true })
      : XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const sheets = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      return { name: sheetName, rows };
    });
    return {
      ...base,
      rows: sheets.flatMap((sheet) => sheet.rows.map((row, index) => ({ sheet: sheet.name, row: index + 1, cells: row.map(clean) }))),
      text: sheets.map((sheet) => `# ${sheet.name}\n${sheet.rows.map((row) => row.map(clean).join('\t')).join('\n')}`).join('\n\n'),
    };
  }

  if (extension === 'docx') {
    const mammothModule = await import('mammoth');
    const mammoth = mammothModule.default || mammothModule;
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { ...base, text: result.value, warnings: result.messages.map((m) => m.message) };
  }

  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(`[第${pageNumber}页] ${content.items.map((item) => item.str).join(' ')}`);
    }
    return { ...base, text: pages.join('\n') };
  }

  const text = await file.text();
  if (extension === 'json') {
    try {
      const json = JSON.parse(text);
      const rows = Array.isArray(json) ? json : (json.moments || json.schedule || json.items || []);
      if (Array.isArray(rows) && rows.length) {
        const headers = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
        base.rows = [{ sheet: 'JSON', row: 1, cells: headers }, ...rows.map((row, index) => ({ sheet: 'JSON', row: index + 2, cells: headers.map((h) => clean(row[h])) }))];
      }
    } catch {
      base.warnings.push('JSON格式无法识别，已按纯文本读取');
    }
  }
  if (['txt', 'md'].includes(extension)) {
    const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
    const headerIndex = lines.findIndex((line) => {
      const score = Object.values(HEADER_WORDS).filter((words) => words.some((word) => line.toLowerCase().includes(word))).length;
      return score >= 2 && /[|｜,，\t]/.test(line);
    });
    if (headerIndex >= 0) {
      const delimiter = lines[headerIndex].includes('|') ? /[|｜]/ : lines[headerIndex].includes('\t') ? /\t/ : /[,，]/;
      base.rows = lines.slice(headerIndex).map((line, index) => ({ sheet: '文本表格', row: headerIndex + index + 1, cells: line.split(delimiter).map(clean) }));
    }
  }
  return { ...base, text };
}

function rowsToMoments(source) {
  if (!source.rows?.length) return [];
  const grouped = Object.groupBy ? Object.groupBy(source.rows, (row) => row.sheet) : source.rows.reduce((acc, row) => { (acc[row.sheet] ||= []).push(row); return acc; }, {});
  const moments = [];

  Object.entries(grouped).forEach(([sheetName, rows]) => {
    const scoredRows = rows.map((row, index) => ({ index, score: Object.values(HEADER_WORDS).filter((words) => row.cells.some((cell) => words.some((word) => clean(cell).toLowerCase().includes(word)))).length }));
    const bestHeader = scoredRows.sort((a, b) => b.score - a.score)[0];
    const headerPosition = bestHeader?.score >= 2 ? bestHeader.index : -1;
    const headerRow = rows[Math.max(headerPosition, 0)];
    const headers = headerRow?.cells || [];
    const indexes = Object.fromEntries(Object.entries(HEADER_WORDS).map(([key, words]) => [key, findHeaderIndex(headers, words)]));
    const dataRows = rows.slice(headerPosition >= 0 ? headerPosition + 1 : 0);

    dataRows.forEach((row) => {
      const fallbackTimeIndex = row.cells.findIndex((cell) => normalizeTime(cell));
      const timeIndex = indexes.time >= 0 ? indexes.time : fallbackTimeIndex;
      const time = normalizeTime(row.cells[timeIndex]);
      if (!time) return;
      const titleIndex = indexes.title >= 0 ? indexes.title : row.cells.findIndex((cell, index) => index !== timeIndex && clean(cell).length > 1);
      const title = clean(row.cells[titleIndex]) || '未命名环节';
      const fields = {};
      Object.entries(indexes).forEach(([key, index]) => { if (index >= 0 && clean(row.cells[index])) fields[key] = clean(row.cells[index]); });
      const custom = headers.map((header, index) => ({ label: clean(header), value: clean(row.cells[index]) })).filter((entry, index) => entry.label && entry.value && !Object.values(indexes).includes(index) && index !== titleIndex && index !== timeIndex).slice(0, 5);
      moments.push({ id: id('moment'), time, title, duration: fields.duration || '', fields, custom, sourceId: source.id, sourceName: source.name, sourceRef: `${sheetName} · 第${row.row}行` });
    });
  });
  return moments;
}

function textToMoments(source) {
  return source.text.split(/\r?\n/).map((line, index) => ({ line: clean(line), index })).filter(({ line }) => normalizeTime(line)).map(({ line, index }) => {
    const time = normalizeTime(line);
    const remainder = clean(line.replace(time, '').replace(/^[-—–|：:、,，\s]+/, ''));
    const parts = remainder.split(/[|｜\t]/).map(clean).filter(Boolean);
    return { id: id('moment'), time, title: parts[0] || '未命名环节', duration: parts.find((part) => /\d+\s*(分钟|min|秒)/i.test(part)) || '', fields: {}, custom: parts.slice(1, 5).map((value, i) => ({ label: `补充${i + 1}`, value })), sourceId: source.id, sourceName: source.name, sourceRef: `第${index + 1}行` };
  });
}

function detectField(text, words) {
  const line = text.split(/\r?\n/).find((candidate) => words.some((word) => candidate.toLowerCase().includes(word)));
  return clean(line?.split(/[：:]/).slice(1).join(':'));
}

function detectFromMaterials(materials, words) {
  for (const material of materials) {
    const row = material.rows?.find((entry) => words.some((word) => clean(entry.cells[0]).toLowerCase().includes(word)) && clean(entry.cells[1]));
    if (row) return clean(row.cells[1]);
  }
  return detectField(materials.map((material) => material.text).join('\n'), words);
}

function deriveTitle(materials) {
  const explicit = detectFromMaterials(materials, ['活动名称', '项目名称', 'event name']);
  if (explicit) return explicit.slice(0, 40);
  const filename = materials[0]?.name?.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  return filename || '未命名活动';
}

function valueFor(moment, key) {
  if (moment.fields[key]) return moment.fields[key];
  const custom = moment.custom.find((entry) => HEADER_WORDS[key]?.some((word) => entry.label.toLowerCase().includes(word)));
  return custom?.value || '';
}

function buildDimensions(moments, combinedText) {
  const hasStructuredFields = moments.some((moment) => Object.keys(moment.fields).length > 0);
  const activeKeys = Object.keys(DIMENSION_META).filter((key) => moments.some((moment) => valueFor(moment, key)) || (!hasStructuredFields && HEADER_WORDS[key].some((word) => combinedText.toLowerCase().includes(word))));
  const unknownLabels = [...new Set(moments.flatMap((moment) => moment.custom.map((entry) => entry.label)))].filter((label) => label && !Object.values(HEADER_WORDS).flat().some((word) => label.toLowerCase().includes(word))).slice(0, 2);
  const standard = activeKeys.slice(0, 8).map((key) => ({ id: key, ...DIMENSION_META[key], source: 'system', cells: moments.map((moment) => valueFor(moment, key) || '待确认') }));
  const custom = unknownLabels.map((label, index) => ({ id: `custom-${index}`, label, hint: '由材料中的自定义列生成', source: 'material', cells: moments.map((moment) => moment.custom.find((entry) => entry.label === label)?.value || '—') }));
  return [...standard, ...custom].slice(0, 8);
}

function minutes(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function durationMinutes(value = '') {
  const text = clean(value).toLowerCase();
  const hour = text.match(/([\d.]+)\s*(?:小时|hour|hr|h)/);
  const minute = text.match(/([\d.]+)\s*(?:分钟|minute|min)/);
  const second = text.match(/([\d.]+)\s*(?:秒|second|sec|s)/);
  return Math.round((Number(hour?.[1] || 0) * 60) + Number(minute?.[1] || 0) + (Number(second?.[1] || 0) / 60));
}

function missing(value = '') {
  return !clean(value) || /^(?:待确认|待定|—|-|无|未提供)$/i.test(clean(value));
}

function uncertain(value = '') {
  return missing(value) || /待确认|未验|待定|无备份|未审核|待审核|未审批|待审批|未锁定|待清点|待补|不足/i.test(clean(value));
}

function normalizedMomentTitle(value = '') {
  return clean(value).toLowerCase().replace(/[\s·｜|：:，,。.!！?？()（）\-_]/g, '');
}

function momentField(moment, field) {
  if (field === 'time' || field === 'duration') return clean(moment[field]);
  return clean(valueFor(moment, field));
}

function consolidateMoments(rawMoments) {
  const byTitle = new Map();
  rawMoments.forEach((moment) => {
    const key = normalizedMomentTitle(moment.title);
    if (!key) return;
    const current = byTitle.get(key) || [];
    current.push(moment);
    byTitle.set(key, current);
  });
  const used = new Set();
  const consolidated = [];
  rawMoments.forEach((moment) => {
    if (used.has(moment.id)) return;
    const group = byTitle.get(normalizedMomentTitle(moment.title)) || [moment];
    const sourceCount = new Set(group.map((item) => item.sourceId)).size;
    if (sourceCount < 2) {
      consolidated.push(moment);
      used.add(moment.id);
      return;
    }
    group.forEach((item) => used.add(item.id));
    const ranked = [...group].sort((a, b) => {
      const score = (item) => ['duration', 'people', 'space', 'resource', 'contingency', 'approval', 'inventory'].filter((field) => momentField(item, field)).length + item.custom.length;
      return score(b) - score(a);
    });
    consolidated.push(ranked[0]);
  });
  return [...new Map(consolidated.map((moment) => [`${moment.time}-${moment.title}-${moment.sourceId}`, moment])).values()].sort((a, b) => minutes(a.time) - minutes(b.time));
}

function deriveCompileFindings(rawMoments) {
  const groups = new Map();
  rawMoments.forEach((moment) => {
    const key = normalizedMomentTitle(moment.title);
    if (!key) return;
    groups.set(key, [...(groups.get(key) || []), moment]);
  });
  const fieldMeta = {
    time: ['开始时间', '总控／流程负责人'],
    duration: ['预算时长', '总控／流程负责人'],
    people: ['执行负责人', '项目负责人'],
    space: ['场地或区域', '场务负责人'],
    resource: ['设备或内容版本', '技术负责人'],
  };
  const findings = [];
  groups.forEach((moments) => {
    if (new Set(moments.map((item) => item.sourceId)).size < 2) return;
    Object.entries(fieldMeta).forEach(([field, [label, owner]]) => {
      const populated = moments.map((moment) => ({ moment, value: momentField(moment, field) })).filter((item) => item.value && !missing(item.value));
      const values = [...new Set(populated.map((item) => item.value.toLowerCase()))];
      if (values.length < 2) return;
      const examples = populated.filter((item, index, all) => all.findIndex((candidate) => candidate.value.toLowerCase() === item.value.toLowerCase()) === index).slice(0, 3);
      findings.push({
        id: `compile-${normalizedMomentTitle(moments[0].title)}-${field}`,
        level: field === 'time' || field === 'people' ? '高' : '中',
        category: '版本冲突',
        momentTitle: moments[0].title,
        field,
        fieldLabel: label,
        title: `“${moments[0].title}”在不同材料中的${label}不一致`,
        evidence: examples.map(({ moment, value }) => `${moment.sourceName} · ${moment.sourceRef}「${value}」`).join(' × '),
        sources: examples.map(({ moment, value }) => ({ sourceId: moment.sourceId, sourceName: moment.sourceName, sourceRef: moment.sourceRef, value })),
        owner,
        deadline: '流程锁版前',
        rerun: '采用唯一版本后重新计算流程，并检查下游时刻与现场条件',
      });
    });
  });
  return findings.slice(0, 12);
}

function deriveRisks(moments, dimensions, compileFindings = []) {
  const risks = [];
  const add = (risk) => risks.push({ id: id('risk'), closed: false, ...risk });
  const people = dimensions.find((d) => d.id === 'people');
  const resources = dimensions.find((d) => d.id === 'resource');
  const spaces = dimensions.find((d) => d.id === 'space');
  const channels = dimensions.find((d) => d.id === 'channel');
  const contingencies = dimensions.find((d) => d.id === 'contingency');
  const approvals = dimensions.find((d) => d.id === 'approval');
  const inventories = dimensions.find((d) => d.id === 'inventory');

  compileFindings.forEach((finding) => add({
    ...finding,
    id: finding.id,
    compileFindingId: finding.id,
    momentId: moments.find((moment) => normalizedMomentTitle(moment.title) === normalizedMomentTitle(finding.momentTitle))?.id,
  }));

  if (!people) add({ level: '中', category: '人员', title: '材料中没有参与角色字段', evidence: moments[0] ? `${moments[0].sourceName} · 全局字段检查` : '全部材料', owner: '现有流程维护人', deadline: '联排前', rerun: '补充嘉宾、主持或执行岗位后重新检查资源占用', momentId: moments[0]?.id });

  moments.forEach((moment, index) => {
    if (!moment.duration) add({ level: '中', category: '时间', title: `“${moment.title}”没有明确时长`, evidence: `${moment.sourceName} · ${moment.sourceRef}`, owner: '流程负责人', deadline: '联排前', rerun: '补时长后重跑时间线', momentId: moment.id });
    if (people && missing(people.cells[index])) add({ level: '中', category: '人员', title: `“${moment.title}”的参与角色尚未写入流程`, evidence: `${moment.sourceName} · ${moment.sourceRef}`, owner: '现有流程维护人', deadline: '联排前', rerun: '补充参与角色后检查是否与相邻环节同时占用', momentId: moment.id });
    const criticalDependency = /影片|视频|演示|直播|连线|抽奖|签到|表演|主秀|颁奖|灯光|音响|投屏|presentation|demo|livestream|video/i.test(moment.title);
    const resourceUncertain = resources?.cells[index] && uncertain(resources.cells[index]);
    const contingencyUncertain = !contingencies || uncertain(contingencies.cells[index]);
    if (resourceUncertain || (criticalDependency && contingencyUncertain)) add({ level: '高', category: '备援', title: `“${moment.title}”的主路径或备援尚未验证`, evidence: `${moment.sourceName} · ${moment.sourceRef}`, owner: '技术负责人', deadline: '联排前', rerun: '主动断开主路径，按口令完成一次切换', momentId: moment.id });

    const needsApproval = /健康|营养|功效|抗衰|美白|产品|新品|旗舰|医学|科研|配方|health|nutrition|claim|product/i.test(moment.title);
    if (needsApproval && (!approvals || uncertain(approvals.cells[index]))) add({ level: '高', category: '合规', title: `“${moment.title}”缺少已确认的对外口径`, evidence: `${moment.sourceName} · ${moment.sourceRef}`, owner: '内容或合规负责人', deadline: '内容锁版前', rerun: '按最终版逐句核对主持、讲师和屏幕文案', momentId: moment.id });

    const needsInventory = /样品|礼品|礼包|体验|试用|赠品|物资发放|swag|sample|kit/i.test(`${moment.title} ${resources?.cells[index] || ''}`);
    if (needsInventory && (!inventories || uncertain(inventories.cells[index]))) add({ level: '中', category: '库存', title: `“${moment.title}”没有可核对的数量或补货责任`, evidence: `${moment.sourceName} · ${moment.sourceRef}`, owner: '物料负责人', deadline: '活动前24h', rerun: '按首小时峰值模拟领用、补货和余量回收', momentId: moment.id });

    const crowdMoment = /入场|签到|散场|离场|巡游|合影|报到|registration|check-in|entry|exit/i.test(moment.title);
    if (crowdMoment && (missing(spaces?.cells[index]) || contingencyUncertain)) add({ level: '中', category: '动线', title: `“${moment.title}”缺少分流或异常人流处置`, evidence: `${moment.sourceName} · ${moment.sourceRef}`, owner: '场务或观众运营', deadline: '场地联排前', rerun: '按高峰到场量走一遍入口、等待区和退出路径', momentId: moment.id });

    if (/直播|连线|线上|livestream|virtual|hybrid/i.test(moment.title) && missing(channels?.cells[index])) add({ level: '高', category: '信号', title: `“${moment.title}”没有明确直播或连线平台`, evidence: `${moment.sourceName} · ${moment.sourceRef}`, owner: '直播负责人', deadline: '技术联排前', rerun: '主平台断联后验证备用链路与观众通知', momentId: moment.id });
    const next = moments[index + 1];
    if (next) {
      const sameOwner = people && !missing(people.cells[index]) && people.cells[index] === people.cells[index + 1];
      const sameSpace = spaces && !missing(spaces.cells[index]) && spaces.cells[index] === spaces.cells[index + 1];
      const relationUnknown = !spaces || !people || missing(spaces.cells[index]) || missing(spaces.cells[index + 1]) || missing(people.cells[index]) || missing(people.cells[index + 1]);
      const end = minutes(moment.time) + durationMinutes(moment.duration);
      const overlaps = durationMinutes(moment.duration) > 0 && end > minutes(next.time);
      const sameStart = minutes(next.time) === minutes(moment.time);
      if ((sameStart || overlaps) && (sameOwner || sameSpace || relationUnknown)) add({ level: '高', category: '冲突', title: `${moment.time}起“${moment.title}”与“${next.title}”存在资源冲突`, evidence: `${moment.sourceName} × ${next.sourceName}`, owner: '总控', deadline: '流程锁版前', rerun: '确认并行资源或重排后完整走台', momentId: moment.id });
    }
  });
  return risks.slice(0, 16);
}

function deriveInjects(risks, moments) {
  const selected = risks.slice(0, 4);
  const fallbackMoment = moments[Math.min(1, moments.length - 1)] || { time: '待定', title: '关键环节' };
  if (!selected.length) selected.push({ category: '压力', level: '中', title: `${fallbackMoment.title}前一位关键人员临时缺席`, owner: '项目负责人', momentId: fallbackMoment.id });
  return selected.map((risk, index) => {
    const moment = moments.find((m) => m.id === risk.momentId) || fallbackMoment;
    const templates = {
      权限: [`指定唯一放行人，并广播给受影响岗位`, `指定替补岗位和接管时刻`, `明确原负责人失联后的升级路径`],
      时间: [`给出新的结束时刻，并同步后续岗位`, `锁定必须保留的环节和可压缩时长`, `设定超时后的自动切换动作`],
      备援: [`切入已验证备援，并用短口令完成交接`, `指定主路径恢复的止损时刻`, `同步主持、技术、直播与场务的下一动作`],
      冲突: [`明确主次顺序与唯一放行人`, `拆分场地、人员或设备后确认可并行`, `重排并给出受影响环节的新时刻`],
      版本冲突: [`确认唯一有效版本，并通知所有材料维护人`, `由字段责任人标记最终值与生效时刻`, `废止旧版本后重新编译全部材料`],
      合规: [`立即切换到已审核版本并停止现场发挥`, `指定口径放行人和可引用证据`, `同步主持、讲师、屏幕与直播字幕`],
      库存: [`按峰值核对余量并指定补货人`, `限定每场发放量并设置缺货提示`, `确认剩余物料的回收与交接`],
      动线: [`启用分流入口并指定现场引导人`, `打开等待区并广播新的进入路径`, `暂停放行直到出口与应急通道恢复`],
      信号: [`切换备用链路并同步线上观众`, `保留本地录制并指定恢复播出时刻`, `指定直播中断期间的现场垫片与口令`],
      交接: [`明确上一环节结束口令和下一岗位接管动作`, `给出切换倒计时并确认所有岗位回令`, `锁定超时后的备选顺序`],
      压力: [`指定替补并重述下一条指令`, `明确止损时刻和升级路径`, `同步所有受影响岗位`],
    };
    const choices = templates[risk.category] || templates.压力;
    return {
      id: id('inject'),
      riskId: risk.id,
      title: risk.title,
      tag: risk.category,
      severity: risk.level,
      time: moment.time,
      evidence: risk.evidence || `${moment.sourceName} · ${moment.sourceRef}`,
      owner: risk.owner || '项目负责人',
      rerun: risk.rerun || '重新走台',
      prompt: `当前环节：${moment.title}。记录处理动作、放行人和需要通知的岗位。`,
      choices: choices.map((label) => ({ label, impact: [`责任人：${risk.owner}`, '同步受影响岗位', `复测：${risk.rerun || '重新走台'}`] })),
    };
  });
}

function deriveAudio(moments, risks) {
  const focus = moments.find((moment) => moment.id === risks[0]?.momentId) || moments[0] || { time: '待定', title: '关键环节' };
  const next = moments[moments.indexOf(focus) + 1] || moments[0] || focus;
  return {
    focusId: focus.id,
    risk: [
      { who: '主持', text: `接下来原定进入${focus.title}，请大家稍作等待，现场还在确认。` },
      { who: '总控', text: `相关负责人暂未回复，请继续垫场。` },
      { who: '主持', text: `我们可以先聊一聊今天活动的背景。` },
    ],
    revised: [
      { who: '总控', text: `${focus.time}切换：${focus.title}暂缓，执行已确认备援。` },
      { who: '主持', text: `现场进行一项流程切换，请大家把注意力留在舞台。` },
      { who: '主持', text: `接下来直接进入${next.title}。` },
    ],
  };
}

function deriveImportedTimingChecks(materials, moments) {
  const speechMoments = moments.filter((moment) => /演讲|致辞|分享|主持|串场|讲解|发布|宣讲|培训|presentation|speech|keynote/i.test(moment.title));
  if (!speechMoments.length) return [];
  return materials
    .filter((material) => /讲稿|主持稿|串词|台词|提词稿|speech|script/i.test(material.name) && clean(material.text).length >= 80)
    .map((material, index) => {
      const matched = speechMoments.find((moment) => {
        const keywords = clean(moment.title).split(/[与和·｜|\s]/).filter((word) => word.length >= 2);
        return keywords.some((word) => material.name.includes(word) || material.text.slice(0, 300).includes(word));
      }) || speechMoments[Math.min(index, speechMoments.length - 1)];
      return {
        id: `timing-imported-${material.id}`,
        momentId: matched.id,
        scriptName: material.name,
        text: material.text,
        rate: 230,
        measuredSeconds: 0,
        sourceId: material.id,
        sourceType: 'imported',
      };
    });
}

export function inferEventModel(materials, overrides = {}) {
  const combinedText = materials.map((m) => m.text).join('\n');
  const rawMoments = materials.flatMap((source) => source.rows?.length ? rowsToMoments(source) : textToMoments(source));
  const compileFindings = deriveCompileFindings(rawMoments);
  const moments = consolidateMoments(rawMoments).slice(0, 16);
  const dimensions = buildDimensions(moments, combinedText);
  const risks = deriveRisks(moments, dimensions, compileFindings);
  const injects = deriveInjects(risks, moments);
  const audio = deriveAudio(moments, risks);
  const timingChecks = deriveImportedTimingChecks(materials, moments);
  const fields = moments.length * Math.max(dimensions.length, 1);
  const confirmed = dimensions.reduce((count, dimension) => count + dimension.cells.filter((cell) => !['待确认', '—'].includes(cell)).length, 0);
  return {
    id: id('project'),
    engineVersion: 4,
    title: overrides.title || deriveTitle(materials),
    venue: overrides.venue || detectFromMaterials(materials, ['活动地点', '场地', 'venue']) || '场地待确认',
    date: overrides.date || detectFromMaterials(materials, ['活动日期', '日期', 'date']) || '日期待确认',
    materials,
    moments,
    dimensions,
    risks,
    injects,
    audio,
    decisions: [],
    timingChecks,
    compileFindings,
    compileResolutions: [],
    simulations: [],
    reruns: [],
    confidence: fields ? Math.round((confirmed / fields) * 100) : 0,
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function rebuildProject(project) {
  const previous = new Map((project.risks || []).filter((risk) => !risk.timingCheckId).map((risk) => [`${risk.category}|${risk.title}|${risk.momentId}`, risk]));
  const structuralRisks = deriveRisks(project.moments, project.dimensions, project.compileFindings || []).map((risk) => {
    const match = previous.get(`${risk.category}|${risk.title}|${risk.momentId}`);
    return match ? { ...risk, id: match.id, closed: match.closed, closedAt: match.closedAt || '' } : risk;
  });
  const timingRisks = (project.risks || []).filter((risk) => risk.timingCheckId);
  const risks = [...structuralRisks, ...timingRisks];
  const previousInjects = new Map((project.injects || []).filter((inject) => !String(inject.id).startsWith('inject-timing-')).map((inject) => [inject.riskId || inject.title, inject]));
  const structuralInjects = deriveInjects(structuralRisks, project.moments).map((inject) => {
    const match = previousInjects.get(inject.riskId) || previousInjects.get(inject.title);
    return match ? { ...inject, id: match.id } : inject;
  });
  const timingInjects = (project.injects || []).filter((inject) => String(inject.id).startsWith('inject-timing-'));
  const injects = [...structuralInjects, ...timingInjects];
  const generatedAt = new Date().toISOString();
  return { ...project, engineVersion: 4, risks, injects, audio: deriveAudio(project.moments, risks), decisions: project.decisions || [], timingChecks: project.timingChecks || [], compileFindings: project.compileFindings || [], compileResolutions: project.compileResolutions || [], simulations: project.simulations || [], reruns: project.reruns || [], generatedAt, updatedAt: generatedAt };
}

export async function parseFiles(files) {
  return Promise.all([...files].map(parseMaterial));
}

export function makeSampleFiles(kind = 'market') {
  const samples = {
    gala: [
      new File([`活动名称：东方生活美学品牌盛典
活动日期：2026-10-24
活动地点：城市会展中心 A 馆

时间,环节,时长,负责人,区域,物料,观众,平台,备援
10:00,全场技术联排,90分钟,技术总监,主会场,全量播放清单 / 主备服务器,全体执行岗,现场系统,备用播放机
12:00,嘉宾与演员签到,60分钟,艺统负责人,后台签到区,名单v5,嘉宾与演员,签到小程序,纸质名单
13:30,观众入场,30分钟,观众运营,南北入口,电子票二维码,全体观众,票务系统,人工核验通道
14:00,开场国风影片,5分钟,视频导演,主舞台,开场片v8 / 备机待确认,全场观众,主屏,静态主视觉
14:05,品牌主题演讲,3分钟,品牌负责人,主舞台,演讲稿v11 / 提词器,全场观众,现场扩声,纸质讲稿
14:08,国风大赏主秀,35分钟,,T台与主舞台,音乐总轨 / 灯光Cue,全场观众,舞台系统,—
15:10,互动抽奖,15分钟,主持人,主舞台,抽奖小程序,线上线下观众,直播间,手工抽签
15:30,产品体验与直播连线,25分钟,产品负责人,体验区,演示品 / 直播推流,线上线下观众,视频号,备用网络
16:10,全员合影,15分钟,摄影统筹,主舞台,站位图,嘉宾与观众,现场系统,分批合影`], '东方生活美学品牌盛典.csv', { type: 'text/csv' }),
      new File([`现场备援说明
如主入口拥堵，北侧入口改为只进不出。
主秀演员候场以舞监口令为唯一放行依据。
直播网络异常时切换独立5G聚合链路。
全员合影超过15分钟时改为嘉宾与观众分批拍摄。`], '品牌盛典备援说明.txt', { type: 'text/plain' }),
      new File([`品牌主题演讲稿（联排版）

各位伙伴、各位来宾，下午好。今天我们站在这里，不只是为了看一场秀，也不是为了把传统元素重新摆放一次。我们更想回答一个具体的问题：今天的生活里，东方审美究竟能不能被人自然地穿上、使用、分享，并且愿意带回家。

过去几个月，我们走访了不同城市的消费者、门店伙伴和年轻创作者。有人告诉我们，国风不该只在节日里出现；也有人说，真正打动他的不是一个醒目的符号，而是材质、气味、颜色和礼序共同形成的感受。于是今天的舞台没有把文化做成背景，而是把它拆进每一次出场、每一段音乐和每一件产品的使用动作里。

稍后大家会看到三组不同的生活场景。第一组从日常出发，讲的是我们如何在忙碌中保留一点从容；第二组关注人与人的相遇，讲的是礼物怎样表达心意；第三组回到身体与自然，讲的是健康、美和长期陪伴。它们不是三段孤立的表演，而是同一个品牌主张在不同生活时刻里的回答。

我也想借这个机会谢谢参与筹备的伙伴。有人反复确认每一件服装的细节，有人为了一个灯光转场在凌晨重新走台，也有人把消费者的一句反馈带回团队，推动我们修改已经接近完成的方案。今天呈现在大家面前的，不是某一个人的创意，而是一群人把许多微小问题逐一解决后的结果。

我们相信，真正有生命力的传统，不需要被隔离在展柜里。它应该进入生活，允许被重新理解，也经得起新的使用。接下来，请大家把目光留在舞台，也留意身边伙伴的反应。希望今天结束时，我们带走的不只是一张照片，而是一种可以继续发生在日常里的东方生活方式。

谢谢大家。`], '品牌主题演讲稿-v11.txt', { type: 'text/plain' }),
    ],
    market: [
      new File([`活动名称：城市健康生活市集\n活动日期：2026-10-18\n活动地点：滨江公园\n\n时间,环节,时长,负责人,区域,物料,观众\n09:00,摊主签到,30分钟,招商主管,服务台,签到二维码,摊主\n09:30,晨间巡检,20分钟,运营负责人,全场,巡检表,工作人员\n10:00,市集开放,120分钟,总控,主入口,开场音乐,公众\n12:00,养生工坊,45分钟,,工坊区,手作材料,预约用户\n14:00,国风巡游,30分钟,演艺负责人,主通道,手持音箱,公众\n16:30,闭市清场,30分钟,场务负责人,全场,清场清单,摊主`], '城市健康生活市集.csv', { type: 'text/csv' }),
      new File([`备援说明\n如遇降雨，工坊移至游客中心。\n巡游音箱备用电池待确认。\n主入口拥堵时开放东侧入口。`], '市集备援说明.txt', { type: 'text/plain' }),
    ],
    training: [
      new File([`活动名称：区域伙伴产品训练营\n活动日期：2026-11-06\n活动地点：培训中心 A3\n\n时间|环节|讲师|教室|资料|平台\n08:30|学员签到|班主任|门厅|学员手册|签到小程序\n09:00|产品知识讲解|培训讲师|A3教室|课件v7|投屏系统\n10:20|分组案例演练|各组教练|A3分区|案例卡|计时器\n11:20|成果发表||主讲台|评分表|直播平台\n12:00|结业与反馈|班主任|A3教室|电子问卷|问卷系统`], '区域伙伴训练营.txt', { type: 'text/plain' }),
    ],
    launch: [
      new File([`活动名称：智能生活新品发布会\n活动日期：2026-12-08\n活动地点：品牌体验中心\n\n时间,环节,时长,负责人,区域,设备,平台,备援,审批\n13:30,媒体签到,30分钟,公关负责人,媒体厅,签到平板,签到系统,纸质名单,已审核\n14:00,开场影片,4分钟,视频导演,主会场,主播放机,主屏与直播,静态主视觉,已审核\n14:04,品牌主题演讲,16分钟,品牌负责人,主舞台,提词器,多平台直播,纸质讲稿,已审核\n14:20,旗舰手机现场演示,15分钟,产品经理,演示台,工程机 / 投屏器,多平台直播,备机待确认,演示口径待审核\n14:35,智能家居联动演示,12分钟,生态负责人,体验区,路由器 / 场景设备,多平台直播,,已审核\n14:50,媒体问答,20分钟,主持人,主舞台,手持麦,多平台直播,收集书面问题,口径负责人现场放行`], '智能生活新品发布会.csv', { type: 'text/csv' }),
      new File([`时间,环节,时长,负责人,区域,设备\n14:00,开场影片,4分钟,视频导演,主会场,备用播放机\n14:04,品牌主题演讲,18分钟,市场副总裁,主舞台,提词器\n14:24,旗舰手机现场演示,12分钟,产品经理,演示台,工程机B / 投屏器\n14:38,智能家居联动演示,12分钟,生态负责人,体验区,路由器 / 场景设备\n14:52,媒体问答,20分钟,主持人,主舞台,手持麦`], '发布会执行Cue表.csv', { type: 'text/csv' }),
    ],
    beauty: [
      new File([`活动名称：城市美妆体验节\n活动日期：2026-09-26\n活动地点：创意园区\n\n时间,环节,时长,负责人,区域,设备,观众,平台,备援,库存\n09:00,VIP提前入场,60分钟,会员运营,VIP入口,票务闸机,VIP用户,票务系统,人工核验通道,VIP礼包300份\n10:00,公众分时入场,180分钟,观众运营,东入口,票务闸机,预约用户,票务系统,西入口分流,\n10:20,品牌主理人课堂,40分钟,内容负责人,主舞台,投屏与手持麦,预约用户,现场扩声,备用麦克风,\n11:10,新品试妆体验,90分钟,体验区负责人,体验区A,试用装与镜台,预约用户,排队小程序,增开体验台,样品待清点\n13:30,美妆达人见面会,45分钟,艺人统筹,互动区,签名台,预约用户,现场系统,候补嘉宾,签名卡500份\n15:00,限定礼盒领取,60分钟,物料负责人,礼品区,核销平板,购票用户,会员系统,人工登记,礼盒数量待确认`], '城市美妆体验节.csv', { type: 'text/csv' }),
    ],
    convention: [
      new File([`活动名称：年度伙伴成长大会\n活动日期：2026-11-21\n活动地点：国际会议中心\n\n时间,环节,时长,负责人,会场,资料,观众,备援,审批\n08:30,伙伴报到,60分钟,会务负责人,一层门厅,胸卡与座位表,全国伙伴,分区人工登记,已审核\n09:30,年度主题演讲,35分钟,业务负责人,主会场,提词稿v9,全体参会者,纸质讲稿,已审核\n10:10,产品科研与健康讲解,40分钟,研发讲师,主会场,研究资料与课件,全体参会者,备用课件,口径待审核\n11:00,优秀伙伴故事分享,35分钟,内容导演,主会场,人物短片,全体参会者,主持人访谈提纲,已审核\n14:00,年度表彰典礼,70分钟,荣誉负责人,主会场,奖杯 / 名单 / 音乐Cue,获奖伙伴与观众,电子名单备份,已审核\n15:30,区域行动工作坊,60分钟,区域教练,分会场A/B/C,行动手册,分组伙伴,备用教室,已审核\n17:00,全场合唱与合影,25分钟,,主会场,歌词屏 / 站位图,全体参会者,分区拍摄,已审核`], '年度伙伴成长大会.csv', { type: 'text/csv' }),
    ],
    roadshow: [
      new File([`活动名称：多城健康消费嘉年华\n活动日期：2026-03-15\n活动地点：中山主会场 + 23城分会场\n\n时间,环节,时长,负责人,区域,设备,观众,平台,备援,审批,库存\n09:30,主会场启动仪式,20分钟,品牌负责人,中山主会场,启动装置 / 主屏,媒体与消费者,全国直播,静态启动画面,已审核,\n10:00,23城分会场同步开场,15分钟,区域运营,各城市会场,直播接收端,当地消费者,全国直播,本地主持独立开场,已审核,\n10:20,健康知识科普,35分钟,健康讲师,主舞台,讲师课件,线上线下消费者,全国直播,纸质提纲,口径待确认,\n11:10,产品互动体验,80分钟,体验负责人,体验展区,体验装与说明卡,现场消费者,现场系统,分批预约,已审核,体验装数量待确认\n14:00,消费者权益互动问答,40分钟,客服负责人,主舞台,问题池 / 手持麦,线上线下消费者,全国直播,书面问题收集,法务现场放行,\n16:00,各城市闭场回传,30分钟,区域运营,各城市会场,回传表单,工作人员,协同平台,电话回传,已审核,`], '多城健康消费嘉年华.csv', { type: 'text/csv' }),
    ],
  };
  return samples[kind];
}

export async function makeSpreadsheetSampleFile() {
  const XLSX = await import('xlsx');
  const rows = [
    ['活动名称', '品牌新品发布会'],
    ['活动日期', '2026-12-08'],
    ['活动地点', '城市会展中心'],
    [],
    ['时间', '环节', '时长', '负责人', '会场', '设备', '直播平台'],
    ['13:30', '媒体签到', '30分钟', '公关负责人', '媒体厅', '签到平板', ''],
    ['14:00', '开场影片', '4分钟', '视频导演', '主会场', '主播放机', '视频号'],
    ['14:05', '品牌主题演讲', '18分钟', '品牌负责人', '主舞台', '演讲稿v6', '视频号'],
    ['14:25', '新品演示', '12分钟', '', '演示区', '演示机 / 备份待确认', '视频号'],
    ['14:40', '媒体问答', '20分钟', '主持人', '主舞台', '手持麦03', '视频号'],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Run of Show');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new File([bytes], '品牌新品发布会流程.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function makeInitialProject() {
  const materials = await parseFiles(makeSampleFiles('gala'));
  return inferEventModel(materials);
}
