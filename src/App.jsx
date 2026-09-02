import { useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import {
  ArrowRight, Buildings, CaretRight, CheckCircle, ClipboardText, Clock,
  DownloadSimple, File, FileCsv, FileDoc, FilePdf, FileText, FloppyDisk,
  Headphones, Info, LinkSimple, ListChecks, MapTrifold, MicrophoneStage,
  Pause, Play, Plus, Pulse, ShieldWarning, Trash, UploadSimple, Users,
  Warning, X,
} from '@phosphor-icons/react';
import {
  inferEventModel, makeInitialProject, makeSampleFiles, makeSpreadsheetSampleFile, SAMPLE_CATALOG,
  parseFiles, rebuildProject,
} from './lib/eventEngine';
import {
  analyzeScriptTiming, assessMaterialNeeds, buildBriefMarkdown,
  adoptCompileValue, downloadText, loadWorkspace, mergeProjectAnalysis, parseProjectExport, recordRerun, reopenRisk, reviseCompileResolution, safeFilename, saveWorkspace,
  serializeProject, synchronizeTimingChecks, timingPortfolio, upsertProject, upsertTimingCheck,
} from './lib/projectOps';
import { buildScenarioCatalog, buildSimulationCue, saveSimulationRun, simulateEvent } from './lib/simulation';

function AppIcon({ Icon, size = 19 }) { return <Icon size={size} weight="regular" />; }
function StatusPill({ type = 'warn', children }) { return <span className={`status-pill ${type}`}>{children}</span>; }
function flowRisks(project) {
  const peopleFindingIds = new Set((project.compileFindings || []).filter((finding) => finding.field === 'people').map((finding) => finding.id));
  return (project.risks || []).filter((risk) => !['权限', '人员'].includes(risk.category) && !peopleFindingIds.has(risk.compileFindingId));
}

function Sidebar({ view, setView, onNew, project, projects, onSwitch }) {
  const nav = [
    ['simulation', Pulse, '流程模拟'], ['intake', FileText, '材料检查'],
    ['audio', Headphones, '联排与校时'], ['risks', ListChecks, '验证记录'],
  ];
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">R</span><div><strong>REHEARSE</strong><small>活动数字演练室</small></div></div>
    <button className="new-project" onClick={onNew}><Plus size={17} /> <span>新建活动</span></button>
    <label className="project-switcher"><span>当前项目</span><select value={project.id} onChange={(event) => onSwitch(event.target.value)}>{projects.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
    <nav>{nav.map(([key, Icon, label]) => { const active = view === key || (key === 'simulation' && view === 'map'); return <button key={key} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''} onClick={() => setView(key)}><AppIcon Icon={Icon} /><span>{label}</span>{key === 'risks' && <em>{flowRisks(project).filter((risk) => !risk.closed).length}</em>}</button>; })}</nav>
    <div className="sidebar-foot"><span className="pulse-dot" /> 本地处理 · 自动保存<small>{project.materials.length}份材料 · {project.moments.length}个环节</small></div>
  </aside>;
}

function Topbar({ view, project, projects, onSwitch, onNew, onExportBrief, onExportProject, exportStatus }) {
  const labels = { simulation: '流程模拟', intake: '材料检查', map: '依赖地图', audio: '联排与校时', risks: '验证记录' };
  return <header className="topbar">
    <div className="topbar-project"><small>当前项目</small><strong>{project.title}</strong><select className="topbar-project-switcher" aria-label="切换项目" value={project.id} onChange={(event) => onSwitch(event.target.value)}>{projects.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></div>
    <div className="topbar-actions"><span className="save-state"><FloppyDisk size={14} />{exportStatus || '已自动保存'}</span><button className="topbar-new" title="新建活动" onClick={onNew}><Plus size={16} />新建</button><button title="导出可继续编辑的项目文件" onClick={onExportProject}><DownloadSimple size={16} />项目</button><button title="导出给团队执行的开场前清单" onClick={onExportBrief}><ClipboardText size={16} />清单</button><div className="topbar-status"><span>{project.date}</span><span className="divider" /><span className="live-dot" />{labels[view]}</div></div>
  </header>;
}

function PageHead({ eyebrow, title, desc, action }) { return <div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{desc}</p></div>{action}</div>; }

function SimulationView({ project, updateProject, setView, focusRiskId = '' }) {
  const scenarios = useMemo(() => buildScenarioCatalog(project), [project]);
  const initialScenario = scenarios.find((item) => item.riskId === focusRiskId) || scenarios[0];
  const [scenarioId, setScenarioId] = useState(initialScenario?.id || '');
  const [momentId, setMomentId] = useState(initialScenario?.momentId || project.moments[0]?.id || '');
  const [delayMinutes, setDelayMinutes] = useState(initialScenario?.defaultDelay || 5);
  const [strategy, setStrategy] = useState('cascade');
  const [recoveryMinutes, setRecoveryMinutes] = useState(3);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const next = scenarios.find((item) => item.riskId === focusRiskId) || scenarios[0];
    setScenarioId(next?.id || ''); setMomentId(next?.momentId || project.moments[0]?.id || ''); setDelayMinutes(next?.defaultDelay || 5); setStrategy('cascade'); setSaved(false);
  }, [project.id, focusRiskId]);
  const selectedScenario = scenarios.find((item) => item.id === scenarioId) || scenarios[0];
  const run = useMemo(() => simulateEvent(project, { scenarioId, momentId, delayMinutes, strategy, recoveryMinutes }), [project, scenarioId, momentId, delayMinutes, strategy, recoveryMinutes]);
  const chooseScenario = (id) => { const next = scenarios.find((item) => item.id === id); setScenarioId(id); setMomentId(next?.momentId || project.moments[0]?.id || ''); setDelayMinutes(next?.defaultDelay || 5); setSaved(false); };
  const save = () => { if (!run) return; updateProject(saveSimulationRun(project, run)); setSaved(true); };
  if (!run) return <EmptyModel setView={setView} />;
  const affected = run.timeline.filter((row) => row.status !== 'on-time');
  return <div className="view simulation-view">
    <PageHead eyebrow="活动流程模拟" title="如果现场发生变化，后面会怎样？" desc="选择材料中已经暴露的变化，查看时间如何传播，并同时核对受影响环节的场地、设备、内容与备援条件。" action={<button className="secondary" onClick={() => setView('map')}><MapTrifold size={17} />查看活动依赖</button>} />
    <section className="simulation-controls" aria-label="模拟条件">
      <label><span>变化场景</span><select value={scenarioId} onChange={(event) => chooseScenario(event.target.value)}>{scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.recommended ? '推荐｜' : ''}{scenario.category}｜{scenario.title}</option>)}</select></label>
      <label><span>发生环节</span><select value={momentId} onChange={(event) => { setMomentId(event.target.value); setSaved(false); }}>{project.moments.map((moment) => <option key={moment.id} value={moment.id}>{moment.time} · {moment.title}</option>)}</select></label>
      <label className="minute-control"><span>{run.effectLabel}</span><div><input aria-label={`${run.effectLabel}分钟数`} type="number" min="0" max="120" value={delayMinutes} onChange={(event) => { setDelayMinutes(event.target.value); setSaved(false); }} /><b>分钟</b></div></label>
      <div className="strategy-control"><span>应对方式</span><div>{[['cascade', '顺延后续'], ['hold', '守住时刻'], ['recover', '压缩当前']].map(([value, label]) => <button aria-pressed={strategy === value} className={strategy === value ? 'active' : ''} key={value} onClick={() => { setStrategy(value); setSaved(false); }}>{label}</button>)}</div></div>
      {strategy === 'recover' && <label className="minute-control recovery-control"><span>压缩当前环节</span><div><input aria-label="压缩分钟数" type="number" min="0" max="60" value={recoveryMinutes} onChange={(event) => { setRecoveryMinutes(event.target.value); setSaved(false); }} /><b>分钟</b></div></label>}
    </section>
    <section className="simulation-summary">
      <div className="change-stamp"><Warning size={19} weight="fill" /><div><span>注入变化</span><strong>{selectedScenario?.title}</strong><small>{run.evidence}</small></div></div>
      <div><strong>{run.summary.affectedCount}</strong><span>个环节受影响</span></div><div><strong>{run.summary.maxDelay}</strong><span>分钟最大延迟</span></div><div><strong>{run.summary.collisionCount}</strong><span>处时间重叠</span></div><div><strong>{run.summary.endDelta}</strong><span>分钟结束偏移</span></div>
    </section>
    <div className="simulation-savebar"><div aria-live="polite"><strong>{saved ? '方案已保存，可进入联排' : '这个结果值得保留吗？'}</strong><span>{saved ? '联排页会按这组时刻与口令继续。' : '保存后才会进入联排与校时，并随项目保留。'}</span></div><button className="primary" onClick={save}>{saved ? <><CheckCircle size={17} weight="fill" />已保存</> : <><FloppyDisk size={17} />保存为联排方案</>}</button></div>
    <div className="simulation-layout"><section className="timeline-simulator">
      <div className="simulation-section-head"><div><span className="eyebrow">传播结果</span><h2>原计划与模拟时刻</h2></div><div className="timeline-legend"><span><i className="planned" />原计划</span><span><i className="projected" />模拟后</span></div></div>
      <div className="simulation-rail">{run.timeline.map((row, index) => <article key={row.id} className={`${row.status} ${row.id === run.momentId ? 'injected' : ''}`}><div className="rail-index">{String(index + 1).padStart(2, '0')}</div><div className="rail-times"><time>{row.plannedTime}</time><ArrowRight size={14} /><time>{row.projectedTime}</time></div><div className="rail-content"><strong>{row.title}</strong><small>{row.projectedDuration}分钟 · {row.durationBasis}{row.durationDelta ? `（原${row.duration}分钟）` : ''}</small></div><div className="rail-result">{row.overlapMinutes > 0 ? <StatusPill type="risk">重叠 {row.overlapMinutes}分</StatusPill> : row.durationDelta > 0 ? <StatusPill type="risk">延长 {row.durationDelta}分</StatusPill> : row.durationDelta < 0 ? <StatusPill type="warn">压缩 {Math.abs(row.durationDelta)}分</StatusPill> : row.shiftMinutes > 0 ? <StatusPill type={row.id === run.momentId ? 'risk' : 'warn'}>延后 {row.shiftMinutes}分</StatusPill> : <StatusPill type="safe">原时刻</StatusPill>}</div></article>)}</div>
    </section><aside className="simulation-inspector"><span className="eyebrow">影响解释</span><h2>{run.strategyLabel}</h2><p className="simulation-outcome">{affected.length ? `变化从“${affected[0].title}”开始，传播到“${affected.at(-1).title}”。` : '当前设置没有改变后续时刻。'}</p><h3>当前环节条件</h3><div className="dimension-impact-list">{run.dimensions.slice(0, 6).map((dimension) => <div key={dimension.id}><span>{dimension.label}</span><strong>{dimension.atChange}</strong>{dimension.downstream.length > 0 && <small>后续：{dimension.downstream.join('、')}</small>}</div>)}</div><h3>本次假设</h3><ul className="assumption-list">{run.assumptions.map((item) => <li key={item}>{item}</li>)}</ul><div className="simulation-actions"><button className="primary wide" onClick={save}>{saved ? <><CheckCircle size={17} weight="fill" />已保存为联排方案</> : <><FloppyDisk size={17} />保存为联排方案</>}</button><button className="secondary wide" onClick={() => setView('audio')}>进入联排与校时<ArrowRight size={17} /></button></div></aside></div>
  </div>;
}

