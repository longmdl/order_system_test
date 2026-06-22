package mdl.order_system_test.worker;

import com.netflix.conductor.client.worker.Worker;
import com.netflix.conductor.common.metadata.tasks.Task;
import com.netflix.conductor.common.metadata.tasks.TaskResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import mdl.order_system_test.service.ChaosToggleService;
import mdl.order_system_test.service.PaymentService;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Component
@RequiredArgsConstructor
public class AuthorizePaymentWorker implements Worker {

    private final PaymentService paymentService;
    private final ChaosToggleService chaosToggleService;
    private final ConcurrentHashMap<String, AtomicInteger> attemptsByOrderId = new ConcurrentHashMap<>();

    @Override
    public String getTaskDefName() {
        return "authorize_payment";
    }

    @Override
    public TaskResult execute(Task task) {
        String orderId    = (String) task.getInputData().get("orderId");
        String customerId = (String) task.getInputData().get("customerId");
        BigDecimal amount = new BigDecimal(task.getInputData().get("amount").toString());
        int demoPaymentFailures = toInt(task.getInputData().get("demoPaymentFailures"));
        boolean simulatePaymentTimeout = toBoolean(task.getInputData().get("simulatePaymentTimeout"));
        int attempt = attemptsByOrderId.computeIfAbsent(orderId, ignored -> new AtomicInteger()).incrementAndGet();

        log.info("[authorize_payment] orderId={} amount={} attempt={} demoFailures={} timeoutDemo={} taskRetryCount={} chaos={}",
                orderId,
                amount,
                attempt,
                demoPaymentFailures,
                simulatePaymentTimeout,
                task.getRetryCount(),
                chaosToggleService.isChaosEnabled());

        if (simulatePaymentTimeout && attempt == 1) {
            long responseTimeoutSeconds = task.getResponseTimeoutSeconds() > 0 ? task.getResponseTimeoutSeconds() : 6;
            throw new SimulatedTaskTimeoutException(
                    "No task update will be sent; Conductor should requeue after responseTimeoutSeconds="
                            + responseTimeoutSeconds);
        }

        if (attempt <= demoPaymentFailures) {
            TaskResult failed = new TaskResult(task);
            failed.setStatus(TaskResult.Status.FAILED);
            failed.setReasonForIncompletion(
                    "Demo payment gateway failure on attempt " + attempt + " of " + (demoPaymentFailures + 1));
            failed.log("Demo retry failure: attempt " + attempt + " will be retried by Conductor");
            return failed;
        }

        // ── Chaos Mode ───────────────────────────────────────────────────────
        // Roll once; two outcomes to exercise both Conductor mechanics:
        //   < 0.4  → throws exception  → Conductor retries the task (timeout/retry demo)
        //   >= 0.4 → returns false     → SWITCH routes to compensation branch (saga demo)
        if (chaosToggleService.isChaosEnabled()) {
            double roll = Math.random();
            if (roll < 0.4) {
                log.warn("[CHAOS] Simulating gateway timeout for order={} — Conductor will retry", orderId);
                throw new RuntimeException("Payment gateway timeout (chaos mode)");
            }
            log.warn("[CHAOS] Payment declined for order={} — compensation branch will run", orderId);
            attemptsByOrderId.remove(orderId);
            TaskResult declined = new TaskResult(task);
            declined.setStatus(TaskResult.Status.COMPLETED);
            declined.addOutputData("paymentAuthorized", false);
            declined.addOutputData("reason", "Payment declined by issuer (chaos mode)");
            return declined;
        }
        // ─────────────────────────────────────────────────────────────────────

        String authCode = paymentService.authorize(orderId, customerId, amount);
        attemptsByOrderId.remove(orderId);

        TaskResult result = new TaskResult(task);
        result.setStatus(TaskResult.Status.COMPLETED);
        result.addOutputData("paymentAuthorized", true);
        result.addOutputData("authCode", authCode);
        return result;
    }

    private int toInt(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value == null) {
            return 0;
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private boolean toBoolean(Object value) {
        return value instanceof Boolean b ? b : Boolean.parseBoolean(String.valueOf(value));
    }
}
