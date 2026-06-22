import { Fragment, useEffect, useState } from 'react'
import StatusBadge from './StatusBadge'
import WorkflowDiagram from './WorkflowDiagram'
import { orderApi } from '../api/orderApi'

export default function OrderGrid({ orders, loading, expandOrderId, onOrderChanged }) {
  const [expandedId, setExpandedId] = useState(null)
  const [logs, setLogs] = useState({})
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [approvalBusy, setApprovalBusy] = useState(null)
  const [approvalError, setApprovalError] = useState(null)

  const loadLogsIfNeeded = async (orderId) => {
    if (logs[orderId]) return
    setLoadingLogs(true)
    try {
      const data = await orderApi.getOrderLogs(orderId)
      setLogs(prev => ({ ...prev, [orderId]: data }))
    } finally {
      setLoadingLogs(false)
    }
  }

  const toggleLogs = (orderId) => {
    if (expandedId === orderId) {
      setExpandedId(null)
      return
    }
    setExpandedId(orderId)
    loadLogsIfNeeded(orderId)
  }

  const completeApproval = async (orderId, approved) => {
    setApprovalError(null)
    setApprovalBusy(`${orderId}-${approved ? 'approve' : 'reject'}`)
    try {
      await orderApi.completeApproval(
        orderId,
        approved,
        approved ? 'Approved in demo UI' : 'Rejected in demo UI',
      )
      setLogs(prev => {
        const next = { ...prev }
        delete next[orderId]
        return next
      })
      onOrderChanged?.()
      const data = await orderApi.getOrderLogs(orderId)
      setLogs(prev => ({ ...prev, [orderId]: data }))
    } catch (err) {
      setApprovalError(err.message)
    } finally {
      setApprovalBusy(null)
    }
  }

  // Auto-expand right when a new order is submitted, so its workflow diagram
  // and logs are visible without the user having to click "View".
  useEffect(() => {
    if (!expandOrderId) return
    setExpandedId(expandOrderId)
    loadLogsIfNeeded(expandOrderId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandOrderId])

  if (loading) return <p style={{ color: '#64748b', textAlign: 'center', padding: 32 }}>Loading orders…</p>
  if (!orders.length) return <p style={{ color: '#64748b', textAlign: 'center', padding: 32 }}>No orders yet. Submit one above.</p>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1e293b' }}>
            {['Order ID', 'Customer', 'Amount', 'Items', 'Status', 'Tracking', 'Approval', 'Created', 'Logs'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <Fragment key={order.orderId}>
              <tr key={order.orderId} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '12px 12px', fontFamily: 'monospace', color: '#7dd3fc' }}>{order.orderId}</td>
                <td style={{ padding: '12px 12px' }}>{order.customerId}</td>
                <td style={{ padding: '12px 12px', fontFamily: 'monospace' }}>${Number(order.amount).toFixed(2)}</td>
                <td style={{ padding: '12px 12px', color: '#94a3b8' }}>{order.items?.length ?? 0} item(s)</td>
                <td style={{ padding: '12px 12px' }}><StatusBadge status={order.status} /></td>
                <td style={{ padding: '12px 12px', fontFamily: 'monospace', fontSize: 11, color: '#4ade80' }}>{order.trackingNumber ?? '—'}</td>
                <td style={{ padding: '12px 12px' }}>
                  {order.requireApproval && order.status === 'PENDING' ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => completeApproval(order.orderId, true)}
                        disabled={approvalBusy !== null}
                        style={{ background: '#14532d', border: '1px solid #16a34a', color: '#86efac', padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>
                        {approvalBusy === `${order.orderId}-approve` ? '...' : 'Approve'}
                      </button>
                      <button onClick={() => completeApproval(order.orderId, false)}
                        disabled={approvalBusy !== null}
                        style={{ background: '#450a0a', border: '1px solid #dc2626', color: '#fca5a5', padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>
                        {approvalBusy === `${order.orderId}-reject` ? '...' : 'Reject'}
                      </button>
                    </div>
                  ) : (
                    <span style={{ color: '#475569', fontSize: 11 }}>{order.requireApproval ? 'Done' : '—'}</span>
                  )}
                </td>
                <td style={{ padding: '12px 12px', color: '#64748b', fontSize: 11 }}>
                  {order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}
                </td>
                <td style={{ padding: '12px 12px' }}>
                  <button onClick={() => toggleLogs(order.orderId)}
                    style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '3px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>
                    {expandedId === order.orderId ? 'Hide' : 'View'}
                  </button>
                </td>
              </tr>
              {expandedId === order.orderId && (
                <tr key={`${order.orderId}-logs`}>
                  <td colSpan={9} style={{ background: '#0f172a', padding: '12px 12px' }}>
                    <WorkflowDiagram orderId={order.orderId} />
                    {approvalError && (
                      <p style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>
                        Approval error: {approvalError}
                      </p>
                    )}
                    <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                      Audit Log
                    </span>
                    {loadingLogs && !logs[order.orderId]
                      ? <p style={{ color: '#64748b', padding: '8px 0' }}>Loading…</p>
                      : (logs[order.orderId] ?? []).map((log, i) => (
                          <div key={i} style={{ display: 'flex', gap: 16, padding: '5px 0', borderBottom: '1px solid #1e293b', fontSize: 12 }}>
                            <span style={{ color: '#475569', fontFamily: 'monospace', minWidth: 160 }}>
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <span style={{ color: '#38bdf8', minWidth: 180 }}>{log.action}</span>
                            <span style={{ color: '#94a3b8' }}>{log.details}</span>
                          </div>
                        ))
                    }
                    {order.failureReason && (
                      <p style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>
                        Failure reason: {order.failureReason}
                      </p>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