function iconForMaterial(type) { if (type === '表格') return FileCsv; if (type === 'Word') return FileDoc; if (type === 'PDF') return FilePdf; return FileText; }

function IntakeView({ project, updateProject, setView, onAdd }) {
  const [draft, setDraft] = useState(project);
  useEffect(() => setDraft(project), [project]);
  const save = () => { updateProject(synchronizeTimingChecks(rebuildProject(draft))); setView('simulation'); };
  const editMoment = (id, field, value) => setDraft((current) => ({ ...current, moments: current.moments.map((moment) => moment.id === id ? { ...moment, [field]: value } : moment) }));
  const removeMoment = (id) => setDraft((current) => ({ ...current, moments: current.moments.filter((moment) => moment.id !== id), dimensions: current.dimensions.map((dimension) => ({ ...dimension, cells: dimension.cells.filter((_, index) => current.moments[index].id !== id) })) }));
  const renameDimension = (id, value) => setDraft((current) => ({ ...current, dimensions: current.dimensions.map((dimension) => dimension.id === id ? { ...dimension, label: value } : dimension) }));
  const needs = assessMaterialNeeds(draft);
  const outstandingNeeds = needs.filter((item) => item.status !== '已覆盖');
  const missingCount = outstandingNeeds.length;
  const flowFindings = (draft.compileFindings || []).filter((finding) => finding.field !== 'people');
  const referenceFindings = (draft.compileFindings || []).filter((finding) => finding.field === 'people');
  const flowResolutions = (draft.compileResolutions || []).filter((resolution) => resolution.field !== 'people');
  return <div className="view intake-view">
    <PageHead eyebrow="材料检查" title="材料、环节与字段" desc="查看解析结果，处理跨文件差异，并补充当前活动缺少的材料。" action={<div className="head-actions"><button className="secondary" onClick={() => setView('map')}><MapTrifold size={17} />查看依赖图</button><button className="secondary" onClick={onAdd}><UploadSimple size={17} />添加材料</button></div>} />
    <div className="intake-summary"><div><span className="eyebrow">当前项目</span><strong>{draft.materials.length}</strong><small>份原始材料</small></div><div><strong>{draft.moments.length}</strong><small>个时间环节</small></div><div><strong>{draft.dimensions.length}</strong><small>个检查维度</small></div><div><strong>{missingCount}</strong><small>类材料待补</small></div></div>
    {flowFindings.length > 0 && <section className="compile-panel"><div className="section-head"><div><span className="eyebrow">跨文件差异</span><h2>{flowFindings.length}处差异会改变模拟结果</h2></div><small>采用后立即重算流程，不建立额外审批</small></div><div className="compile-list">{flowFindings.map((finding) => <article key={finding.id}><StatusPill type={finding.level === '高' ? 'risk' : 'warn'}>{finding.fieldLabel}</StatusPill><div><strong>{finding.title}</strong><div className="compile-options">{finding.sources.map((source) => <button key={`${source.sourceId}-${source.sourceRef}`} onClick={() => setDraft(adoptCompileValue(draft, finding.id, source))}><span><LinkSimple size={13} />{source.sourceName} · {source.sourceRef}</span><b>{source.value}</b><em>采用这个值</em></button>)}</div><small>这里只确定本次模拟的事实版本；原文件不会被修改。</small></div></article>)}</div></section>}
    {flowResolutions.length > 0 && <section className="resolution-panel" aria-label="已采用的材料版本"><div className="resolution-heading"><CheckCircle size={18} weight="fill" /><div><strong>已采用 {flowResolutions.length} 个字段版本</strong><span>保存后按这些值重新计算；选错时可直接改用另一份来源。</span></div></div><div className="resolution-list">{flowResolutions.map((resolution) => <article key={resolution.id}><div><span>{resolution.momentTitle} · {resolution.fieldLabel}</span><strong>{resolution.value}</strong><small>{resolution.sourceName} · {resolution.sourceRef}</small></div>{resolution.sources?.length > 1 && <div>{resolution.sources.filter((source) => !(source.sourceId === resolution.sourceId && source.sourceRef === resolution.sourceRef)).map((source) => <button key={`${source.sourceId}-${source.sourceRef}`} onClick={() => setDraft(reviseCompileResolution(draft, resolution.id, source))}>改用 {source.sourceName}：{source.value}</button>)}</div>}</article>)}</div></section>}
    {referenceFindings.length > 0 && <details className="reference-findings"><summary><Users size={16} />{referenceFindings.length}处参与角色信息不一致，仅供回看</summary><p>这类差异不阻断流程模拟，也不要求在这里重新分工。</p>{referenceFindings.map((finding) => <article key={finding.id}><strong>{finding.momentTitle || finding.title}</strong><div>{finding.sources.map((source) => <span key={`${source.sourceId}-${source.sourceRef}`}>{source.sourceName}：{source.value}</span>)}</div></article>)}</details>}
    <section className="material-request-panel"><div className="section-head"><div><span className="eyebrow">待补材料</span><h2>{missingCount ? `${missingCount}类材料需要补充` : '当前材料范围已覆盖'}</h2></div><small>{missingCount ? '可补文件，也可填写最低替代信息' : `${needs.length}类材料已检查`}</small></div>{missingCount ? <div className="material-needs-grid">{outstandingNeeds.map((item) => <article key={item.id}><div><StatusPill type={item.status === '部分覆盖' ? 'warn' : 'risk'}>{item.status}</StatusPill><strong>{item.label}</strong></div><p><Users size={14} />建议来源：{item.owner}</p><b>{item.ask}</b><small>{item.why}</small><em>最低替代信息：{item.substitute}</em></article>)}</div> : <div className="empty-safe material-complete"><CheckCircle size={22} weight="fill" /><span>当前识别出的环节已有对应材料，可继续检查字段和版本差异。</span></div>}</section>
    <div className="intake-layout"><section className="review-panel">
      <div className="review-section"><div className="review-title"><div><span className="eyebrow">活动信息</span><h2>名称、日期与场地</h2></div><StatusPill type="safe">可编辑</StatusPill></div><div className="project-fields"><label>活动名称<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>日期<input value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label><label>场地<input value={draft.venue} onChange={(event) => setDraft({ ...draft, venue: event.target.value })} /></label></div></div>
      <div className="review-section"><div className="review-title"><div><span className="eyebrow">流程环节</span><h2>识别出的时间线</h2></div><small>修改后重新检查时间、资源和备援</small></div><div className="moment-editor">{draft.moments.map((moment) => <div className="moment-edit-row" key={moment.id}><input className="time-input" value={moment.time} onChange={(event) => editMoment(moment.id, 'time', event.target.value)} /><input value={moment.title} onChange={(event) => editMoment(moment.id, 'title', event.target.value)} /><span title={`${moment.sourceName} ${moment.sourceRef}`}><LinkSimple size={14} />{moment.sourceRef}</span><button aria-label={`删除${moment.title}`} onClick={() => removeMoment(moment.id)}><Trash size={16} /></button></div>)}</div></div>
      <div className="review-section"><div className="review-title"><div><span className="eyebrow">检查维度</span><h2>本场活动需要核对的字段</h2></div><small>由材料列名和内容决定</small></div><div className="dimension-editor">{draft.dimensions.map((dimension) => <label key={dimension.id}><input value={dimension.label} onChange={(event) => renameDimension(dimension.id, event.target.value)} /><span>{dimension.source === 'material' ? '材料自定义' : dimension.hint}</span></label>)}</div></div>
      <button className="primary approve-model" onClick={save}>确认并重新检查 <ArrowRight size={18} /></button>
    </section><aside className="material-rail"><span className="eyebrow">来源文件</span><h2>本次检查使用的材料</h2>{draft.materials.map((material) => { const Icon = iconForMaterial(material.type); return <div className="material-card" key={material.id}><AppIcon Icon={Icon} /><div><strong>{material.name}</strong><small>{material.type} · {material.rows.length ? `${material.rows.length}行` : `${Math.max(1, material.text.split('\n').length)}段`}</small></div><CheckCircle size={18} weight="fill" /></div>; })}<div className="privacy-note"><ShieldWarning size={18} /><p><strong>本地处理</strong>原文件不上传；项目文件只有在用户主动导出后才会离开当前浏览器。</p></div></aside></div>
  </div>;
}

