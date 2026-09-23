import { useEffect, useMemo, useState } from 'react'
import {
  STATIONS, INSPECTORS, CYLINDER_STATUS, CYLINDER_STATUS_LABEL
} from './business/cylinders.js'
import {
  validateDispatch, sweepDispatched, activeOrders, occupiedStationIds,
  occupiedInspectorIds, inspectionQueue, hydroStatus, hydroDueDate,
  toISODate, parseDate
} from './business/dispatchRules.js'
import { loadState, saveState, resetState } from './business/storage.js'
import {
  TopBar, StationBoard, InspectorPanel, OrderDesk, CylinderTable,
  InspectionQueue, HistoryPanel, LogPanel
} from './components/ui.jsx'

const clone = (s) => structuredClone(s)
const cylName = (c) => (c ? `${c.serial}` : '?')

/** 统一在状态变更里追加一条业务日志 */
function addLog(d, type, text) {
  d.seq += 1
  d.logs.unshift({ id: `L${d.seq}`, at: d.today, type, text })
}

/** 每次写入后巡检派出单：到期/抽空立即撤单并补日志 */
function sweepWithLog(d) {
  const pulled = sweepDispatched(d)
  pulled.forEach((o) => {
    const cyl = d.cylinders.find((c) => c.id === o.cylinderId)
    addLog(d, 'pulled', `撤单 ${o.code}（${cylName(cyl)}）：${o.reason}，工位与检定员立即释放。`)
  })
}

