// 浏览器存档 - Browser Archive
// 使用 localStorage 保存和恢复状态，刷新保留

const STORAGE_PREFIX = 'diving_cylinder_';

/**
 * 保存状态到 localStorage
 * @param {string} key 存储键
 * @param {*} state 要保存的状态
 */
function saveState(key, state) {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_PREFIX + key, serialized);
    return true;
  } catch (error) {
    console.error('保存状态失败:', error);
    return false;
  }
}

/**
 * 从 localStorage 加载状态
 * @param {string} key 存储键
 * @param {*} defaultValue 默认值
 * @returns {*} 加载的状态或默认值
 */
function loadState(key, defaultValue) {
  try {
    const serialized = localStorage.getItem(STORAGE_PREFIX + key);
    if (serialized === null) return defaultValue;
    return JSON.parse(serialized);
  } catch (error) {
    console.error('加载状态失败:', error);
    return defaultValue;
  }
}

/**
 * 清除指定键的状态
 * @param {string} key 存储键
 */
function clearState(key) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
    return true;
  } catch (error) {
    console.error('清除状态失败:', error);
    return false;
  }
}

/**
 * 清除所有存档
 */
function clearAllStates() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
    return true;
  } catch (error) {
    console.error('清除所有状态失败:', error);
    return false;
  }
}

/**
 * 保存订单列表
 * @param {Array} orders 订单列表
 */
function saveOrders(orders) {
  return saveState('orders', orders);
}

/**
 * 加载订单列表
 * @param {Array} defaultValue 默认订单列表
 * @returns {Array} 订单列表
 */
function loadOrders(defaultValue = []) {
  return loadState('orders', defaultValue);
}

/**
 * 保存气瓶状态（余压、送检状态等）
 * @param {Array} cylinders 气瓶列表
 */
function saveCylinders(cylinders) {
  return saveState('cylinders', cylinders);
}

/**
 * 加载气瓶状态
 * @param {Array} defaultValue 默认气瓶列表
 * @returns {Array} 气瓶列表
 */
function loadCylinders(defaultValue = []) {
  return loadState('cylinders', defaultValue);
}

/**
 * 保存充装位状态
 * @param {Array} stations 充装位列表
 */
function saveStations(stations) {
  return saveState('stations', stations);
}

/**
 * 加载充装位状态
 * @param {Array} defaultValue 默认充装位列表
 * @returns {Array} 充装位列表
 */
function loadStations(defaultValue = []) {
  return loadState('stations', defaultValue);
}

/**
 * 保存检定员状态
 * @param {Array} inspectors 检定员列表
 */
function saveInspectors(inspectors) {
  return saveState('inspectors', inspectors);
}

/**
 * 加载检定员状态
 * @param {Array} defaultValue 默认检定员列表
 * @returns {Array} 检定员列表
 */
function loadInspectors(defaultValue = []) {
  return loadState('inspectors', defaultValue);
}

/**
 * 保存完整应用状态
 * @param {Object} state 应用状态
 */
function saveAppState(state) {
  return saveState('app_state', state);
}

/**
 * 加载完整应用状态
 * @param {Object} defaultValue 默认应用状态
 * @returns {Object} 应用状态
 */
function loadAppState(defaultValue = {}) {
  return loadState('app_state', defaultValue);
}

export {
  STORAGE_PREFIX,
  saveState,
  loadState,
  clearState,
  clearAllStates,
  saveOrders,
  loadOrders,
  saveCylinders,
  loadCylinders,
  saveStations,
  loadStations,
  saveInspectors,
  loadInspectors,
  saveAppState,
  loadAppState
};
