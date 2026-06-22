import { useEffect, useRef, useState } from 'react'
import { orderApi } from '../api/orderApi'

// Static layout mirroring conductor-workflow.json — validate -> fork(reserve/pay/fraud)
// -> join -> saga decision -> optional manual approval -> shipment or compensation.
const NODES = [
  { id: 'validate_order_ref', label: 'Validate Order', shape: 'rect', x: 10, y: 155, w: 150, h: 50 },
  { id: 'parallel_fulfillment_ref', label: '+', shape: 'diamond', x: 178, y: 158, w: 44, h: 44 },
  { id: 'reserve_inventory_ref', label: 'Reserve Inventory', shape: 'rect', x: 250, y: 45, w: 160, h: 50 },
  { id: 'authorize_payment_ref', label: 'Authorize Payment', shape: 'rect', x: 250, y: 155, w: 160, h: 50 },
  { id: 'fraud_check_ref', label: 'Fraud Check', shape: 'rect', x: 250, y: 265, w: 160, h: 50 },
  { id: 'join_parallel_ref', label: '+', shape: 'diamond', x: 438, y: 158, w: 44, h: 44 },
  { id: 'saga_decision_ref', label: 'Saga Decision', shape: 'diamond', x: 505, y: 145, w: 110, h: 70 },
  { id: 'approval_gate_ref', label: 'Approval Gate', shape: 'diamond', x: 650, y: 145, w: 110, h: 70 },
  { id: 'manual_approval_ref', label: 'Manual Approval', shape: 'rect', x: 800, y: 120, w: 160, h: 50 },
  { id: 'approval_decision_ref', label: 'Approval Decision', shape: 'diamond', x: 1005, y: 145, w: 125, h: 70 },
  { id: 'shipment_ref', altIds: ['create_shipment_ref'], label: 'Shipment Sub-Workflow', sublabel: 'create_shipment', shape: 'rect', x: 1190, y: 45, w: 180, h: 50 },
  { id: 'update_status_success_ref', label: 'Update Status', sublabel: 'COMPLETED', shape: 'rect', x: 1405, y: 45, w: 170, h: 50 },
  { id: 'release_inventory_comp_ref', altIds: ['release_inventory_reject_ref'], label: 'Release Inventory', shape: 'rect', x: 650, y: 265, w: 160, h: 50 },
  { id: 'void_payment_comp_ref', altIds: ['void_payment_reject_ref'], label: 'Void Payment', shape: 'rect', x: 840, y: 265, w: 150, h: 50 },
  { id: 'update_status_comp_ref', altIds: ['update_status_reject_ref'], label: 'Update Status', sublabel: 'COMPENSATED', shape: 'rect', x: 1025, y: 265, w: 180, h: 50 },
]

const EDGES = [
  { from: [160, 180], to: [178, 180] },
  { from: [222, 180], to: [250, 70] },
  { from: [222, 180], to: [250, 180] },
  { from: [222, 180], to: [250, 290] },
  { from: [410, 70], to: [438, 180] },
  { from: [410, 180], to: [438, 180] },
  { from: [410, 290], to: [438, 180] },
  { from: [482, 180], to: [505, 180] },
  { from: [615, 180], to: [650, 180], label: 'success' },
  { from: [560, 215], to: [650, 290], label: 'payment failed' },
  { from: [760, 180], to: [800, 145], label: 'required' },
  { from: [760, 180], to: [1005, 180], label: 'skip' },
  { from: [960, 145], to: [1005, 180] },
  { from: [1130, 180], to: [1190, 70], label: 'approved' },
  { from: [1065, 215], to: [650, 290], label: 'rejected' },
  { from: [1370, 70], to: [1405, 70] },
  { from: [810, 290], to: [840, 290] },
  { from: [990, 290], to: [1025, 290] },
]

const STATUS_STYLE = {
  SCHEDULED: { fill: '#422006', stroke: '#fbbf24', text: '#fde68a', pulse: true, label: 'Queued' },
  IN_PROGRESS: { fill: '#1e3a5f', stroke: '#38bdf8', text: '#7dd3fc', pulse: true, label: 'Running' },
  COMPLETED: { fill: '#14532d', stroke: '#4ade80', text: '#bbf7d0', pulse: false, label: 'Done' },
  FAILED: { fill: '#450a0a', stroke: '#f87171', text: '#fecaca', pulse: false, label: 'Failed' },
  FAILED_WITH_TERMINAL_ERROR: { fill: '#450a0a', stroke: '#f87171', text: '#fecaca', pulse: false, label: 'Failed' },
  TIMED_OUT: { fill: '#450a0a', stroke: '#f87171', text: '#fecaca', pulse: false, label: 'Timed out' },
  COMPLETED_WITH_ERRORS: { fill: '#450a0a', stroke: '#f87171', text: '#fecaca', pulse: false, label: 'Error' },
  CANCELED: { fill: '#1e293b', stroke: '#475569', text: '#64748b', pulse: false, label: 'Canceled' },
  SKIPPED: { fill: '#1e293b', stroke: '#475569', text: '#64748b', pulse: false, label: 'Skipped' },
  PENDING: { fill: '#0f172a', stroke: '#334155', text: '#475569', pulse: false, label: 'Pending' },
}