function dimensionIcon(id) { if (id === 'people') return Users; if (id === 'space') return MapTrifold; if (id === 'resource') return Buildings; return ClipboardText; }

function MapView({ project, setView, onListen, onSimulate }) {
  const [selectedId, setSelectedId] = useState(project.moments[0]?.id);
  useEffect(() => setSelectedId(project.moments[0]?.id), [project.id]);
  const selectedIndex = Math.max(0, project.moments.findIndex((moment) => moment.id === selectedId));
  const selected = project.moments[selectedIndex] || project.moments[0];
  const relatedRisks = project.risks.filter((risk) => risk.momentId === selected?.id && !risk.closed);
  if (!selected) return <EmptyModel setView={setView} />;
  return <div className="view"><div className="event-focus"><div><span className="event-time">{selected.time}</span><div><h1>{selected.title}</h1><p>{selected.duration ? `时长 ${selected.duration}` : '时长待确认'}　·　来源 {selected.sourceRef}</p></div><StatusPill type={relatedRisks.some((risk) => risk.level === '高') ? 'risk' : 'safe'}>{relatedRisks.length ? `${relatedRisks.length}项未闭合依赖` : '当前无阻断'}</StatusPill></div><div><button className="secondary" onClick={() => setView('intake')}><FileText size={17} />回看材料</button><button className="primary" onClick={() => onSimulate(relatedRisks[0]?.id)}>模拟当前环节 <ArrowRight size={17} /></button></div></div>
    <div className="map-layout dynamic-map-layout"><section className="map-panel"><div className="dependency-map dynamic-map"><div className="timeline-row"><div className="layer-label"><Clock size={19} /><span>时间与环节</span></div><div className="moment-strip dynamic-moments">{project.moments.map((moment) => { const hasRisk = project.risks.some((risk) => risk.momentId === moment.id && !risk.closed); return <button key={moment.id} onClick={() => setSelectedId(moment.id)} className={`${selected.id === moment.id ? 'selected' : ''} ${hasRisk ? 'risk' : ''}`}><time>{moment.time}</time><strong>{moment.title}</strong><small>{moment.duration || '时长待确认'}</small></button>; })}</div></div>{project.dimensions.map((dimension) => { const Icon = dimensionIcon(dimension.id); return <div className="layer-row" key={dimension.id}><div className="layer-label"><AppIcon Icon={Icon} /><span>{dimension.label}</span></div><div className="layer-track dynamic-track">{dimension.cells.map((cell, index) => { const isActive = index === selectedIndex; const isMissing = ['待确认', '—', ''].includes(cell); return <button key={`${dimension.id}-${index}`} onClick={() => setSelectedId(project.moments[index]?.id)} className={`node ${isActive ? 'active-node' : ''}`}><span><strong>{cell}</strong><small>{isMissing ? '需在确认环节补全' : project.moments[index]?.title}</small></span>{(isMissing || (isActive && Boolean(relatedRisks.length))) && <Warning size={15} weight="fill" />}</button>; })}</div></div>; })}</div><div className="simulation-bar"><div><span className="eyebrow">影响范围</span><strong>当前环节关联的场地、设备、内容与其他流程条件</strong></div><button className="primary" onClick={() => onSimulate(relatedRisks[0]?.id)}>注入变化并模拟<ArrowRight size={17} /></button></div></section>
      <aside className="inspector"><div className="inspector-head"><div><span className="eyebrow">当前环节</span><h2>{selected.time} · {selected.title}</h2></div><StatusPill type={relatedRisks.length ? 'risk' : 'safe'}>{relatedRisks.length}项可模拟变化</StatusPill></div><div className="confidence"><div><strong>{project.confidence}%</strong><span>材料字段完整度</span></div><progress aria-label="当前项目材料字段完整度" max="100" value={project.confidence} /><small>{project.dimensions.length}个维度 · {project.materials.length}份来源</small></div><h3>来源</h3><div className="source-list"><span><FileText size={16} />{selected.sourceName}</span><span><LinkSimple size={16} />{selected.sourceRef}</span>{selected.custom.slice(0, 2).map((item) => <span key={item.label}><Info size={16} />{item.label}：{item.value}</span>)}</div><h3>可注入的变化</h3>{relatedRisks.length ? relatedRisks.slice(0, 3).map((risk) => <div className={`dependency-alert ${risk.level === '高' ? '' : 'amber'}`} key={risk.id}><Warning size={18} weight="fill" /><div><strong>{risk.title}</strong><p>{risk.evidence}</p><button onClick={() => onSimulate(risk.id)}>模拟连锁影响<CaretRight size={14} /></button></div></div>) : <div className="empty-safe"><CheckCircle size={20} weight="fill" /><span>当前环节没有结构性缺口</span></div>}<div className="dependency-alert amber"><MicrophoneStage size={18} /><div><strong>时长与联排</strong><p>核对真实排练时长，并把模拟方案完整走一遍。</p><button onClick={onListen}>打开检查<Play size={14} weight="fill" /></button></div></div></aside>
    </div></div>;
}

