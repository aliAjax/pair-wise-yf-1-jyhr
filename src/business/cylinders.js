/**
 * 业务文件 1：气瓶档案
 * ------------------------------------------------------------
 * 预置资源台账：四个充装工位、六只气瓶、两名检定员，
 * 以及气瓶/工位/检定员的档案字段定义与演示初始数据。
 * 本文件只描述"档案是什么"，不含调度判定逻辑（见 dispatchRules.js）。
 */

// —— 气瓶送检状态（档案的生命周期）——
export const CYLINDER_STATUS = {
  STORED: 'stored',       // 在库：可被派单充装
  FILLING: 'filling',     // 充装中：已被整单派出，占用工位
  INSPECTING: 'inspecting' // 送检中：在检定员手里做水压检测
}

export const CYLINDER_STATUS_LABEL = {
  [CYLINDER_STATUS.STORED]: '在库',
  [CYLINDER_STATUS.FILLING]: '充装中',
  [CYLINDER_STATUS.INSPECTING]: '送检中'
}

/**
 * 四个充装工位（预置）。
 * maxPressure：工位机械上限（bar），登记的工作压力不得超过它。
 */
export const STATIONS = [
  { id: 'S1', name: '1 号工位', maxPressure: 200 },
  { id: 'S2', name: '2 号工位', maxPressure: 232 },
  { id: 'S3', name: '3 号工位', maxPressure: 232 },
  { id: 'S4', name: '4 号工位', maxPressure: 300 }
]

/**
 * 两名检定员（预置）。同一时刻每人只能承担一个占用——
 * 充装派单看护 或 送检水压检测，二者互斥。
 */
export const INSPECTORS = [
  { id: 'I1', name: '检定员 · 陈潮声' },
  { id: 'I2', name: '检定员 · 林深' }
]

/**
 * 六只气瓶档案（预置）。
 * 字段说明：
 *   serial       瓶号
 *   spec         规格/材质
 *   workPressure 登记工作压力（bar）
 *   hydroDate    最近一次水压检测日（YYYY-MM-DD）
 *   residual     余压（bar）
 *   status       送检状态：在库 / 充装中 / 送检中
 */
export const CYLINDERS = [
  {
    id: 'C1', serial: 'ALU-80-01', spec: '铝合金 11.1L',
    workPressure: 200, hydroDate: '2026-03-18', residual: 45,
    status: CYLINDER_STATUS.STORED
  },
  {
    id: 'C2', serial: 'STEEL-12-02', spec: '钢制 12L',
    workPressure: 232, hydroDate: '2025-08-30', residual: 30,
    status: CYLINDER_STATUS.STORED // 水压检测已过期（演示拒绝场景）
  },
  {
    id: 'C3', serial: 'ALU-63-03', spec: '铝合金 8.8L',
    workPressure: 200, hydroDate: '2025-11-05', residual: 5,
    status: CYLINDER_STATUS.STORED // 余压不足 10bar（演示拒绝场景）
  },
  {
    id: 'C4', serial: 'STEEL-15-04', spec: '钢制 15L',
    workPressure: 300, hydroDate: '2026-06-21', residual: 60,
    status: CYLINDER_STATUS.STORED
  },
  {
    id: 'C5', serial: 'ALU-100-05', spec: '铝合金 14L',
    workPressure: 232, hydroDate: '2026-01-12', residual: 28,
    status: CYLINDER_STATUS.STORED
  },
  {
    id: 'C6', serial: 'STEEL-7-06', spec: '钢制 7L 应急瓶',
    workPressure: 200, hydroDate: '2024-12-02', residual: 18,
    status: CYLINDER_STATUS.STORED // 长期未检（演示拒绝场景）
  }
]

// 业务日期（演示时钟）：任务日 2026-09-23
export const SEED_TODAY = '2026-09-23'

/** 生成一份全新的演示存档 */
export function buildSeedState() {
  return {
    today: SEED_TODAY,
    seq: 0,
    cylinders: CYLINDERS.map((c) => ({ ...c })),
    orders: [],     // 充装单：派出后存在于此，完成/撤单后标记归档但保留记录
    inspections: [], // 检测占用：{ id, cylinderId, inspectorId, queuedAt }
    logs: []
  }
}
