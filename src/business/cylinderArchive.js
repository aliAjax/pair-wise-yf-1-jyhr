// 气瓶档案 - Cylinder Archive
// 管理六只气瓶的基本信息：工作压力、水压检测日、余压、送检状态

const STORAGE_KEY = 'cylinder_archive';

// 初始气瓶数据 - 六只气瓶
const initialCylinders = [
  {
    id: 1,
    name: '气瓶1',
    workingPressure: 15,      // 工作压力 (MPa)
    hydraulicTestDate: '2026-01-15',  // 水压检测日
    residualPressure: 8,       // 余压 (MPa)
    submissionStatus: 'pending'  // 送检状态: pending(待送检), submitted(已送检)
  },
  {
    id: 2,
    name: '气瓶2',
    workingPressure: 18,
    hydraulicTestDate: '2026-03-20',
    residualPressure: 10,
    submissionStatus: 'pending'
  },
  {
    id: 3,
    name: '气瓶3',
    workingPressure: 12,
    hydraulicTestDate: '2025-12-01',  // 已过期
    residualPressure: 6,
    submissionStatus: 'pending'
  },
  {
    id: 4,
    name: '气瓶4',
    workingPressure: 22,      // 超工位上限
    hydraulicTestDate: '2026-06-10',
    residualPressure: 9,
    submissionStatus: 'pending'
  },
  {
    id: 5,
    name: '气瓶5',
    workingPressure: 14,
    hydraulicTestDate: '2026-02-28',
    residualPressure: 3,       // 余压不足
    submissionStatus: 'pending'
  },
  {
    id: 6,
    name: '气瓶6',
    workingPressure: 16,
    hydraulicTestDate: '2026-04-05',
    residualPressure: 7,
    submissionStatus: 'pending'
  }
];

// 最小余压要求 (MPa)
const MIN_RESIDUAL_PRESSURE = 5;

/**
 * 获取所有气瓶
 */
function getAllCylinders() {
  return [...initialCylinders];
}

/**
 * 根据ID获取气瓶
 */
function getCylinderById(id) {
  return initialCylinders.find(c => c.id === id) || null;
}

/**
 * 检查气瓶水压检测是否过期
 * @param {Object} cylinder 气瓶对象
 * @param {Date} today 当前日期
 * @returns {boolean} 是否过期
 */
function isTestExpired(cylinder, today = new Date()) {
  const testDate = new Date(cylinder.hydraulicTestDate);
  // 只比较日期部分，避免时区问题
  const testDateOnly = new Date(testDate.getFullYear(), testDate.getMonth(), testDate.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return testDateOnly < todayOnly;
}

/**
 * 检查气瓶余压是否充足
 * @param {Object} cylinder 气瓶对象
 * @returns {boolean} 余压是否充足
 */
function isResidualPressureSufficient(cylinder) {
  return cylinder.residualPressure >= MIN_RESIDUAL_PRESSURE;
}

/**
 * 检查气瓶是否可以送检
 * @param {Object} cylinder 气瓶对象
 * @param {Date} today 当前日期
 * @returns {Object} { valid: boolean, reasons: string[] }
 */
function validateCylinder(cylinder, today = new Date()) {
  const reasons = [];
  if (isTestExpired(cylinder, today)) {
    reasons.push('检测过期');
  }
  if (!isResidualPressureSufficient(cylinder)) {
    reasons.push('余压不足');
  }
  return { valid: reasons.length === 0, reasons };
}

/**
 * 更新气瓶信息
 * @param {number} id 气瓶ID
 * @param {Object} updates 更新内容
 * @returns {Object|null} 更新后的气瓶
 */
function updateCylinder(id, updates) {
  const index = initialCylinders.findIndex(c => c.id === id);
  if (index === -1) return null;
  initialCylinders[index] = { ...initialCylinders[index], ...updates };
  return initialCylinders[index];
}

/**
 * 获取气瓶的显示状态
 * @param {Object} cylinder 气瓶对象
 * @returns {string} 状态描述
 */
function getCylinderStatus(cylinder) {
  if (isTestExpired(cylinder)) return '检测过期';
  if (!isResidualPressureSufficient(cylinder)) return '余压不足';
  if (cylinder.submissionStatus === 'submitted') return '已送检';
  return '待送检';
}

export {
  STORAGE_KEY,
  initialCylinders,
  MIN_RESIDUAL_PRESSURE,
  getAllCylinders,
  getCylinderById,
  isTestExpired,
  isResidualPressureSufficient,
  validateCylinder,
  updateCylinder,
  getCylinderStatus
};