function EmptyModel({ setView }) { return <div className="view completion"><Warning size={50} /><h1>材料里还没有识别出带时间的环节</h1><p>回到材料模型补充时间和环节，或重新导入一份流程表。</p><button className="primary" onClick={() => setView('intake')}>回到材料模型</button></div>; }

function VoiceCard({ title, label, lines, type }) {
  const [playing, setPlaying] = useState(false); const [activeLine, setActiveLine] = useState(-1); const utterances = useRef([]);
  const stop = () => { speechSynthesis.cancel(); setPlaying(false); setActiveLine(-1); };
  const play = () => {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    utterances.current = lines.map((line, index) => {
      const item = new SpeechSynthesisUtterance(`${line.who}：${line.text}`);
      item.lang = 'zh-CN'; item.rate = 1;
      item.onstart = () => setActiveLine(index);
      item.onend = () => { if (index === lines.length - 1) { setPlaying(false); setActiveLine(-1); } };
      item.onerror = stop;
      return item;
    });
    setPlaying(true); setActiveLine(0); utterances.current.forEach((item) => speechSynthesis.speak(item));
  };
  useEffect(() => () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); }, []);
  const progress = playing && lines.length ? ((activeLine + 1) / lines.length) * 100 : 0;
  return <article className={`audio-card ${type}`}><div className="audio-title"><div><StatusPill type={type === 'risk-audio' ? 'risk' : 'safe'}>{label}</StatusPill><h2>{title}</h2></div><span>口令朗读 · 不代表现场时长</span></div><div className="player"><button onClick={playing ? stop : play} aria-label={playing ? '停止朗读' : '开始朗读'}>{playing ? <Pause size={22} weight="fill" /> : <Play size={22} weight="fill" />}</button><div><div className="progress-line"><span style={{ width: `${progress}%` }} /></div><small>{playing ? `正在朗读第${activeLine + 1}句／共${lines.length}句` : '只用于检查交接口令是否清楚'}</small></div></div><div className="transcript">{lines.map((line, index) => <p key={`${line.who}-${index}`} className={index === activeLine ? 'highlight' : ''}><time>第{index + 1}句</time><span><strong>{line.who}</strong>{line.text}</span></p>)}</div></article>;
}

function formatSeconds(value = 0) {
  const seconds = Math.max(0, Math.round(value));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

async function hashFile(file) {
  if (!globalThis.crypto?.subtle) return '';
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function inspectMediaFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      const seconds = Number.isFinite(media.duration) ? Math.max(1, Math.round(media.duration)) : 0;
      resolve({ seconds, url, kind: file.type.startsWith('video/') ? 'video' : 'audio' });
    };
    media.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取这份音视频的真实时长')); };
    media.src = url;
  });
}

