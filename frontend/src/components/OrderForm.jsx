import { useState } from 'react'
import { orderApi } from '../api/orderApi'

const defaultItem = { productId: '', productName: '', quantity: 1, unitPrice: '' }

const uid = () => Date.now().toString(36).toUpperCase()

const VALID_PRESET = () => ({
  orderId: `ORD-${uid()}`,
  customerId: 'CUST-42',
  amount: '299.99',
  demoPaymentFailures: 0,
  simulatePaymentTimeout: false,
  requireApproval: false,
  items: [
    { productId: 'PROD-001', productName: 'Wireless Headphones', quantity: 1, unitPrice: '199.99' },
    { productId: 'PROD-002', productName: 'USB-C Cable',         quantity: 2, unitPrice: '49.99'  },
  ],
})

// Amount >$10 000 triggers HIGH fraud-risk flag in FraudCheckWorker;
// combined with Chaos Mode it routes to the compensation branch.
const INVALID_PRESET = () => ({
  orderId: `ORD-HV-${uid()}`,
  customerId: 'CUST-99',
  amount: '15000.00',
  demoPaymentFailures: 0,
  simulatePaymentTimeout: false,
  requireApproval: false,
  items: [
    { productId: 'PROD-LUX-001', productName: 'Diamond Watch', quantity: 1, unitPrice: '15000.00' },
  ],
})

const RETRY_APPROVAL_PRESET = () => ({
  orderId: `ORD-RETRY-${uid()}`,
  customerId: 'CUST-77',
  amount: '499.99',
  demoPaymentFailures: 2,
  simulatePaymentTimeout: false,
  requireApproval: true,
  items: [
    { productId: 'PROD-RET-001', productName: 'Laptop Dock', quantity: 1, unitPrice: '499.99' },
  ],
})

const EMPTY_FORM = () => ({
  orderId: '',
  customerId: '',
  amount: '',
  demoPaymentFailures: 0,
  simulatePaymentTimeout: false,
  requireApproval: false,
  items: [{ ...defaultItem }],
})

export default function OrderForm({ onOrderCreated }) {
  const [form, setForm] = useState(EMPTY_FORM())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const updateField = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const updateItem = (idx, key, val) =>
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [key]: val }
      return { ...f, items }
    })

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { ...defaultItem }] }))
  const removeItem = idx => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount),
        demoPaymentFailures: parseInt(form.demoPaymentFailures),
        simulatePaymentTimeout: Boolean(form.simulatePaymentTimeout),
        requireApproval: Boolean(form.requireApproval),
        items: form.items.map(it => ({ ...it, quantity: parseInt(it.quantity), unitPrice: parseFloat(it.unitPrice) })),
      }
      await orderApi.createOrder(payload)
      onOrderCreated(payload.orderId)
      setForm(EMPTY_FORM())
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
    color: '#e2e8f0', padding: '6px 10px', fontSize: 13, width: '100%',
  }
  const labelStyle = { fontSize: 12, color: '#94a3b8', marginBottom: 3, display: 'block' }
  const checkboxLabelStyle = { display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 12 }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Quick-fill presets ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>Quick fill:</span>
        <button type="button" onClick={() => setForm(VALID_PRESET())}
          style={{
            fontSize: 12, padding: '4px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
            background: '#14532d', border: '1px solid #16a34a', color: '#4ade80',
          }}>
          Valid Order
        </button>
        <button type="button" onClick={() => setForm(INVALID_PRESET())}
          style={{
            fontSize: 12, padding: '4px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
            background: '#431407', border: '1px solid #ea580c', color: '#fb923c',
          }}>
          High-Value (Fraud / Chaos)
        </button>
        <button type="button" onClick={() => setForm(RETRY_APPROVAL_PRESET())}
          style={{
            fontSize: 12, padding: '4px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
            background: '#172554', border: '1px solid #2563eb', color: '#93c5fd',
          }}>
          Retry + Approval
        </button>
        <span style={{ fontSize: 11, color: '#475569' }}>IDs are unique per click</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Order ID</label>
          <input style={inputStyle} value={form.orderId}
            onChange={e => updateField('orderId', e.target.value)} placeholder="ORD-001" required />
        </div>
        <div>
          <label style={labelStyle}>Customer ID</label>
          <input style={inputStyle} value={form.customerId}
            onChange={e => updateField('customerId', e.target.value)} placeholder="CUST-42" required />
        </div>
        <div>
          <label style={labelStyle}>Total Amount ($)</label>
          <input style={inputStyle} type="number" min="0.01" step="0.01"
            value={form.amount} onChange={e => updateField('amount', e.target.value)} placeholder="99.99" required />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={labelStyle}>Payment Retry Demo</label>
          <select style={inputStyle} value={form.demoPaymentFailures}
            onChange={e => updateField('demoPaymentFailures', e.target.value)}>
            <option value={0}>No forced failures</option>
            <option value={1}>Fail once, succeed on 2nd attempt</option>
            <option value={2}>Fail twice, succeed on 3rd attempt</option>
          </select>
        </div>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={form.simulatePaymentTimeout}
            onChange={e => updateField('simulatePaymentTimeout', e.target.checked)} />
          Simulate one payment response timeout
        </label>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={form.requireApproval}
            onChange={e => updateField('requireApproval', e.target.checked)} />
          Require manual approval before shipment
        </label>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Items</span>
          <button type="button" onClick={addItem}
            style={{ fontSize: 12, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}>
            + Add Item
          </button>
        </div>
        {form.items.map((item, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 100px 32px', gap: 8, marginBottom: 8 }}>
            <input style={inputStyle} placeholder="Product ID" value={item.productId}
              onChange={e => updateItem(idx, 'productId', e.target.value)} required />
            <input style={inputStyle} placeholder="Product Name" value={item.productName}
              onChange={e => updateItem(idx, 'productName', e.target.value)} required />
            <input style={inputStyle} type="number" min="1" placeholder="Qty" value={item.quantity}
              onChange={e => updateItem(idx, 'quantity', e.target.value)} required />
            <input style={inputStyle} type="number" min="0.01" step="0.01" placeholder="Unit $" value={item.unitPrice}
              onChange={e => updateItem(idx, 'unitPrice', e.target.value)} required />
            <button type="button" onClick={() => removeItem(idx)}
              style={{ background: '#450a0a', border: 'none', color: '#f87171', borderRadius: 5, cursor: 'pointer', fontSize: 16 }}>
              ×
            </button>
          </div>
        ))}
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}

      <button type="submit" disabled={submitting}
        style={{
          background: submitting ? '#334155' : '#2563eb', border: 'none', color: '#fff',
          padding: '10px 24px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer',
          alignSelf: 'flex-start',
        }}>
        {submitting ? 'Submitting…' : 'Submit Order'}
      </button>
    </form>
  )
}
