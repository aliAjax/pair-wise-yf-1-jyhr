/**
 * 业务文件 2：调度规则
 * ------------------------------------------------------------
 * 纯函数，不含 React、不碰存档。所有规则集中于此：
 *   1) 派单校验：检测过期 / 压力超工位上限 / 余压不足（任一不满足，整单拒绝）
 *   2) 占用判定：工位同时只能一单，检定员同一时刻只能一个占用
 *   3) 派出后巡检：检测到期 或 余压被抽空 → 立即撤单，释放工位与检定员
 *   4) 充装完成：释放资源，气瓶进入待检队列，按最早检测日排队送检
 * 档案定义见 cylinders.js，持久化见 storage.js。
 */
import { CYLINDER_STATUS, STATIONS } from './cylinders.js'

// —— 规则常量 ——
export const HYDRO_VALID_MONTHS = 12  // 水压检测有效期：12 个月
export const MIN_RESIDUAL = 10        // 最小余压：10 bar，低于此值禁止充装

// —— 日期工具（按本地日历日，避免 UTC 偏移）——
export function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 水压到期日：检测日 + 12 个月 */
export function hydroDueDate(hydroDate) {
  const d = parseDate(hydroDate)
  d.setMonth(d.getMonth() + HYDRO_VALID_MONTHS)
  return toISODate(d)
}

/** 检测状态（相对业务日期 today） */
export function hydroStatus(hydroDate, today) {
  const due = hydroDueDate(hydroDate)
  if (today > due) return 'expired'          // 已过期
  const days = Math.round((parseDate(due) - parseDate(today)) / 86400000)
  if (days <= 30) return 'expiring'          // 30 日内到期
  return 'ok'
}

// —— 占用派生 ——

/** 当前仍在充装中的订单（已派出、未完成、未撤单） */
export function activeOrders(state) {
  return state.orders.filter((o) => o.status === 'dispatched')
}

/** 被占用的工位 id 集合 */
export function occupiedStationIds(state) {
  return new Set(activeOrders(state).map((o) => o.stationId))
}

/** 被占用的检定员 id 集合（充装看护与送检占用互斥） */
export function occupiedInspectorIds(state) {
  const ids = activeOrders(state).map((o) => o.inspectorId)
  state.inspections.forEach((i) => ids.push(i.inspectorId))
  return new Set(ids)
}

/** 充装完成、等待送检的气瓶（按最近水压检测日升序 = 最早检测日排最前） */
export function inspectionQueue(state) {
  return state.cylinders
    .filter((c) => c.status === CYLINDER_STATUS.STORED && c.awaitingInspection)
    .slice()
    .sort((a, b) =>
      a.hydroDate < b.hydroDate ? -1 : a.hydroDate > b.hydroDate ? 1 : 0
    )
}

function byId(list, id) {
  return list.find((x) => x.id === id)
}

/**
 * 派单校验。
 * @param {object} state  当前状态（直接读取，不修改）
 * @param {Array}  lines  [{ cylinderId, stationId, inspectorId }]
 * @returns {{ ok: true, orders: Array } | { ok: false, errors: string[] }}
 *
 * 整单拒绝原则：任意一行不通过，整单都不派出，排期与人员占用保持不变。
 * 因此这里先把全部错误收集齐，由调用方一次性拒绝。
 */
