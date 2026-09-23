import { useMemo, useState } from 'react'
import { CYLINDER_STATUS, CYLINDER_STATUS_LABEL } from '../business/cylinders.js'
import {
  validateDispatch, hydroStatus, hydroDueDate, MIN_RESIDUAL
} from '../business/dispatchRules.js'

// —— 通用小部件 ——

const TYPE_LABEL = {
  dispatched: '派出', completed: '完成', pulled: '撤单',
  rejected: '拒绝', inspect: '送检', returned: '归还', edit: '登记', day: '时钟'
}

function Badge({ tone, children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

function hydroBadge(cyl, today) {
  const s = hydroStatus(cyl.hydroDate, today)
  if (s === 'expired') return <Badge tone="danger">检测过期（{hydroDueDate(cyl.hydroDate)}）</Badge>
  if (s === 'expiring') return <Badge tone="warn">30 日内到期（{hydroDueDate(cyl.hydroDate)}）</Badge>
  return <Badge tone="ok">检测有效（至 {hydroDueDate(cyl.hydroDate)}）</Badge>
}

function cylinderStateBadge(cyl) {
  if (cyl.status === CYLINDER_STATUS.FILLING) return <Badge tone="info">充装中</Badge>
  if (cyl.status === CYLINDER_STATUS.INSPECTING) return <Badge tone="warn">送检中</Badge>
  if (cyl.awaitingInspection) return <Badge tone="warn">待送检</Badge>
  return <Badge tone="ok">在库可派</Badge>
}

// —— 顶栏 ——

export function TopBar({ today, onAdvance, onSetToday, onReset }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">◉</span>
        <div>
          <h1>潜水气瓶充装调度台</h1>
          <p>四工位 · 六气瓶 · 两检定员｜登记 → 校验派出 → 撤单/完成 → 排队送检</p>
        </div>
      </div>
      <div className="clock">
        <span className="clock-label">业务日期</span>
        <button className="btn btn-mini" onClick={() => onAdvance(-1)}>−1天</button>
        <input type="date" value={today} onChange={(e) => onSetToday(e.target.value)} />
        <button className="btn btn-mini" onClick={() => onAdvance(1)}>+1天</button>
        <button className="btn btn-mini" onClick={() => onAdvance(30)}>+30天</button>
        <button className="btn btn-ghost" onClick={onReset} title="清空浏览器存档并恢复演示数据">
          恢复演示数据
        </button>
      </div>
    </header>
  )
}

// —— 工位看板 ——

export function StationBoard({ stations, orders, busyStations, cylById, inspectors, onComplete }) {
  const orderByStation = new Map(orders.map((o) => [o.stationId, o]))
  return (
    <section className="card">
      <h2 className="card-title">充装工位（4）</h2>
      <div className="stations">
        {stations.map((st) => {
          const o = orderByStation.get(st.id)
          const cyl = o && cylById.get(o.cylinderId)
          const man = o && inspectors.find((i) => i.id === o.inspectorId)
          return (
            <div key={st.id} className={`station ${o ? 'busy' : ''}`}>
              <div className="station-head">
                <strong>{st.name}</strong>
                <Badge tone="muted">上限 {st.maxPressure} bar</Badge>
              </div>
              {o ? (
                <div className="station-body">
                  <Badge tone="info">占用中</Badge>
                  <p className="line"><b>{cyl.serial}</b> · {cyl.workPressure} bar</p>
                  <p className="muted">{o.code}（第{o.lineNo}行）</p>
                  <p className="muted">{man.name}</p>
                  <button className="btn btn-primary btn-block" onClick={() => onComplete(o.id)}>
                    充装完成，排入送检
                  </button>
                </div>
              ) : (
                <div className="station-body">
                  <Badge tone="ok">空闲</Badge>
                  <p className="muted">等待派单</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// —— 检定员面板 ——

export function InspectorPanel({ inspectors, orders, inspections, cylById }) {
  const fillByMan = new Map(orders.map((o) => [o.inspectorId, o]))
  const inspByMan = new Map(inspections.map((j) => [j.inspectorId, j]))
  return (
    <section className="card">
      <h2 className="card-title">检定员（2）</h2>
      <div className="inspectors">
        {inspectors.map((m) => {
          const fo = fillByMan.get(m.id)
          const ij = inspByMan.get(m.id)
          const cyl = fo ? cylById.get(fo.cylinderId) : ij ? cylById.get(ij.cylinderId) : null
          return (
            <div key={m.id} className={`inspector ${fo || ij ? 'busy' : ''}`}>
              <div className="row-between">
                <strong>{m.name}</strong>
                {fo
                  ? <Badge tone="info">充装看护</Badge>
                  : ij
                    ? <Badge tone="warn">送检检测</Badge>
                    : <Badge tone="ok">空闲</Badge>}
              </div>
              {cyl && <p className="muted">{cyl.serial}{fo ? ` · ${fo.code}` : ' · 水压检测中'}</p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// —— 派单台 ——

const emptyLine = () => ({ cylinderId: '', stationId: '', inspectorId: '' })

export function OrderDesk({
  cylinders, stations, inspectors, busyStations, busyInspectors,
  today, orders, inspections, onSubmit
}) {
  const [lines, setLines] = useState([emptyLine()])
  const [feedback, setFeedback] = useState(null)

  const check = useMemo(
    () => validateDispatch({ cylinders, today, orders, inspections }, lines),
    [cylinders, today, orders, inspections, lines]
  )

  const patch = (i, key, value) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)))

  const submit = () => {
    const result = onSubmit(lines)
    if (result.ok) {
      setLines([emptyLine()])
      setFeedback({ ok: true, text: '整单已派出，工位与检定员已占用。' })
    } else {
      setFeedback({ ok: false, text: result.errors })
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">充装派单台<span className="title-hint">任一行不过，整单拒绝，排期与人员占用不变</span></h2>

      <div className="order-head">
        <span>气瓶（工作压力 / 检测日 / 余压）</span>
        <span>充装工位</span>
        <span>检定员</span>
        <span />
      </div>

      {lines.map((line, i) => {
        const cyl = cylinders.find((c) => c.id === line.cylinderId)
        const singleErr = check.ok ? [] : check.errors.filter((e) => e.startsWith(`第 ${i + 1} 行`))
        return (
          <div key={i} className="order-line">
            <select value={line.cylinderId} onChange={(e) => patch(i, 'cylinderId', e.target.value)}>
              <option value="">选择气瓶…</option>
              {cylinders.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.serial}｜{c.workPressure}bar｜检测 {c.hydroDate}｜余压 {c.residual}bar
                  {c.status !== CYLINDER_STATUS.STORED ? `｜${CYLINDER_STATUS_LABEL[c.status]}` : ''}
                  {c.awaitingInspection ? '｜待送检' : ''}
                </option>
              ))}
            </select>

            <select value={line.stationId} onChange={(e) => patch(i, 'stationId', e.target.value)}>
              <option value="">选择工位…</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id} disabled={busyStations.has(s.id)}>
                  {s.name}（≤{s.maxPressure}bar）{busyStations.has(s.id) ? '｜占用' : ''}
                </option>
              ))}
            </select>

            <select value={line.inspectorId} onChange={(e) => patch(i, 'inspectorId', e.target.value)}>
              <option value="">指派检定员…</option>
              {inspectors.map((m) => (
                <option key={m.id} value={m.id} disabled={busyInspectors.has(m.id)}>
                  {m.name}{busyInspectors.has(m.id) ? '｜占用' : ''}
                </option>
              ))}
            </select>

            <button
              className="btn btn-mini btn-danger"
              disabled={lines.length === 1}
              onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
            >
              移除
            </button>

            {cyl && (
              <div className="line-flags">
                {hydroBadge(cyl, today)}
                {Number(cyl.residual) < MIN_RESIDUAL
                  ? <Badge tone="danger">余压不足</Badge>
                  : <Badge tone="ok">余压 {cyl.residual}bar</Badge>}
                {line.stationId && cyl.workPressure > stations.find((s) => s.id === line.stationId)?.maxPressure &&
                  <Badge tone="danger">超工位上限</Badge>}
              </div>
            )}
            {singleErr.map((e, k) => <p key={k} className="line-err">{e.replace(`第 ${i + 1} 行：`, '⚠ ')}</p>)}
          </div>
        )
      })}

      <div className="order-actions">
        <button className="btn" onClick={() => setLines((ls) => [...ls, emptyLine()])}>＋ 增加气瓶行</button>
        <button className="btn btn-primary" disabled={!check.ok} onClick={submit}>
          校验并派出整单
        </button>
      </div>

      {!check.ok && (
        <div className="feedback feedback-err">
          <b>整单预检不通过：</b>
          <ul>{check.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {feedback && check.ok && (
        <div className={`feedback ${feedback.ok ? 'feedback-ok' : 'feedback-err'}`}>
          {feedback.ok ? feedback.text : (
            <ul>{feedback.text.map((e, i) => <li key={i}>{e}</li>)}</ul>
          )}
        </div>
      )}
    </section>
  )
}

// —— 气瓶档案 ——

export function CylinderTable({ cylinders, today, onUpdate, onDrain, activeOrders }) {
  const filling = new Set(activeOrders.map((o) => o.cylinderId))
  const num = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return (
    <section className="card">
      <h2 className="card-title">
        气瓶档案（6）
        <span className="title-hint">登记工作压力 / 水压检测日 / 余压 / 送检状态；改动即时复核派出单</span>
      </h2>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>瓶号 / 规格</th>
              <th>工作压力(bar)</th>
              <th>水压检测日</th>
              <th>余压(bar)</th>
              <th>检测 / 送检状态</th>
              <th>派出后应急动作</th>
            </tr>
          </thead>
          <tbody>
            {cylinders.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.serial}</b>
                  <span className="muted"> · {c.spec}</span>
                </td>
                <td>
                  <input
                    type="number" min="0" className="input-num"
                    value={c.workPressure}
                    onChange={(e) => onUpdate(c.id, { workPressure: num(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="date" value={c.hydroDate}
                    onChange={(e) => onUpdate(c.id, { hydroDate: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number" min="0" className="input-num"
                    value={c.residual}
                    onChange={(e) => onUpdate(c.id, { residual: num(e.target.value) })}
                  />
                </td>
                <td>
                  <div className="flags">{hydroBadge(c, today)}{cylinderStateBadge(c)}</div>
                </td>
                <td>
                  {filling.has(c.id)
                    ? <button className="btn btn-mini btn-danger" onClick={() => onDrain(c.id)}>
                        模拟余压抽空（立即撤单）
                      </button>
                    : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// —— 待检队列 / 送检管理 ——

export function InspectionQueue({ queue, inspections, cylById, inspectors, busyInspectors, onSend, onSendAll, onReturn }) {
  const jobByCyl = new Map(inspections.map((j) => [j.cylinderId, j]))
  const freeMen = inspectors.filter((m) => !busyInspectors.has(m.id))
  return (
    <section className="card">
      <h2 className="card-title">
        送检调度
        <span className="title-hint">充装完成后按最早检测日排队</span>
      </h2>

      <h3 className="sub-title">待检队列（{queue.length}）</h3>
      {queue.length === 0 && <p className="muted">暂无待检气瓶。</p>}
      {queue.map((c, i) => (
        <div key={c.id} className="queue-row">
          <div>
            <span className="queue-no">#{i + 1}</span>
            <b>{c.serial}</b>
            <span className="muted"> 检测日 {c.hydroDate}</span>
          </div>
          <div className="queue-actions">
            {freeMen.length === 0
              ? <Badge tone="warn">无空闲检定员</Badge>
              : freeMen.map((m) => (
                  <button key={m.id} className="btn btn-mini" onClick={() => onSend(c.id, m.id)}>
                    交 {m.name.replace('检定员 · ', '')}
                  </button>
                ))}
          </div>
        </div>
      ))}
      {queue.length > 0 && freeMen.length > 0 && (
        <button className="btn btn-block" onClick={onSendAll}>
          一键送检：按队首顺序派给空闲检定员（{freeMen.length} 人可接）
        </button>
      )}

      <h3 className="sub-title">检测中（{inspections.length}）</h3>
      {inspections.length === 0 && <p className="muted">暂无在检气瓶。</p>}
      {inspections.map((j) => {
        return (
          <div key={j.id} className="queue-row">
            <div>
              <b>{cylById.get(j.cylinderId)?.serial || j.cylinderId}</b>
              <span className="muted"> · {inspectors.find((m) => m.id === j.inspectorId)?.name}</span>
            </div>
            <button className="btn btn-mini btn-primary" onClick={() => onReturn(j.id)}>
              检测合格归还
            </button>
          </div>
        )
      })}
    </section>
  )
}

// —— 已结单记录 ——

const ORDER_STATUS_LABEL = { completed: '充装完成', pulled: '已撤单', dispatched: '充装中' }

export function HistoryPanel({ orders, cylById, stations, inspectors }) {
  const closed = orders.filter((o) => o.status !== 'dispatched')
  if (closed.length === 0) return null
  return (
    <section className="card">
      <details>
        <summary className="card-title clickable">
          已结充装单（{closed.length}）<span className="title-hint">点击展开</span>
        </summary>
        <table className="grid grid-mini">
          <thead>
            <tr><th>单号</th><th>气瓶</th><th>工位</th><th>结果</th><th>说明</th></tr>
          </thead>
          <tbody>
            {closed.slice().reverse().map((o) => (
              <tr key={o.id}>
                <td>{o.code}-{o.lineNo}</td>
                <td>{cylById.get(o.cylinderId)?.serial}</td>
                <td>{stations.find((s) => s.id === o.stationId)?.name}</td>
                <td>
                  <Badge tone={o.status === 'completed' ? 'ok' : 'danger'}>
                    {ORDER_STATUS_LABEL[o.status]}
                  </Badge>
                </td>
                <td className="muted">{o.reason || `${o.dispatchedAt} → ${o.closedAt}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}

// —— 业务日志 ——

export function LogPanel({ logs }) {
  return (
    <section className="card">
      <h2 className="card-title">调度日志</h2>
      <div className="logs">
        {logs.length === 0 && <p className="muted">尚无操作记录。</p>}
        {logs.map((l) => (
          <div key={l.id} className={`log log-${l.type}`}>
            <Badge tone={
              l.type === 'rejected' || l.type === 'pulled' ? 'danger'
              : l.type === 'dispatched' || l.type === 'completed' || l.type === 'returned' ? 'ok'
              : l.type === 'inspect' ? 'warn' : 'muted'
            }>{TYPE_LABEL[l.type] || l.type}</Badge>
            <span className="log-at">{l.at}</span>
            <span className="log-text">{l.text}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