function WaveformEvidence({ file, initialSegments, onChange }) {
  const container = useRef(null);
  const wavesurfer = useRef(null);
  const regions = useRef(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [segments, setSegments] = useState(initialSegments || []);
  useEffect(() => {
    if (!file || !container.current) return undefined;
    const ws = WaveSurfer.create({ container: container.current, height: 92, waveColor: '#8da093', progressColor: '#365944', cursorColor: '#b4493d', barWidth: 2, barGap: 1, normalize: true });
    const plugin = ws.registerPlugin(RegionsPlugin.create());
    wavesurfer.current = ws; regions.current = plugin;
    const sync = () => {
      const next = plugin.getRegions().map((region, index) => ({ id: region.id, label: region.content?.textContent || `分段${index + 1}`, start: Math.round(region.start * 10) / 10, end: Math.round(region.end * 10) / 10 }));
      setSegments(next); onChange(next);
    };
    const unsubscribers = [
      ws.on('ready', (seconds) => { setReady(true); setDuration(seconds); (initialSegments || []).forEach((segment) => plugin.addRegion({ id: segment.id, start: segment.start, end: segment.end, content: segment.label, color: 'rgba(180,73,61,.18)', drag: true, resize: true, contentEditable: true })); }),
      ws.on('play', () => setPlaying(true)), ws.on('pause', () => setPlaying(false)), ws.on('finish', () => setPlaying(false)), ws.on('timeupdate', setCurrent),
      plugin.on('region-created', sync), plugin.on('region-updated', sync), plugin.on('region-removed', sync), plugin.on('region-content-changed', sync),
    ];
    ws.loadBlob(file).catch(() => setReady(false));
    return () => { unsubscribers.forEach((unsubscribe) => unsubscribe()); ws.destroy(); wavesurfer.current = null; regions.current = null; };
  }, [file]);
  const addSegment = () => {
    if (!ready || !regions.current) return;
    const start = Math.min(current, Math.max(0, duration - 1));
    regions.current.addRegion({ start, end: Math.min(duration, start + Math.max(3, Math.min(15, duration / 6))), content: `分段${segments.length + 1}`, color: 'rgba(180,73,61,.18)', drag: true, resize: true, contentEditable: true });
  };
  return <div className="waveform-evidence"><div ref={container} /><div className="waveform-actions"><button className="secondary" onClick={() => wavesurfer.current?.playPause()} disabled={!ready}>{playing ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}{playing ? '暂停' : '播放'}</button><span>{formatSeconds(current)} / {formatSeconds(duration)}</span><button className="secondary" onClick={addSegment} disabled={!ready}>在当前位置添加分段</button></div>{segments.length > 0 && <div className="waveform-segments">{segments.map((segment) => <span key={segment.id}><strong>{segment.label}</strong>{formatSeconds(segment.start)}–{formatSeconds(segment.end)}</span>)}</div>}<small>拖动红色区域校准开始与结束；双击分段名称可编辑。时间点来自原音频波形。</small></div>;
}

function TimingLab({ project, updateProject }) {
  const portfolio = timingPortfolio(project);
  const candidates = portfolio.speechMoments.length ? portfolio.speechMoments : project.moments;
  const [momentId, setMomentId] = useState(project.timingChecks?.[0]?.momentId || candidates[0]?.id || '');
  const stored = project.timingChecks?.find((item) => item.momentId === momentId);
  const [scriptName, setScriptName] = useState(stored?.scriptName || '粘贴讲稿');
  const [text, setText] = useState(stored?.text || '');
  const [measuredSeconds, setMeasuredSeconds] = useState(stored?.measuredSeconds || 0);
  const [measurementType, setMeasurementType] = useState(stored?.measurementType || '');
  const [measurementSource, setMeasurementSource] = useState(stored?.measurementSource || '');
  const [measurementHash, setMeasurementHash] = useState(stored?.measurementHash || '');
  const [measurementSegments, setMeasurementSegments] = useState(stored?.measurementSegments || []);
  const [measurementConfirmedFull, setMeasurementConfirmedFull] = useState(Boolean(stored?.measurementConfirmedFull));
  const [measuredAt, setMeasuredAt] = useState(stored?.measuredAt || '');
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaPreview, setMediaPreview] = useState({ url: '', kind: '' });
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaError, setMediaError] = useState('');
  const startedAt = useRef(0);
  const recorder = useRef(null);
  const stream = useRef(null);
  const chunks = useRef([]);
  useEffect(() => {
    const next = project.timingChecks?.find((item) => item.momentId === momentId);
    setScriptName(next?.scriptName || '粘贴讲稿'); setText(next?.text || ''); setMeasuredSeconds(next?.measuredSeconds || 0); setMeasurementType(next?.measurementType || ''); setMeasurementSource(next?.measurementSource || ''); setMeasurementHash(next?.measurementHash || ''); setMeasurementSegments(next?.measurementSegments || []); setMeasurementConfirmedFull(Boolean(next?.measurementConfirmedFull)); setMeasuredAt(next?.measuredAt || ''); setElapsed(0); setRunning(false); setRecording(false); setMediaError(''); setMediaPreview({ url: '', kind: '' }); setMediaFile(null);
  }, [momentId, project.id]);
  useEffect(() => {
    if (!running && !recording) return undefined;
    const timer = window.setInterval(() => setElapsed(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [running, recording]);
  useEffect(() => () => { if (mediaPreview.url) URL.revokeObjectURL(mediaPreview.url); }, [mediaPreview.url]);
  const preview = analyzeScriptTiming(project, { momentId, scriptName, text, measuredSeconds, measurementType, measurementSource, measurementHash, measurementSegments, measurementConfirmedFull, measuredAt });
  const clearMeasurement = () => { setMeasuredSeconds(0); setMeasurementType(''); setMeasurementSource(''); setMeasurementHash(''); setMeasurementSegments([]); setMeasurementConfirmedFull(false); setMeasuredAt(''); setMediaPreview({ url: '', kind: '' }); setMediaFile(null); };
  const startTimer = () => { clearMeasurement(); setElapsed(0); startedAt.current = Date.now(); setRunning(true); };
  const stopTimer = () => { const seconds = Math.max(1, elapsed); setRunning(false); setMeasuredSeconds(seconds); setMeasurementType('stopwatch'); setMeasurementSource('页面真人跑稿计时'); setMeasuredAt(new Date().toISOString()); };
  const useMedia = async (file, preferredUrl = '') => {
    try {
      setMediaError('正在读取真实时长与文件指纹…');
      const inspected = preferredUrl ? { seconds: Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)), url: preferredUrl, kind: 'audio' } : await inspectMediaFile(file);
      const digest = await hashFile(file);
      setMeasuredSeconds(inspected.seconds); setMeasurementType('media'); setMeasurementSource(file.name); setMeasurementHash(digest); setMeasurementSegments([]); setMeasurementConfirmedFull(false); setMeasuredAt(new Date().toISOString()); setMediaPreview({ url: inspected.url, kind: inspected.kind }); setMediaFile(file); setMediaError('');
    } catch (error) { setMediaError(error.message); }
  };
  const importMedia = async (event) => { const file = event.target.files?.[0]; if (file) await useMedia(file); event.target.value = ''; };
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) { setMediaError('当前浏览器不支持现场录音，请导入手机或会议系统录下的音视频。'); return; }
    try {
      clearMeasurement(); setMediaError(''); chunks.current = [];
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder.current = new MediaRecorder(stream.current);
      recorder.current.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      recorder.current.onstop = async () => {
        const blob = new Blob(chunks.current, { type: recorder.current?.mimeType || 'audio/webm' });
        const file = new File([blob], `现场排练录音-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`, { type: blob.type });
        stream.current?.getTracks().forEach((track) => track.stop()); setRecording(false);
        const url = URL.createObjectURL(blob); await useMedia(file, url);
      };
      setElapsed(0); startedAt.current = Date.now(); recorder.current.start(); setRecording(true);
    } catch { setMediaError('没有取得麦克风权限。可以直接导入手机录音或排练视频，不影响其他功能。'); }
  };
  const stopRecording = () => { if (recorder.current?.state === 'recording') recorder.current.stop(); };
  const save = () => { if (!momentId || (!text.trim() && !measuredSeconds)) return; updateProject(upsertTimingCheck(project, { momentId, scriptName, text, measuredSeconds, measurementType, measurementSource, measurementHash, measurementSegments, measurementConfirmedFull, measuredAt })); };
  if (!candidates.length) return null;
  const statusType = ['实测超时', '预计超时'].includes(preview?.status) ? 'risk' : ['余量过少', '缺少流程时长', '未校验', '证据异常'].includes(preview?.status) ? 'warn' : 'safe';
  const timingVerdict = preview?.status === '证据异常'
    ? <div className="timing-verdict warn evidence-anomaly"><Warning size={18} weight="fill" /><p><strong>这份记录只有 {formatSeconds(preview.measuredSeconds)}，明显短于 {formatSeconds(preview.budgetSeconds)} 的流程预算</strong><span>系统暂不把它当作完整实测，也不会用它覆盖文字估算。请换完整文件，或确认这确实是完整跑稿／完整播放。</span><button className="text-action" onClick={() => setMeasurementConfirmedFull(true)}>确认这是完整跑稿／完整播放</button></p></div>
    : preview?.deltaSeconds > 0
      ? <div className="timing-verdict danger"><Warning size={18} weight="fill" /><p><strong>{preview.basis}超出预算 {formatSeconds(preview.deltaSeconds)}</strong><span>{preview.next ? `如果不删减或改时刻，${preview.next.title}将失去原定交接。` : '需要删减内容或调整流程结束时刻。'}</span></p></div>
      : preview?.status === '余量过少'
        ? <div className="timing-verdict warn"><Warning size={18} weight="fill" /><p><strong>只剩 {formatSeconds(Math.max(0, preview.budgetSeconds - preview.usedSeconds))}，还没计上下台与停顿</strong><span>用最终版本再完整排练一次，并把转场时间一起计入。</span></p></div>
        : <div className="timing-verdict"><CheckCircle size={18} weight="fill" /><p><strong>{preview?.status === '未校验' ? '还没有足够材料判断' : '当前没有挤占流程预算'}</strong><span>{measuredSeconds ? `${preview.basis}已覆盖文字估算。` : '当前仍是文字估算，不能作为现场排期事实。'}</span></p></div>;
  return <section className="timing-lab"><div className="timing-head"><div><span className="eyebrow">内容时长 × 流程预算</span><h2>真实讲完或播放后，会不会挤掉下一环节？</h2><p>文字只作预估。导入排练录音／视频、现场录音或人工计时后，系统才把时长记为真实证据。</p></div><StatusPill type={statusType}>{preview?.status || '未校验'}</StatusPill></div>
    <div className="timing-workbench"><div className="script-editor"><div className="script-fields"><label>对应环节<select value={momentId} onChange={(event) => setMomentId(event.target.value)}>{candidates.map((moment) => <option key={moment.id} value={moment.id}>{moment.time} · {moment.title}</option>)}</select></label><label>内容版本<input value={scriptName} onChange={(event) => setScriptName(event.target.value)} /></label></div><textarea aria-label="讲稿正文" value={text} onChange={(event) => { setText(event.target.value); clearMeasurement(); }} placeholder="可粘贴讲稿、主持串词或提词稿；没有文字稿时，也可只导入排练录音或视频取得真实时长。" />
      <div className="measurement-tools"><div><strong>取得真实时长</strong><small>原音视频不进入项目文件，只保存时长、文件名与 SHA-256 指纹。</small></div><label className="media-upload"><UploadSimple size={16} />导入排练录音／视频<input type="file" accept="audio/*,video/*" onChange={importMedia} /></label><button className="secondary" onClick={recording ? stopRecording : startRecording}>{recording ? <><Pause size={16} weight="fill" />结束现场录音</> : <><MicrophoneStage size={16} />现场录音</>}</button></div>
      {mediaError && <div className={`media-message ${mediaError.startsWith('正在') ? '' : 'error'}`}>{mediaError}</div>}
      {mediaPreview.url && (mediaPreview.kind === 'video' ? <video className="media-preview" controls src={mediaPreview.url} /> : <WaveformEvidence file={mediaFile} initialSegments={measurementSegments} onChange={setMeasurementSegments} />)}
      <div className="script-actions"><button className="secondary" onClick={running ? stopTimer : startTimer} disabled={recording}>{running ? <><Pause size={16} weight="fill" />结束人工计时</> : <><Play size={16} weight="fill" />人工跑稿计时</>}</button><span className={running || recording ? 'running' : ''}>{formatSeconds(running || recording ? elapsed : measuredSeconds)}</span><button className="primary" disabled={(!text.trim() && !measuredSeconds) || running || recording} onClick={save}>保存校时证据并重算</button></div></div>
      <aside className="timing-result" aria-live="polite"><span className="eyebrow">本次核对结果</span><div className="timing-number"><strong>{formatSeconds(preview?.usedSeconds)}</strong><small>{preview?.basis || '未测'}用时</small></div><dl><div><dt>流程预算</dt><dd>{preview?.budgetSeconds ? formatSeconds(preview.budgetSeconds) : '未填写'}</dd></div><div><dt>时长证据</dt><dd>{preview?.measurementSource ? `${preview.measurementSource} · ${formatSeconds(preview.measuredSeconds)}${preview.measurementSuspicious ? '（待确认）' : ''}` : preview?.estimatedSeconds ? '只有文字量' : '尚无'}</dd></div><div><dt>下一环节</dt><dd>{preview?.next ? `${preview.next.time} ${preview.next.title}` : '没有下一环节'}</dd></div><div><dt>挤占时间</dt><dd className={preview?.spillSeconds > 0 ? 'danger' : ''}>{preview?.spillSeconds > 0 ? formatSeconds(preview.spillSeconds) : '未挤占'}</dd></div></dl>{timingVerdict}{measurementHash && <p className="measurement-proof">文件指纹：{measurementHash.slice(0, 16)}… · {measuredAt ? new Date(measuredAt).toLocaleString('zh-CN') : ''}</p>}</aside></div>
  </section>;
}