const TERMINAL_WORKFLOW_STATUSES = new Set(['COMPLETED', 'FAILED', 'TERMINATED'])

function styleFor(status) {
  return STATUS_STYLE[status] ?? STATUS_STYLE.PENDING
}

// Prefer the more specific descendant task (e.g. create_shipment_ref inside the
// shipment sub-workflow) over the SUB_WORKFLOW task's own status once it's available.
function statusFor(node, taskMap) {
  const ids = node.altIds ? [...node.altIds, node.id] : [node.id]
  for (const id of ids) {
    if (taskMap[id]) return taskMap[id].status
  }
  return null
}

function badgeStyle(workflowStatus) {
  const s = styleFor(workflowStatus === 'RUNNING' ? 'IN_PROGRESS' : workflowStatus)
  return { background: s.fill, color: s.text, border: `1px solid ${s.stroke}`, padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600 }
}

export default function WorkflowDiagram({ orderId }) {
  const [execution, setExecution] = useState(null)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const data = await orderApi.getWorkflowExecution(orderId)
        if (cancelled) return
        setExecution(data)
        setError(null)
        if (TERMINAL_WORKFLOW_STATUSES.has(data.status) && intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 2000)

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [orderId])

  const taskMap = execution?.tasks ?? {}

  return (
    <div style={{ marginBottom: 18 }}>
      <style>{`
        @keyframes wf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        .wf-pulse { animation: wf-pulse 1.3s ease-in-out infinite; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Live Workflow Execution
        </span>
        {execution?.status && <span style={badgeStyle(execution.status)}>{execution.status}</span>}
      </div>

      <svg viewBox="0 0 1595 340" style={{ width: '100%', height: 'auto', background: '#0f172a', borderRadius: 8 }}>
        <defs>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#475569" />
          </marker>
        </defs>

        {EDGES.map((e, i) => (
          <g key={i}>
            <line x1={e.from[0]} y1={e.from[1]} x2={e.to[0]} y2={e.to[1]}
              stroke="#475569" strokeWidth="1.5" markerEnd="url(#wf-arrow)" />
            {e.label && (
              <text x={(e.from[0] + e.to[0]) / 2} y={(e.from[1] + e.to[1]) / 2 - 8}
                fill="#64748b" fontSize="10" textAnchor="middle">{e.label}</text>
            )}
          </g>
        ))}

        {NODES.map(node => {
          const status = statusFor(node, taskMap)
          const style = styleFor(status)
          const cx = node.x + node.w / 2
          const cy = node.y + node.h / 2

          if (node.shape === 'diamond') {
            const points = `${cx},${node.y} ${node.x + node.w},${cy} ${cx},${node.y + node.h} ${node.x},${cy}`
            return (
              <g key={node.id} className={style.pulse ? 'wf-pulse' : ''}>
                <polygon points={points} fill={style.fill} stroke={style.stroke} strokeWidth="1.5" />
                <text x={cx} y={cy + 4} fill={style.text} fontSize={node.label.length <= 2 ? 18 : 11} fontWeight="600" textAnchor="middle">
                  {node.label}
                </text>
              </g>
            )
          }

          return (
            <g key={node.id} className={style.pulse ? 'wf-pulse' : ''}>
              <rect x={node.x} y={node.y} width={node.w} height={node.h} rx="8"
                fill={style.fill} stroke={style.stroke} strokeWidth="1.5" />
              <text x={cx} y={node.sublabel ? cy - 3 : cy + 4} fill={style.text} fontSize="11" fontWeight="600" textAnchor="middle">
                {node.label}
              </text>
              {node.sublabel && (
                <text x={cx} y={cy + 13} fill={style.text} fontSize="9.5" textAnchor="middle" opacity="0.85">
                  {node.sublabel}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 10, color: '#64748b', flexWrap: 'wrap' }}>
        {[['Pending', 'PENDING'], ['Queued', 'SCHEDULED'], ['Running', 'IN_PROGRESS'], ['Done', 'COMPLETED'], ['Failed', 'FAILED']].map(([label, key]) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: styleFor(key).fill, border: `1.5px solid ${styleFor(key).stroke}` }} />
            {label}
          </span>
        ))}
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 11, marginTop: 6 }}>Workflow status unavailable: {error}</p>}
    </div>
  )
}
