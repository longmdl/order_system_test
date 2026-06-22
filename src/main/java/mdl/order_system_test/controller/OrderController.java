package mdl.order_system_test.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import mdl.order_system_test.dto.CreateOrderRequest;
import mdl.order_system_test.dto.OrderResponse;
import mdl.order_system_test.dto.WorkflowExecutionResponse;
import mdl.order_system_test.model.AuditLog;
import mdl.order_system_test.service.OrderService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @PostMapping
    public ResponseEntity<OrderResponse> createOrder(@Valid @RequestBody CreateOrderRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(orderService.createOrder(request));
    }

    @GetMapping
    public ResponseEntity<List<OrderResponse>> getAllOrders() {
        return ResponseEntity.ok(orderService.getAllOrders());
    }

    @GetMapping("/{orderId}")
    public ResponseEntity<OrderResponse> getOrder(@PathVariable String orderId) {
        return ResponseEntity.ok(orderService.getOrderById(orderId));
    }

    @GetMapping("/{orderId}/logs")
    public ResponseEntity<List<AuditLog>> getOrderLogs(@PathVariable String orderId) {
        return ResponseEntity.ok(orderService.getAuditLogs(orderId));
    }

    @GetMapping("/{orderId}/workflow")
    public ResponseEntity<WorkflowExecutionResponse> getWorkflowExecution(@PathVariable String orderId) {
        return ResponseEntity.ok(orderService.getWorkflowExecution(orderId));
    }

    @PostMapping("/{orderId}/approval")
    public ResponseEntity<OrderResponse> completeManualApproval(
            @PathVariable String orderId,
            @RequestBody Map<String, Object> body) {
        boolean approved = Boolean.TRUE.equals(body.get("approved"));
        String reviewer = body.get("reviewer") instanceof String ? (String) body.get("reviewer") : "demo-reviewer";
        String reason = body.get("reason") instanceof String ? (String) body.get("reason") : "";
        return ResponseEntity.ok(orderService.completeManualApproval(orderId, approved, reviewer, reason));
    }
}
