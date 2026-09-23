// 主应用组件 - Diving Cylinder Filling Dispatch Console
// 整合气瓶档案、调度规则、浏览器存档三个业务模块

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getAllCylinders,
  isTestExpired,
  isResidualPressureSufficient,
  getCylinderStatus
} from './business/cylinderArchive.js';
import {
  ORDER_STATUS,
  STATIONS,
  INSPECTORS,
  validateOrder,
  checkDispatchedOrder,
  completeFilling,
  getInspectionQueue,
  getOrderStatusText
} from './business/dispatchRules.js';
import {
  saveOrders,
  loadOrders,
  saveCylinders,
  loadCylinders,
  saveStations,
  loadStations,
  saveInspectors,
  loadInspectors,
  clearAllStates
} from './business/browserArchive.js';
import './styles/index.css';

// 生成唯一ID
function generateId() {
  return Date.now() + Math.random().toString(36).substr(2, 9);
}

function App() {
  // 状态管理
  const [cylinders, setCylinders] = useState(() => loadCylinders(getAllCylinders()));
  const [stations, setStations] = useState(() => loadStations(STATIONS.map(s => ({ ...s }))));
  const [inspectors, setInspectors] = useState(() => loadInspectors(INSPECTORS.map(i => ({ ...i }))));
  const [orders, setOrders] = useState(() => loadOrders([]));

  // 表单状态
  const [selectedCylinder, setSelectedCylinder] = useState('');
  const [selectedStation, setSelectedStation] = useState('');
  const [selectedInspector, setSelectedInspector] = useState('');
  const [rejectionMessage, setRejectionMessage] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // 用于跟踪最新状态的 refs（避免定时器中的闭包陈旧问题）
  const cylindersRef = useRef(cylinders);
  const stationsRef = useRef(stations);
  const inspectorsRef = useRef(inspectors);
  const ordersRef = useRef(orders);
  const checkIntervalRef = useRef(null);

  // 同步 refs 与状态
  useEffect(() => {
    cylindersRef.current = cylinders;
  }, [cylinders]);

  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);

  useEffect(() => {
    inspectorsRef.current = inspectors;
  }, [inspectors]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // 保存状态到 localStorage
  const persistState = useCallback(() => {
    saveCylinders(cylinders);
    saveStations(stations);
    saveInspectors(inspectors);
    saveOrders(orders);
  }, [cylinders, stations, inspectors, orders]);

  // 当状态变化时保存
  useEffect(() => {
    persistState();
  }, [persistState]);

  // 检查所有派出的订单（使用 ref 获取最新状态）
  const checkDispatchedOrders = useCallback(() => {
    const today = new Date();
    const currentCylinders = cylindersRef.current;
    const currentStations = stationsRef.current;
    const currentInspectors = inspectorsRef.current;
    const currentOrders = ordersRef.current;

    const updatedOrders = currentOrders.map(order => {
      if (order.status !== ORDER_STATUS.DISPATCHED) return order;

      const cylinder = currentCylinders.find(c => c.id === order.cylinderId);
      if (!cylinder) return order;

      const checkResult = checkDispatchedOrder(order, cylinder, today);
      if (checkResult.shouldCancel) {
        // 释放工位
        const station = currentStations.find(s => s.id === order.stationId);
        if (station) {
          setStations(prev =>
            prev.map(s =>
              s.id === order.stationId
                ? { ...s, occupied: false, currentOrderId: null }
                : s
            )
          );
        }
        // 释放检定员
        const inspector = currentInspectors.find(i => i.id === order.inspectorId);
        if (inspector) {
          setInspectors(prev =>
            prev.map(i =>
              i.id === order.inspectorId
                ? { ...i, busy: false, currentOrderId: null }
                : i
            )
          );
        }
        return {
          ...order,
          status: ORDER_STATUS.CANCELLED,
          cancelledAt: today.toISOString(),
          cancellationReason: checkResult.reason
        };
      }
      return order;
    });

    // 只有当订单确实发生变化时才更新
    const hasChanges = updatedOrders.some((order, index) => order !== currentOrders[index]);
    if (hasChanges) {
      setOrders(updatedOrders);
    }
  }, []);

  // 定时检查派出的订单是否需要自动取消
  useEffect(() => {
    checkIntervalRef.current = setInterval(() => {
      setCurrentTime(new Date());
      checkDispatchedOrders();
    }, 1000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [checkDispatchedOrders]);

  // 创建订单
  const handleCreateOrder = () => {
    setRejectionMessage('');

    if (!selectedCylinder || !selectedStation || !selectedInspector) {
      setRejectionMessage('请选择气瓶、充装位和检定员');
      return;
    }

    const cylinder = cylinders.find(c => c.id === parseInt(selectedCylinder));
    const station = stations.find(s => s.id === parseInt(selectedStation));
    const inspector = inspectors.find(i => i.id === parseInt(selectedInspector));

    if (!cylinder || !station || !inspector) {
      setRejectionMessage('选择的资源无效');
      return;
    }

    // 检查工位是否被占用
    if (station.occupied) {
      setRejectionMessage('该充装位已被占用');
      return;
    }

    // 检查检定员是否被占用
    if (inspector.busy) {
      setRejectionMessage('该检定员已被占用');
      return;
    }

    // 验证订单（整单拒绝规则）
    const today = new Date();
    const validation = validateOrder(cylinder, station, today);

    const newOrder = {
      id: generateId(),
      cylinderId: cylinder.id,
      stationId: station.id,
      inspectorId: inspector.id,
      status: validation.valid ? ORDER_STATUS.PENDING : ORDER_STATUS.REJECTED,
      createdAt: today.toISOString(),
      dispatchedAt: null,
      completedAt: null,
      cancelledAt: null,
      rejectionReasons: validation.reasons,
      cancellationReason: null
    };

    if (validation.valid) {
      // 验证通过，占用工位和检定员
      setStations(prev =>
        prev.map(s =>
          s.id === station.id ? { ...s, occupied: true, currentOrderId: newOrder.id } : s
        )
      );
      setInspectors(prev =>
        prev.map(i =>
          i.id === inspector.id ? { ...i, busy: true, currentOrderId: newOrder.id } : i
        )
      );
    }

    setOrders(prev => [...prev, newOrder]);

    if (!validation.valid) {
      setRejectionMessage(`订单被拒绝：${validation.reasons.join('、')}`);
    }

    // 重置表单
    setSelectedCylinder('');
    setSelectedStation('');
    setSelectedInspector('');
  };

  // 派出订单
  const handleDispatch = (orderId) => {
    const today = new Date();
    setOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, status: ORDER_STATUS.DISPATCHED, dispatchedAt: today.toISOString() }
          : o
      )
    );
  };

  // 完成充装
  const handleCompleteFilling = (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const today = new Date();
    setOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, status: ORDER_STATUS.COMPLETED, completedAt: today.toISOString() }
          : o
      )
    );

    // 释放工位
    setStations(prev =>
      prev.map(s =>
        s.id === order.stationId ? { ...s, occupied: false, currentOrderId: null } : s
      )
    );

    // 释放检定员
    setInspectors(prev =>
      prev.map(i =>
        i.id === order.inspectorId ? { ...i, busy: false, currentOrderId: null } : i
      )
    );
  };

  // 取消订单
  const handleCancelOrder = (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const station = stations.find(s => s.id === order.stationId);
    const inspector = inspectors.find(i => i.id === order.inspectorId);
    const today = new Date();

    setOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, status: ORDER_STATUS.CANCELLED, cancelledAt: today.toISOString(), cancellationReason: '手动取消' }
          : o
      )
    );

    if (station) {
      setStations(prev =>
        prev.map(s =>
          s.id === station.id ? { ...s, occupied: false, currentOrderId: null } : s
        )
      );
    }

    if (inspector) {
      setInspectors(prev =>
        prev.map(i =>
          i.id === inspector.id ? { ...i, busy: false, currentOrderId: null } : i
        )
      );
    }
  };

  // 重置所有数据
  const handleReset = () => {
    if (window.confirm('确定要重置所有数据吗？此操作不可恢复。')) {
      clearAllStates();
      setCylinders(getAllCylinders());
      setStations(STATIONS.map(s => ({ ...s })));
      setInspectors(INSPECTORS.map(i => ({ ...i })));
      setOrders([]);
      setRejectionMessage('');
    }
  };

  // 获取送检队列
  const inspectionQueue = getInspectionQueue(orders, cylinders);

  // 格式化日期
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('zh-CN');
  };

  // 获取订单状态样式类
  const getStatusClass = (status) => {
    const classMap = {
      [ORDER_STATUS.PENDING]: 'status-pending',
      [ORDER_STATUS.REJECTED]: 'status-rejected',
      [ORDER_STATUS.DISPATCHED]: 'status-dispatched',
      [ORDER_STATUS.FILLING]: 'status-filling',
      [ORDER_STATUS.COMPLETED]: 'status-completed',
      [ORDER_STATUS.CANCELLED]: 'status-cancelled'
    };
    return classMap[status] || '';
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>潜水气瓶充装调度台</h1>
        <p className="subtitle">Diving Cylinder Filling Dispatch Console</p>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleReset}>重置数据</button>
        </div>
      </header>

      <main className="app-main">
        {/* 仪表板：充装位、气瓶、检定员 */}
        <section className="dashboard">
          {/* 充装位 */}
          <div className="panel stations-panel">
            <h2>充装位 (Stations)</h2>
            <div className="station-grid">
              {stations.map(station => (
                <div key={station.id} className={`station-card ${station.occupied ? 'occupied' : 'available'}`}>
                  <h3>{station.name}</h3>
                  <p>压力上限: {station.pressureLimit} MPa</p>
                  <p>状态: {station.occupied ? '占用中' : '可用'}</p>
                  {station.currentOrderId && (
                    <p>当前订单: #{String(station.currentOrderId).slice(-6)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 气瓶 */}
          <div className="panel cylinders-panel">
            <h2>气瓶 (Cylinders)</h2>
            <div className="cylinder-grid">
              {cylinders.map(cylinder => (
                <div key={cylinder.id} className={`cylinder-card ${getCylinderStatus(cylinder) === '待送检' ? 'valid' : 'invalid'}`}>
                  <h3>{cylinder.name}</h3>
                  <p>工作压力: {cylinder.workingPressure} MPa</p>
                  <p>水压检测日: {formatDate(cylinder.hydraulicTestDate)}</p>
                  <p>余压: {cylinder.residualPressure} MPa</p>
                  <p>状态: {getCylinderStatus(cylinder)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 检定员 */}
          <div className="panel inspectors-panel">
            <h2>检定员 (Inspectors)</h2>
            <div className="inspector-grid">
              {inspectors.map(inspector => (
                <div key={inspector.id} className={`inspector-card ${inspector.busy ? 'busy' : 'available'}`}>
                  <h3>{inspector.name}</h3>
                  <p>状态: {inspector.busy ? '忙碌中' : '可用'}</p>
                  {inspector.currentOrderId && (
                    <p>当前订单: #{String(inspector.currentOrderId).slice(-6)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 订单创建 */}
        <section className="order-create">
          <h2>创建订单 (Create Order)</h2>
          <div className="order-form">
            <div className="form-group">
              <label>气瓶:</label>
              <select value={selectedCylinder} onChange={e => setSelectedCylinder(e.target.value)}>
                <option value="">选择气瓶</option>
                {cylinders.map(c => (
                  <option key={c.id} value={c.id}>{c.name} (余压: {c.residualPressure}MPa, 检测日: {formatDate(c.hydraulicTestDate)})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>充装位:</label>
              <select value={selectedStation} onChange={e => setSelectedStation(e.target.value)}>
                <option value="">选择充装位</option>
                {stations.map(s => (
                  <option key={s.id} value={s.id} disabled={s.occupied}>{s.name} (上限: {s.pressureLimit}MPa) {s.occupied ? '- 已占用' : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>检定员:</label>
              <select value={selectedInspector} onChange={e => setSelectedInspector(e.target.value)}>
                <option value="">选择检定员</option>
                {inspectors.map(i => (
                  <option key={i.id} value={i.id} disabled={i.busy}>{i.name} {i.busy ? '- 已占用' : ''}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleCreateOrder}>创建订单</button>
          </div>
          {rejectionMessage && (
            <div className="rejection-message">{rejectionMessage}</div>
          )}
        </section>

        {/* 订单列表 */}
        <section className="orders-list">
          <h2>订单列表 (Orders)</h2>
          {orders.length === 0 ? (
            <p className="no-orders">暂无订单</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>订单ID</th>
                  <th>气瓶</th>
                  <th>充装位</th>
                  <th>检定员</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const cylinder = cylinders.find(c => c.id === order.cylinderId);
                  const station = stations.find(s => s.id === order.stationId);
                  const inspector = inspectors.find(i => i.id === order.inspectorId);
                  return (
                    <tr key={order.id}>
                      <td>#{String(order.id).slice(-6)}</td>
                      <td>{cylinder ? cylinder.name : '-'}</td>
                      <td>{station ? station.name : '-'}</td>
                      <td>{inspector ? inspector.name : '-'}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(order.status)}`}>
                          {getOrderStatusText(order)}
                        </span>
                        {order.rejectionReasons && order.rejectionReasons.length > 0 && (
                          <span className="rejection-reason">({order.rejectionReasons.join('、')})</span>
                        )}
                        {order.cancellationReason && (
                          <span className="rejection-reason">({order.cancellationReason})</span>
                        )}
                      </td>
                      <td>{formatDate(order.createdAt)}</td>
                      <td>
                        {order.status === ORDER_STATUS.PENDING && (
                          <button className="btn btn-sm btn-success" onClick={() => handleDispatch(order.id)}>派出</button>
                        )}
                        {order.status === ORDER_STATUS.DISPATCHED && (
                          <button className="btn btn-sm btn-primary" onClick={() => handleCompleteFilling(order.id)}>完成充装</button>
                        )}
                        {(order.status === ORDER_STATUS.PENDING || order.status === ORDER_STATUS.DISPATCHED) && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleCancelOrder(order.id)}>取消</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* 送检队列 */}
        <section className="inspection-queue">
          <h2>送检队列 (Inspection Queue - 按最早检测日排序)</h2>
          {inspectionQueue.length === 0 ? (
            <p className="no-queue">暂无待送检订单</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>排名</th>
                  <th>订单ID</th>
                  <th>气瓶</th>
                  <th>水压检测日</th>
                  <th>完成时间</th>
                </tr>
              </thead>
              <tbody>
                {inspectionQueue.map((order, index) => {
                  const cylinder = cylinders.find(c => c.id === order.cylinderId);
                  return (
                    <tr key={order.id}>
                      <td>{index + 1}</td>
                      <td>#{String(order.id).slice(-6)}</td>
                      <td>{cylinder ? cylinder.name : '-'}</td>
                      <td>{cylinder ? formatDate(cylinder.hydraulicTestDate) : '-'}</td>
                      <td>{formatDate(order.completedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <p>当前时间: {currentTime.toLocaleString('zh-CN')} | 数据已自动保存到浏览器存档</p>
      </footer>
    </div>
  );
}

export default App;