export default function App() {
  const [state, setState] = useState(loadState)

  // 浏览器存档：任何变更后落盘，刷新保留
  useEffect(() => { saveState(state) }, [state])

  const cylById = useMemo(
    () => new Map(state.cylinders.map((c) => [c.id, c])),
    [state.cylinders]
  )

  const busyStations = occupiedStationIds(state)
  const busyInspectors = occupiedInspectorIds(state)
  const queue = inspectionQueue(state)
  const active = activeOrders(state)

  // —— 派单：整单校验通过才落单；否则只记拒绝日志，排期与占用不变 ——
  const submitOrder = (lines) => {
    const result = validateDispatch(state, lines)
    if (!result.ok) {
      setState((prev) => {
        const d = clone(prev)
        addLog(d, 'rejected', `充装单被整单拒绝（排期与人员占用不变）：${result.errors.join('；')}`)
        return d
      })
      return result
    }
    setState((prev) => {
      const d = clone(prev)
      d.seq += 1
      const code = `GD-${d.today.replaceAll('-', '')}-${String(d.seq).padStart(3, '0')}`
      lines.forEach((line, i) => {
        d.orders.push({
          id: `${code}-${i + 1}`, code, lineNo: i + 1,
          cylinderId: line.cylinderId, stationId: line.stationId,
          inspectorId: line.inspectorId,
          status: 'dispatched', dispatchedAt: d.today
        })
        d.cylinders.find((c) => c.id === line.cylinderId).status = CYLINDER_STATUS.FILLING
      })
      const names = lines.map((l) => cylName(d.cylinders.find((c) => c.id === l.cylinderId))).join('、')
      addLog(d, 'dispatched', `派出 ${code}：${names}，共 ${lines.length} 只，工位与检定员已占用。`)
      sweepWithLog(d)
      return d
    })
    return { ok: true }
  }

  // —— 充装完成：释放工位，余压充至工作压力，按最早检测日排队送检 ——
  const completeOrder = (orderId) => {
    setState((prev) => {
      const d = clone(prev)
      const o = d.orders.find((x) => x.id === orderId)
      if (!o || o.status !== 'dispatched') return d
      const cyl = d.cylinders.find((c) => c.id === o.cylinderId)
      o.status = 'completed'
      o.closedAt = d.today
      cyl.status = CYLINDER_STATUS.STORED
      cyl.awaitingInspection = true
      cyl.residual = cyl.workPressure
      addLog(d, 'completed', `${o.code} 充装完成（${cylName(cyl)}，充至 ${cyl.workPressure}bar），工位释放，按最早检测日排入待检队列。`)
      return d
    })
  }

  // —— 编辑气瓶档案（工作压力/检测日/余压）；改动后立即巡检撤单 ——
  const updateCylinder = (id, patch) => {
    setState((prev) => {
      const d = clone(prev)
      const cyl = d.cylinders.find((c) => c.id === id)
      Object.assign(cyl, patch)
      addLog(d, 'edit', `气瓶 ${cylName(cyl)} 档案登记更新。`)
      sweepWithLog(d)
      return d
    })
  }

  // —— 派出后把余压抽空：触发巡检立即撤单（演示动作）——
  const drainCylinder = (id) => updateCylinder(id, { residual: 0 })

  // —— 送检：把待检队列里的气瓶派给空闲检定员 ——
  const sendInspection = (cylinderId, inspectorId) => {
    setState((prev) => {
      const d = clone(prev)
      const cyl = d.cylinders.find((c) => c.id === cylinderId)
      if (!cyl || !cyl.awaitingInspection || cyl.status !== CYLINDER_STATUS.STORED) return d
      if (occupiedInspectorIds(d).has(inspectorId)) return d
      d.seq += 1
      d.inspections.push({ id: `JC${d.seq}`, cylinderId, inspectorId, queuedAt: d.today })
      cyl.status = CYLINDER_STATUS.INSPECTING
      const man = INSPECTORS.find((i) => i.id === inspectorId)
      addLog(d, 'inspect', `${cylName(cyl)} 送出送检，由 ${man.name} 接手水压检测。`)
      return d
    })
  }

  /** 一键送检：队列按最早检测日依次派给当前空闲检定员 */
  const sendAsManyAsFree = () => {
    setState((prev) => {
      const d = clone(prev)
      const free = INSPECTORS.filter((i) => !occupiedInspectorIds(d).has(i.id)).map((i) => i.id)
      const waiting = inspectionQueue(d)
      let n = 0
      waiting.forEach((cyl) => {
        const man = free.shift()
        if (!man) return
        d.seq += 1
        d.inspections.push({ id: `JC${d.seq}`, cylinderId: cyl.id, inspectorId: man, queuedAt: d.today })
        cyl.status = CYLINDER_STATUS.INSPECTING
        addLog(d, 'inspect', `${cylName(cyl)} 按最早检测日顺序送出送检（${INSPECTORS.find((i) => i.id === man).name}）。`)
        n += 1
      })
      if (n === 0) addLog(d, 'edit', '当前没有空闲检定员可承接送检。')
      return d
    })
  }

  // —— 检测归还：检测日更新为业务日期当天，重新在库 ——
  const returnInspection = (inspectionId) => {
    setState((prev) => {
      const d = clone(prev)
      const job = d.inspections.find((x) => x.id === inspectionId)
      if (!job) return d
      const cyl = d.cylinders.find((c) => c.id === job.cylinderId)
      d.inspections = d.inspections.filter((x) => x.id !== inspectionId)
      cyl.status = CYLINDER_STATUS.STORED
      cyl.awaitingInspection = false
      cyl.hydroDate = d.today
      cyl.residual = 0
      addLog(d, 'returned', `${cylName(cyl)} 水压检测合格归还，检测日更新为 ${d.today}（余压已清空，登记余压后方可再派充）。`)
      return d
    })
  }

  // —— 演示时钟：推进业务日期；推进后到期单立即撤单 ——
  const advanceDays = (n) => {
    setState((prev) => {
      const d = clone(prev)
      d.today = toISODate(new Date(parseDate(d.today).getTime() + n * 86400000))
      addLog(d, 'day', `业务日期推进至 ${d.today}。`)
      sweepWithLog(d)
      return d
    })
  }
  const setToday = (today) => {
    if (!today) return
    setState((prev) => {
      const d = clone(prev)
      d.today = today
      addLog(d, 'day', `业务日期登记为 ${today}。`)
      sweepWithLog(d)
      return d
    })
  }

  const reset = () => setState(resetState())

  return (
    <div className="app">
      <TopBar today={state.today} onAdvance={advanceDays} onSetToday={setToday} onReset={reset} />

      <div className="layout">
        <main className="col-main">
          <StationBoard
            stations={STATIONS} orders={active} busyStations={busyStations}
            cylById={cylById} inspectors={INSPECTORS}
            onComplete={completeOrder}
          />
          <OrderDesk
            cylinders={state.cylinders} stations={STATIONS} inspectors={INSPECTORS}
            busyStations={busyStations} busyInspectors={busyInspectors}
            today={state.today} orders={active} inspections={state.inspections}
            onSubmit={submitOrder}
          />
          <CylinderTable
            cylinders={state.cylinders} today={state.today}
            onUpdate={updateCylinder} onDrain={drainCylinder}
            activeOrders={active}
          />
        </main>

        <aside className="col-side">
          <InspectorPanel
            inspectors={INSPECTORS} orders={active} inspections={state.inspections}
            cylById={cylById}
          />
          <InspectionQueue
            queue={queue} inspections={state.inspections}
            cylById={cylById}
            inspectors={INSPECTORS} busyInspectors={busyInspectors}
            onSend={sendInspection} onSendAll={sendAsManyAsFree} onReturn={returnInspection}
          />
          <HistoryPanel
            orders={state.orders} cylById={cylById}
            stations={STATIONS} inspectors={INSPECTORS}
          />
          <LogPanel logs={state.logs} />
        </aside>
      </div>

      <footer className="foot">
        规则：水压检测 12 个月有效 · 最低安全余压 10&nbsp;bar · 工作压力不得超过工位上限 ·
        档案 / 规则 / 浏览器存档三个业务文件分离，数据存于 localStorage
      </footer>
    </div>
  )
}