function AudioView({ project, setView, updateProject }) {
  const fallbackRun = useMemo(() => simulateEvent(project), [project]);
  const runs = project.simulations?.length ? project.simulations : fallbackRun ? [fallbackRun] : [];
  const [runId, setRunId] = useState(project.activeSimulationId || runs.at(-1)?.id);
  useEffect(() => setRunId(project.activeSimulationId || project.simulations?.at(-1)?.id || fallbackRun?.id), [project.id, project.activeSimulationId, project.simulations?.length]);
  const activeRun = runs.find((run) => run.id === runId) || runs.at(-1);
  const script = buildSimulationCue(project, activeRun);
  if (!script) return <EmptyModel setView={setView} />;
  const focus = project.moments.find((moment) => moment.id === script.selected.momentId);
  const affected = script.selected.timeline.filter((row) => row.status !== 'on-time');
  return <div className="view"><PageHead eyebrow="联排与校时" title="把模拟结果真正走一遍" desc="先用真实音视频或人工计时校正时长，再按保存的模拟方案朗读流程口令。" action={<StatusPill type={project.simulations?.length ? 'safe' : 'warn'}>{project.simulations?.length ? `${project.simulations.length}个已保存方案` : '当前为临时模拟'}</StatusPill>} />
    <TimingLab project={project} updateProject={updateProject} />
    <div className="cue-scenarios" aria-label="选择要检查的模拟方案">{runs.map((item, index) => <button key={item.id} className={item.id === activeRun.id ? 'active' : ''} onClick={() => setRunId(item.id)}><span>{String(index + 1).padStart(2, '0')}</span>{item.title}</button>)}</div>
    <div className="audio-grid"><VoiceCard title="原计划" label="基线" type="risk-audio" lines={script.originalLines} /><VoiceCard title={script.selected.strategyLabel} label="模拟方案" type="safe-audio" lines={script.simulatedLines} /></div>
    <div className="audio-findings"><div><span className="eyebrow">本次联排范围</span><h2>{script.selected.title}</h2></div><div className="metric"><strong>{focus?.title || '变化环节'}</strong><span>从这里开始</span></div><div className="metric"><strong>{affected.at(-1)?.title || focus?.title}</strong><span>走到这里结束</span></div><div className="metric"><strong>{script.selected.summary.affectedCount}个环节</strong><span>需要观察时刻</span></div></div>
    {!project.simulations?.length && <div className="closure-note"><Info size={19} /><span>当前展示的是临时模拟；保存一个方案后，联排记录才会随项目保留。</span><button onClick={() => setView('simulation')}>返回流程模拟</button></div>}
  </div>;
}

