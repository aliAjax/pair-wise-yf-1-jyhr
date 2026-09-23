// 调度规则 - Dispatch Rules
// 管理充装位、检定员、订单验证、派出、完成、取消、送检队列

import { isTestExpired, isResidualPressureSufficient, MIN_RESIDUAL_PRESSURE } from './cylinderArchive.js';

// 订单状态枚举
const ORDER_STATUS = {
  PENDING: 'pending',       // 待处理（已批准，等待派出）
  REJECTED: 'rejected',     // 已拒绝
  DISPATCHED: 'dispatched', // 已派出
  FILLING: 'filling',       // 充装中
  COMPLETED: 'completed',   // 已完成（等待送检）
  CANCELLED: 'cancelled'    // 已取消
};

// 拒绝原因
const REJECTION_REASONS = {
  TEST_EXPIRED: '检测过期',
  PRESSURE_EXCEEDED: '压力超工位上限',
  RESIDUAL_INSUFFICIENT: '余压不足'
};

// 四个充装位
const STATIONS = [
  { id: 1, name: '充装位1', pressureLimit: 20, occupied: false, currentOrderId: null },
  { id: 2, name: '充装位2', pressureLimit: 20, occupied: false, currentOrderId: null },
  { id: 3, name: '充装位3', pressureLimit: 15, occupied: false, currentOrderId: null },
  { id: 4, name: '充装位4', pressureLimit: 15, occupied: false, currentOrderId: null }
];

// 两名检定员
const INSPECTORS = [
  { id: 1, name: '检定员1', busy: false, currentOrderId: null },
  { id: 2, name: '检定员2', busy: false, currentOrderId: null }
];

/**
 * 验证订单是否可以接受（整单拒绝规则）
 * @param {Object} cylinder 气瓶对象
 * @param {Object} station 充装位对象
 * @param {Date} today 当前日期
 * @returns {Object} { valid: boolean, reasons: string[] }
 */
function validateOrder(cylinder, station, today = new Date()) {
  const reasons = [];

  // 检测过期
  if (isTestExpired(cylinder, today)) {
    reasons.push(REJECTION_REASONS.TEST_EXPIRED);
  }

  // 压力超工位上限
  if (cylinder.workingPressure > station.pressureLimit) {
    reasons.push(REJECTION_REASONS.PRESSURE_EXCEEDED);
  }

  // 余压不足
  if (!isResidualPressureSufficient(cylinder)) {
    reasons.push(REJECTION_REASONS.RESIDUAL_INSUFFICIENT);
  }

  return { valid: reasons.length === 0, reasons };
}

/**
 * 创建订单
 * @param {number} cylinderId 气瓶ID
 * @param {number} stationId 充装位ID
 * @param {number} inspectorId 检定员ID
 * @param {Array} orders 现有订单列表
 * @param {Date} today 当前日期
 * @returns {Object} { order, rejected, reasons }
 */
function createOrder(cylinderId, stationId, inspectorId, orders, today = new Date()) {
  const station = STATIONS.find(s => s.id === stationId);
  const inspector = INSPECTORS.find(i => i.id === inspectorId);

  if (!station || !inspector) {
    return { order: null, rejected: true, reasons: ['无效的充装位或检定员'] };
  }

  if (station.occupied) {
    return { order: null, rejected: true, reasons: ['充装位已被占用'] };
  }

  if (inspector.busy) {
    return { order: null, rejected: true, reasons: ['检定员已被占用'] };
  }

  // 查找气瓶（需要从外部传入，这里简化处理）
  // 实际验证需要气瓶数据，由调用方传入
  const newOrder = {
    id: Date.now(),
    cylinderId,
    stationId,
    inspectorId,
    status: ORDER_STATUS.PENDING,
    createdAt: today.toISOString(),
    dispatchedAt: null,
    completedAt: null,
    cancelledAt: null,
    rejectionReasons: []
  };

  return { order: newOrder, rejected: false, reasons: [] };
}

/**
 * 批准订单（验证通过后占用资源）
 * @param {Object} order 订单对象
 * @param {Object} cylinder 气瓶对象
 * @param {Object} station 充装位对象
 * @param {Object} inspector 检定员对象
 * @param {Date} today 当前日期
 * @returns {Object} { success, reasons }
 */
function approveOrder(order, cylinder, station, inspector, today = new Date()) {
  const validation = validateOrder(cylinder, station, today);

  if (!validation.valid) {
    // 整单拒绝：不占用工位和检定员
    return { success: false, reasons: validation.reasons };
  }

  // 验证通过，占用资源
  station.occupied = true;
  station.currentOrderId = order.id;
  inspector.busy = true;
  inspector.currentOrderId = order.id;
  order.status = ORDER_STATUS.PENDING;

  return { success: true, reasons: [] };
}

/**
 * 派出订单
 * @param {Object} order 订单对象
 * @param {Date} today 当前日期
 * @returns {boolean} 是否成功
 */
