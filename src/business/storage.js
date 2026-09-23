/**
 * 业务文件 3：浏览器存档
 * ------------------------------------------------------------
 * 把调度台全部状态序列化到 localStorage：
 *   - 打开/刷新页面时先读存档，没有或损坏时回落到预置演示数据；
 *   - 每次状态变更后整单写入；
 *   - 提供"恢复演示数据"入口清空存档。
 * 档案见 cylinders.js，规则见 dispatchRules.js。
 */
import { buildSeedState } from './cylinders.js'

const STORAGE_KEY = 'dive-fill-dispatch-console:v1'

/** 读取浏览器存档；无存档或解析失败时返回全新演示数据 */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildSeedState()
    const parsed = JSON.parse(raw)
    // 基本结构校验，避免脏存档导致白屏
    if (!parsed || !Array.isArray(parsed.cylinders) || !Array.isArray(parsed.orders)) {
      return buildSeedState()
    }
    return { ...buildSeedState(), ...parsed }
  } catch {
    return buildSeedState()
  }
}

/** 写入浏览器存档（静默失败，隐私模式等场景不阻塞业务操作） */
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* 存档不可用时仅失去刷新保留能力，不影响当前会话 */
  }
}

/** 清空存档并恢复预置演示数据 */
export function resetState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  return buildSeedState()
}