function RisksView({ project, updateProject, onSimulate }) {
  const visibleRisks = flowRisks(project);
  const [filter, setFilter] = useState('pending');
  const [activeId, setActiveId] = useState(visibleRisks.find((risk) => !risk.closed)?.id || visibleRisks[0]?.id || '');
  const filteredRisks = visibleRisks.filter((risk) => filter === 'all' || (filter === 'closed' ? risk.closed : !risk.closed));
  const active = filteredRisks.find((risk) => risk.id === activeId) || filteredRisks[0];
  const existing = (project.reruns || []).find((rerun) => rerun.riskId === active?.id);
  const [confirmedBy, setConfirmedBy] = useState('');
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState({ name: '', type: '', size: 0, hash: '' });
  const [evidenceStatus, setEvidenceStatus] = useState('');
  useEffect(() => { if (!filteredRisks.some((risk) => risk.id === activeId)) setActiveId(filteredRisks[0]?.id || ''); }, [filter, project.id, visibleRisks.map((risk) => `${risk.id}:${risk.closed}`).join('|')]);
  useEffect(() => { setConfirmedBy(existing?.confirmedBy || existing?.performedBy || ''); setNote(existing?.note || ''); setEvidence({ name: existing?.evidenceName || '', type: existing?.evidenceType || '', size: existing?.evidenceSize || 0, hash: existing?.evidenceHash || '' }); setEvidenceStatus(''); }, [activeId, existing?.id]);
  const selectEvidence = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setEvidenceStatus('正在计算本地文件指纹…');
    const hash = await hashFile(file);
    setEvidence({ name: file.name, type: file.type, size: file.size, hash }); setEvidenceStatus(''); event.target.value = '';
  };
  const submit = () => { if (!active) return; updateProject(recordRerun(project, active.id, { confirmedBy, note, evidenceName: evidence.name, evidenceType: evidence.type, evidenceSize: evidence.size, evidenceHash: evidence.hash })); };
  const closed = visibleRisks.filter((risk) => risk.closed).length;
  const placeholder = active?.timingCheckId
    ? '例如：最终稿完整跑稿12分40秒，含上下台后仍有50秒余量。'
    : /设备|备援|信号/.test(active?.category || '')
      ? '例如：断开主设备后，备用路径在18秒内恢复；后续环节未发生延迟。'
      : /动线|场地/.test(active?.category || '')
        ? '例如：按真实路线走一遍用时2分10秒，转场完成时下一环节尚未开始。'
        : '写下实际怎么走、用了多久、是否影响下一环节，以及与模拟不同的地方。';
  return <div className="view"><PageHead eyebrow="验证记录" title="模拟之后，现场是否真的成立？" desc="记录联排观察结果即可；不在这里重新分工或建立一套责任体系。附件只保存文件名与指纹。" action={<div className="closure-score"><strong>{closed}/{visibleRisks.length}</strong><span>已验证</span></div>} />
    <div className="rerun-layout"><section className="rerun-list"><div className="rerun-filters" aria-label="筛选验证记录">{[['pending', '待验证'], ['closed', '已验证'], ['all', '全部']].map(([value, label]) => <button key={value} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}<span>{value === 'all' ? visibleRisks.length : visibleRisks.filter((risk) => value === 'closed' ? risk.closed : !risk.closed).length}</span></button>)}</div>{filteredRisks.map((risk) => { const proof = (project.reruns || []).find((item) => item.riskId === risk.id); return <button className={`${risk.id === active?.id ? 'active' : ''} ${risk.closed ? 'closed' : ''}`} key={risk.id} onClick={() => setActiveId(risk.id)}><span>{risk.closed ? <CheckCircle size={21} weight="fill" /> : <Warning size={21} weight="fill" />}</span><div><div><StatusPill type={risk.closed ? 'safe' : risk.level === '高' ? 'risk' : 'warn'}>{risk.closed ? '已验证' : '待验证'}</StatusPill><strong>{risk.title}</strong></div><small>{risk.evidence}</small>{proof && <em>{proof.note}</em>}</div><CaretRight size={17} /></button>; })}{!filteredRisks.length && <div className="rerun-empty"><CheckCircle size={24} weight="fill" /><strong>{filter === 'pending' ? '当前没有待验证项' : '这个筛选下还没有记录'}</strong><span>切换上方筛选可查看其他状态。</span></div>}</section>
      {active && <section className="rerun-proof"><span className="eyebrow">验证对象</span><h2>{active.title}</h2><p className="rerun-source"><LinkSimple size={15} />{active.evidence}</p><div className="rerun-instruction"><strong>建议怎么走一遍</strong><span>{active.rerun}</span></div><button className="secondary wide rerun-simulate" onClick={() => onSimulate(active.id)}>先模拟这个变化<ArrowRight size={16} /></button>{existing ? <div className="verified-proof"><CheckCircle size={28} weight="fill" /><div><strong>现场结果已记录</strong><p>{existing.note}</p><dl><div><dt>记录人</dt><dd>{existing.confirmedBy || existing.performedBy || '未填写'}</dd></div><div><dt>记录时间</dt><dd>{new Date(existing.performedAt).toLocaleString('zh-CN')}</dd></div><div><dt>附件</dt><dd>{existing.evidenceName || '未附文件'}{existing.evidenceHash ? ` · ${existing.evidenceHash.slice(0, 12)}…` : ''}</dd></div></dl><button className="secondary" onClick={() => updateProject(reopenRisk(project, active.id))}>现场变化，重新验证</button></div></div> : <div className="proof-form"><label>验证结果<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={placeholder} /></label><label>本次结果由谁记录（可选）<input value={confirmedBy} onChange={(event) => setConfirmedBy(event.target.value)} placeholder="姓名或岗位，仅作记录" /></label><label className="evidence-upload"><UploadSimple size={18} /><span>{evidence.name || '附排练录音、视频、照片或签字记录（可选）'}</span><input type="file" accept="audio/*,video/*,image/*,.pdf" onChange={selectEvidence} /></label>{evidenceStatus && <small>{evidenceStatus}</small>}{evidence.hash && <small>SHA-256：{evidence.hash.slice(0, 20)}…</small>}<button className="primary wide" disabled={!note.trim()} onClick={submit}>保存结果并标记已验证</button></div>}</section>}
    </div><div className="closure-note"><Info size={19} /><span>这里记录的是模拟假设在真实联排中的结果，不判断个人责任。</span></div></div>;
}

