# Order Fulfillment Saga

A teaching project that demonstrates the **Saga pattern** for distributed transactions using [Netflix Conductor](https://conductor.netflix.com/) as the workflow engine, Spring Boot as the backend, React as the frontend, and MongoDB for persistence.

---

This project models placing an order:

```
                          ┌─────────────────────────────────────┐
                          │         FORK (parallel)              │
  Submit Order            │  reserve_inventory                   │
      │                   │  authorize_payment    ──── all must  │
      ▼                   │  fraud_check               pass      │
  validate_order ─────────┤                                      │
  (INLINE/JS)             └──────────────────┬──────────────────┘
                                             │ JOIN
                                             ▼
                                      saga_decision (SWITCH)
                                     /                    \
                              success                  compensation
                                 │                          │
                          create_shipment          release_inventory
                       (sub-workflow)              void_payment
                                 │
                       update_order_status
```

If all three parallel checks pass → the success path ships the order.  
If any check fails → the compensation path rolls back inventory and voids the payment.

---

## Tech stack

| Layer | Technology |
|---|---|
| Workflow engine | [Orkes Conductor Community](https://github.com/orkes-io/orkes-conductor-community) |
| Backend | Spring Boot 3.3, Java 17 |
| Workers | Custom polling loop via `RestTemplate` (no Orkes Cloud required) |
| Database | MongoDB 7 |
| Frontend | React + Vite + Nginx |
| Infrastructure | Docker Compose |

---

## Running locally

**Prerequisites:** Docker Desktop, ports 3000 / 8080 / 8085 / 27017 free.

```bash
# 1. Start everything
docker compose up --build

# Wait ~90 s for Conductor to finish booting, then:

# 2. Register the workflow definition in Conductor
#    Open http://localhost:8085 → Definitions → Workflows → New Workflow
#    Paste the contents of conductor-workflow.json and save.

# 3. Open the app
open http://localhost:3000
```

The backend is at `http://localhost:8080`, Conductor UI at `http://localhost:8085`.

---

## Services

| Container | Port | Purpose |
|---|---|---|
| `order-frontend` | 3000 | React UI |
| `order-backend` | 8080 | Spring Boot API |
| `order-conductor` | 8085 | Conductor workflow engine |
| `order-mongodb` | 27017 | MongoDB |

---

## Trying the saga

The frontend has two preset buttons:

- **Fill Valid Order** — a normal $299.99 order that follows the success path all the way to shipment.
- **Fill High-Value / Chaos** — a $15,000 order that triggers the fraud check failure and exercises the compensation branch.

After submitting, open the Conductor UI at `http://localhost:8085`, navigate to **Executions → Workflows**, and watch the saga execute in real time. You can see each task transition through `SCHEDULED → IN_PROGRESS → COMPLETED`.

---

## Project layout

```
src/main/java/mdl/order_system_test/
├── config/
│   └── ConductorConfig.java        # RestTemplate bean + @EnableScheduling
├── controller/
│   └── OrderController.java
├── dto/                            # Request / response shapes
├── model/                          # Order, AuditLog, OrderItem
├── repository/                     # MongoDB repos
├── service/
│   ├── OrderService.java           # Saves order, starts workflow via RestTemplate
│   ├── WorkerPollingService.java   # @Scheduled: polls Conductor every 250 ms
│   ├── InventoryService.java
│   ├── PaymentService.java
│   └── ShipmentService.java
└── worker/                         # One Worker per Conductor task type
    ├── ReserveInventoryWorker.java
    ├── AuthorizePaymentWorker.java
    ├── FraudCheckWorker.java
    ├── CreateShipmentWorker.java
    ├── ReleaseInventoryWorker.java
    ├── VoidPaymentWorker.java
    └── UpdateOrderStatusWorker.java

frontend/src/
└── components/
    └── OrderForm.jsx

conductor-workflow.json             # Workflow + sub-workflow definitions
```

---

## How the worker polling works

Rather than using the Orkes Cloud SDK (which requires credentials and doesn't work against the community server), the backend uses a simple `@Scheduled` loop:

```
every 250 ms:
  for each worker:
    GET /api/tasks/poll/{taskType}?workerid=order-backend-1
    if 200 and body has a taskId:
      execute the worker
      POST /api/tasks   ← updates result back to Conductor
```

This is all standard Netflix Conductor REST API — no proprietary client needed.

---

## No API keys required

This project runs entirely locally. There is no dependency on Orkes Cloud.  
A `.env` file (gitignored) can optionally hold Orkes Cloud credentials if you want to point the backend at a cloud-hosted Conductor instead:

```
CONDUCTOR_SERVER_URL=https://developer.orkescloud.com/api
CONDUCTOR_CLIENT_KEY_ID=...
CONDUCTOR_CLIENT_SECRET=...
```

But for local Docker usage, none of that is needed.
