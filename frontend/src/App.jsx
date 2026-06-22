import { useState, useEffect, useCallback } from 'react'
import OrderForm from './components/OrderForm'
import OrderGrid from './components/OrderGrid'
import ChaosToggle from './components/ChaosToggle'
import { orderApi } from './api/orderApi'

export default function App() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandOrderId, setExpandOrderId] = useState(null)

  const fetchOrders = useCallback(async () => {
    try {
      const data = await orderApi.getAllOrders()
      setOrders(data)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleOrderCreated = useCallback((orderId) => {
    fetchOrders()
    setExpandOrderId(orderId)
  }, [fetchOrders])

  // Initial load + auto-refresh every 5 seconds to pick up workflow status updates
  useEffect(() => {
    fetchOrders()
    const id = setInterval(fetchOrders, 5000)
    return () => clearInterval(id)
  }, [fetchOrders])

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>
          Order Fulfillment Saga
        </h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>
          Saga pattern demo — Orkes Conductor + Spring Boot + MongoDB
        </p>
      </div>

      {/* ── Chaos Mode Toggle ── */}
      <div style={{ marginBottom: 28 }}>
        <ChaosToggle />
      </div>

      {/* ── New Order Form ── */}
      <section style={{ background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 18 }}>New Order</h2>
        <OrderForm onOrderCreated={handleOrderCreated} />
      </section>

      {/* ── Orders Dashboard ── */}
      <section style={{ background: '#1e293b', borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Orders ({orders.length})</h2>
          <button onClick={fetchOrders}
            style={{ background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', padding: '5px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 12 }}>
            Refresh
          </button>
        </div>
        <OrderGrid
          orders={orders}
          loading={loading}
          expandOrderId={expandOrderId}
          onOrderChanged={fetchOrders}
        />
      </section>

      <p style={{ color: '#334155', fontSize: 11, textAlign: 'center', marginTop: 24 }}>
        Dashboard auto-refreshes every 5 s to reflect workflow status changes from Conductor.
      </p>
    </div>
  )
}