function dispatchOrder(order, today = new Date()) {
  if (order.status !== ORDER_STATUS.PENDING) return false;
  order.status = ORDER_STATUS.DISPATCHED;
  order.dispatchedAt = today.toISOString();
  return true;
}

/**
 * 检查派出的订单是否需要自动取消（检测到期或余压被抽空）
 * @param {Object} order 订单对象
 * @param {Object} cylinder 气瓶对象
 * @param {Date} today 当前日期
 * @returns {Object} { shouldCancel, reason }
 */
function checkDispatchedOrder(order, cylinder, today = new Date()) {
  if (order.status !== ORDER_STATUS.DISPATCHED) {
    return { shouldCancel: false, reason: null };
  }

  // 检测到期
  if (isTestExpired(cylinder, today)) {
    return { shouldCancel: true, reason: '检测到期' };
  }

  // 余压被抽空（余压低于最小要求）
  if (!isResidualPressureSufficient(cylinder)) {
    return { shouldCancel: true, reason: '余压被抽空' };
  }

  return { shouldCancel: false, reason: null };
}

/**
 * 取消订单（释放工位）
 * @param {Object} order 订单对象
 * @param {Object} station 充装位对象
 * @param {Object} inspector 检定员对象
 * @param {string} reason 取消原因
 * @param {Date} today 当前日期
 * @returns {boolean} 是否成功
 */
function cancelOrder(order, station, inspector, reason, today = new Date()) {
  if (order.status === ORDER_STATUS.CANCELLED) return false;

  order.status = ORDER_STATUS.CANCELLED;
  order.cancelledAt = today.toISOString();
  order.cancellationReason = reason;

  // 释放工位
  if (station) {
    station.occupied = false;
    station.currentOrderId = null;
  }

  // 释放检定员
  if (inspector) {
    inspector.busy = false;
    inspector.currentOrderId = null;
  }

  return true;
}

/**
 * 完成充装
 * @param {Object} order 订单对象
 * @param {Object} station 充装位对象
 * @param {Object} inspector 检定员对象
 * @param {Date} today 当前日期
 * @returns {boolean} 是否成功
 */
function completeFilling(order, station, inspector, today = new Date()) {
  if (order.status !== ORDER_STATUS.DISPATCHED && order.status !== ORDER_STATUS.FILLING) {
    return false;
  }

  order.status = ORDER_STATUS.COMPLETED;
  order.completedAt = today.toISOString();

  // 释放工位
  if (station) {
    station.occupied = false;
    station.currentOrderId = null;
  }

  // 释放检定员
  if (inspector) {
    inspector.busy = false;
    inspector.currentOrderId = null;
  }

  return true;
}

/**
 * 获取送检队列（按最早检测日排序）
 * @param {Array} orders 订单列表
 * @param {Array} cylinders 气瓶列表
 * @returns {Array} 排序后的订单列表
 */
function getInspectionQueue(orders, cylinders) {
  const completedOrders = orders.filter(o => o.status === ORDER_STATUS.COMPLETED);

  return completedOrders.sort((a, b) => {
    const cylinderA = cylinders.find(c => c.id === a.cylinderId);
    const cylinderB = cylinders.find(c => c.id === b.cylinderId);

    if (!cylinderA || !cylinderB) return 0;

    const dateA = new Date(cylinderA.hydraulicTestDate);
    const dateB = new Date(cylinderB.hydraulicTestDate);

    return dateA - dateB; // 最早检测日优先
  });
}

/**
 * 获取可用的充装位
 * @returns {Array} 可用充装位列表
 */
function getAvailableStations() {
  return STATIONS.filter(s => !s.occupied);
}

/**
 * 获取可用的检定员
 * @returns {Array} 可用检定员列表
 */
function getAvailableInspectors() {
  return INSPECTORS.filter(i => !i.busy);
}

/**
 * 获取订单的显示状态
 * @param {Object} order 订单对象
 * @returns {string} 状态描述
 */
function getOrderStatusText(order) {
  const statusMap = {
    [ORDER_STATUS.PENDING]: '待派出',
    [ORDER_STATUS.REJECTED]: '已拒绝',
    [ORDER_STATUS.DISPATCHED]: '已派出',
    [ORDER_STATUS.FILLING]: '充装中',
    [ORDER_STATUS.COMPLETED]: '已完成',
    [ORDER_STATUS.CANCELLED]: '已取消'
  };
  return statusMap[order.status] || '未知';
}

export {
  ORDER_STATUS,
  REJECTION_REASONS,
  STATIONS,
  INSPECTORS,
  MIN_RESIDUAL_PRESSURE,
  validateOrder,
  createOrder,
  approveOrder,
  dispatchOrder,
  checkDispatchedOrder,
  cancelOrder,
  completeFilling,
  getInspectionQueue,
  getAvailableStations,
  getAvailableInspectors,
  getOrderStatusText
};