export function validateDispatch(state, lines) {
  const errors = []
  if (!lines.length) {
    return { ok: false, errors: ['充装单为空：请至少选择一只气瓶。'] }
  }

  const usedCylinders = new Set()
  const usedStations = new Set()
  const usedInspectors = new Set()
  const stationBusy = occupiedStationIds(state)
  const inspectorBusy = occupiedInspectorIds(state)

  lines.forEach((line, idx) => {
    const tag = `第 ${idx + 1} 行`
    const cyl = byId(state.cylinders, line.cylinderId)
    const station = byId(STATIONS, line.stationId)
    const inspectorId = line.inspectorId

    if (!cyl) {
      errors.push(`${tag}：未选择气瓶。`)
      return
    }
    const name = `${cyl.serial}（${cyl.id}）`

    // 规则一：检测过期 —— 整单拒绝
    const hs = hydroStatus(cyl.hydroDate, state.today)
    if (hs === 'expired') {
      errors.push(`${tag} ${name}：水压检测已于 ${hydroDueDate(cyl.hydroDate)} 过期，禁止充装。`)
    }

    // 规则二：登记工作压力超过工位机械上限 —— 整单拒绝
    if (!station) {
      errors.push(`${tag} ${name}：未选择工位。`)
    } else if (cyl.workPressure > station.maxPressure) {
      errors.push(
        `${tag} ${name}：工作压力 ${cyl.workPressure}bar 超过 ${station.name} 上限 ${station.maxPressure}bar。`
      )
    }

    // 规则三：余压不足（低于 10bar 视为瓶内可能进湿/污染）—— 整单拒绝
    if (Number(cyl.residual) < MIN_RESIDUAL) {
      errors.push(`${tag} ${name}：余压仅 ${cyl.residual}bar，低于安全余压 ${MIN_RESIDUAL}bar。`)
    }

    // 档案状态：非在库瓶不能再派
    if (cyl.status !== CYLINDER_STATUS.STORED) {
      errors.push(`${tag} ${name}：气瓶当前不在库（${cyl.status === CYLINDER_STATUS.INSPECTING ? '送检中' : '充装中'}）。`)
    } else if (cyl.awaitingInspection) {
      errors.push(`${tag} ${name}：该瓶已在待检队列中，需先送检。`)
    }

    // 单内重复 / 资源冲突（同一单内部也不允许）
    if (usedCylinders.has(cyl.id)) errors.push(`${tag} ${name}：同一气瓶在本单中重复出现。`)
    usedCylinders.add(cyl.id)

    if (station) {
      if (stationBusy.has(station.id)) errors.push(`${tag} ${name}：${station.name}已被占用。`)
      if (usedStations.has(station.id)) errors.push(`${tag} ${name}：${station.name}在本单中被重复分配。`)
      usedStations.add(station.id)
    }

    if (!inspectorId) {
      errors.push(`${tag} ${name}：未指派检定员。`)
    } else {
      if (inspectorBusy.has(inspectorId)) errors.push(`${tag} ${name}：所选检定员当前已被占用。`)
      if (usedInspectors.has(inspectorId)) errors.push(`${tag} ${name}：同一检定员在本单中被重复指派。`)
      usedInspectors.add(inspectorId)
    }
  })

  return errors.length
    ? { ok: false, errors }
    : { ok: true }
}

/**
 * 派出后的强制撤单巡检。
 * 触发时机：业务日期推进、气瓶档案（余压/检测日）被修改之后。
 * 条件（任一即撤）：
 *   a) 瓶的水压检测在当前业务日期已到期；
 *   b) 瓶的余压被抽空（≤ 0）。
 * 撤单立即释放工位与检定员占用（状态改 stored 即释放）。
 *
 * 输入为草稿状态，可直接就地修改；返回被撤订单说明，便于记日志。
 */
export function sweepDispatched(state) {
  const pulled = []
  for (const order of state.orders) {
    if (order.status !== 'dispatched') continue
    const cyl = byId(state.cylinders, order.cylinderId)
    if (!cyl) continue

    if (hydroStatus(cyl.hydroDate, state.today) === 'expired') {
      order.status = 'pulled'
      order.closedAt = state.today
      order.reason = `派出后水压检测到期（${hydroDueDate(cyl.hydroDate)}）`
      cyl.status = CYLINDER_STATUS.STORED
      pulled.push(order)
      continue
    }
    if (Number(cyl.residual) <= 0) {
      order.status = 'pulled'
      order.closedAt = state.today
      order.reason = '派出后余压被抽空'
      cyl.status = CYLINDER_STATUS.STORED
      pulled.push(order)
    }
  }
  return pulled
}