function ProjectModal({ mode = 'create', project, close, onCreated }) {
  const [files, setFiles] = useState([]); const [status, setStatus] = useState('idle'); const [error, setError] = useState('');
  const addFiles = (list) => setFiles((current) => [...current, ...[...list].filter((file) => !current.some((item) => item.name === file.name))]);
  const loadSample = async (kind) => { setStatus('loading'); setFiles(kind === 'xlsx' ? [await makeSpreadsheetSampleFile()] : makeSampleFiles(kind)); setError(''); setStatus('idle'); };
  const analyze = async () => { if (!files.length) { setError(mode === 'append' ? '请选择要补充到当前项目的材料' : '请至少添加一份流程、日程、说明材料或 REHEARSE 项目文件'); return; } try { const projectFile = files.find((file) => file.name.endsWith('.rehearse.json')); if (projectFile) { if (mode === 'append') { setError('项目文件不能作为补充材料；请从“新建活动”导入。'); return; } setStatus('modeling'); onCreated(await parseProjectExport(await projectFile.text())); close(); return; } setStatus('parsing'); const materials = await parseFiles(files); setStatus('modeling'); const materialSet = mode === 'append' ? new Map(project.materials.map((material) => [material.name, material])) : new Map(); materials.forEach((material) => materialSet.set(material.name, material)); const model = inferEventModel([...materialSet.values()], mode === 'append' ? { title: project.title, date: project.date, venue: project.venue } : {}); if (!model.moments.length) { setError('没有识别出“时间＋环节”。请补充包含时间和环节的流程材料。'); setStatus('idle'); return; } onCreated(mode === 'append' ? synchronizeTimingChecks(mergeProjectAnalysis(project, model)) : model); close(); } catch (errorValue) { setError(`解析失败：${errorValue.message}`); setStatus('idle'); } };
  const isAppend = mode === 'append';
  return <div className="modal-backdrop"><div className="modal product-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title"><button className="modal-x" aria-label="关闭材料窗口" onClick={close}><X size={20} /></button><span className="eyebrow">{isAppend ? project.title : '新建活动'}</span><h2 id="new-project-title">{isAppend ? '添加材料到当前项目' : '导入活动材料'}</h2><p>{isAppend ? '同名文件将替换当前版本；新增材料会与已有材料一起重新检查。' : '至少选择一份包含时间和环节的流程材料。其他材料可以稍后补充。'}</p><div className="intake-guide"><div><strong>流程材料</strong><span>流程表、日程或 Run of Show</span></div><div><strong>内容材料</strong><span>讲稿、串词或提词稿</span></div><div><strong>技术材料</strong><span>Cue 表、设备、播放与备援说明</span></div><div><strong>协作材料</strong><span>岗位、场地动线、对外口径或库存记录</span></div></div><label className="upload real-upload" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}><UploadSimple size={28} /><input type="file" multiple accept=".xlsx,.xls,.csv,.docx,.pdf,.json,.txt,.md" onChange={(event) => addFiles(event.target.files)} /><span>拖入或选择材料</span><small>XLSX、CSV、DOCX、PDF、JSON、TXT、Markdown</small></label>{!isAppend && <div className="sample-actions"><span>载入示例：</span>{SAMPLE_CATALOG.map((item) => <button title={item.note} key={item.id} onClick={() => loadSample(item.id)}>{item.label}</button>)}<button onClick={() => loadSample('xlsx')}>XLSX示例</button></div>}<div className="selected-files">{files.map((file) => <div key={file.name}><File size={17} /><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))}KB</small><button aria-label={`移除${file.name}`} onClick={() => setFiles(files.filter((item) => item.name !== file.name))}><X size={15} /></button></div>)}</div>{error && <div className="modal-error"><Warning size={16} />{error}</div>}<div className="modal-actions"><button className="secondary" onClick={close}>取消</button><button className="primary" onClick={analyze} disabled={!files.length || status !== 'idle'}>{status === 'loading' ? '正在准备示例…' : status === 'parsing' ? '正在解析材料…' : status === 'modeling' ? '正在重新检查…' : <>{isAppend ? '添加并重新检查' : '检查这些材料'}<ArrowRight size={17} /></>}</button></div></div></div>;
}

export function App() {
  const [workspace, setWorkspace] = useState({ projects: [], activeId: null, ready: false });
  const [view, setView] = useState('simulation'); const [modal, setModal] = useState(''); const [exportStatus, setExportStatus] = useState(''); const [focusRiskId, setFocusRiskId] = useState('');
  const project = useMemo(() => workspace.projects.find((item) => item.id === workspace.activeId) || workspace.projects[0], [workspace]);
  useEffect(() => { const restore = async () => { const saved = loadWorkspace(); if (saved.projects.length) { const projects = await Promise.all(saved.projects.map(async (item) => { if (item.title === '东方生活美学品牌盛典' && !item.engineVersion) { const refreshed = await makeInitialProject(); return { ...refreshed, id: item.id }; } return item; })); setWorkspace({ ...saved, projects, ready: true }); } else { const initial = await makeInitialProject(); setWorkspace({ projects: [initial], activeId: initial.id, ready: true }); } }; restore(); }, []);
  useEffect(() => { if (workspace.ready) saveWorkspace(workspace.projects, workspace.activeId); }, [workspace]);
  if (!workspace.ready || !project) return <div className="boot-screen"><span className="brand-mark">R</span><strong>正在恢复活动演练室…</strong></div>;
  const updateProject = (next) => setWorkspace((current) => ({ ...current, projects: upsertProject(current.projects, typeof next === 'function' ? next(project) : next) }));
  const createProject = (next) => { const hydrated = synchronizeTimingChecks(next); setWorkspace((current) => ({ ...current, projects: upsertProject(current.projects, hydrated), activeId: hydrated.id })); setView('intake'); };
  const switchProject = (id) => { setWorkspace((current) => ({ ...current, activeId: id })); setFocusRiskId(''); setView('simulation'); };
  const openSimulation = (riskId = '') => { setFocusRiskId(riskId); setView('simulation'); };
  const flashExport = (label) => { setExportStatus(`${label}已导出`); window.setTimeout(() => setExportStatus(''), 1800); };
  const exportProject = () => { downloadText(`${safeFilename(project.title)}.rehearse.json`, serializeProject(project), 'application/json;charset=utf-8'); flashExport('项目'); };
  const exportBrief = () => { downloadText(`${safeFilename(project.title)}-开场前清单.md`, buildBriefMarkdown(project), 'text/markdown;charset=utf-8'); flashExport('清单'); };
  const content = { simulation: <SimulationView project={project} updateProject={updateProject} setView={setView} focusRiskId={focusRiskId} />, intake: <IntakeView project={project} updateProject={updateProject} setView={setView} onAdd={() => setModal('append')} />, map: <MapView project={project} setView={setView} onListen={() => setView('audio')} onSimulate={openSimulation} />, audio: <AudioView project={project} setView={setView} updateProject={updateProject} />, risks: <RisksView project={project} updateProject={updateProject} onSimulate={openSimulation} /> }[view] || <SimulationView project={project} updateProject={updateProject} setView={setView} focusRiskId={focusRiskId} />;
  return <div className="app-shell"><Sidebar view={view} setView={setView} onNew={() => setModal('create')} project={project} projects={workspace.projects} onSwitch={switchProject} /><main className="workspace"><Topbar view={view} project={project} projects={workspace.projects} onSwitch={switchProject} onNew={() => setModal('create')} onExportBrief={exportBrief} onExportProject={exportProject} exportStatus={exportStatus} />{content}</main>{modal && <ProjectModal mode={modal} project={project} close={() => setModal('')} onCreated={modal === 'append' ? updateProject : createProject} />}</div>;
}
