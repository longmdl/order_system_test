package mdl.order_system_test.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.netflix.conductor.common.metadata.workflow.StartWorkflowRequest;
import lombok.extern.slf4j.Slf4j;
import mdl.order_system_test.dto.CreateOrderRequest;
import mdl.order_system_test.dto.OrderResponse;
import mdl.order_system_test.dto.WorkflowExecutionResponse;
import mdl.order_system_test.model.AuditLog;
import mdl.order_system_test.model.Order;
import mdl.order_system_test.model.OrderStatus;
import mdl.order_system_test.repository.AuditLogRepository;
import mdl.order_system_test.repository.OrderRepository;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
public class OrderService {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final OrderRepository orderRepository;
    private final AuditLogRepository auditLogRepository;
    private final RestTemplate restTemplate;
    private final String conductorUrl;
    private final ObjectMapper objectMapper;

    public OrderService(
            OrderRepository orderRepository,
            AuditLogRepository auditLogRepository,
            @Qualifier("conductorRestTemplate") RestTemplate restTemplate,
            @Value("${conductor.server.url}") String conductorUrl,
            ObjectMapper objectMapper) {
        this.orderRepository = orderRepository;
        this.auditLogRepository = auditLogRepository;
        this.restTemplate = restTemplate;
        this.conductorUrl = conductorUrl;
        this.objectMapper = objectMapper;
    }

    public OrderResponse createOrder(CreateOrderRequest request) {
        Order order = Order.builder()
                .orderId(request.getOrderId())
                .customerId(request.getCustomerId())
                .amount(request.getAmount())
                .items(request.getItems())
                .status(OrderStatus.PENDING)
                .demoPaymentFailures(defaultInt(request.getDemoPaymentFailures()))
                .simulatePaymentTimeout(defaultBoolean(request.getSimulatePaymentTimeout()))
                .requireApproval(defaultBoolean(request.getRequireApproval()))
                .build();

        order = orderRepository.save(order);
        log.info("Order {} saved, triggering workflow", order.getOrderId());

        StartWorkflowRequest wfRequest = new StartWorkflowRequest();
        wfRequest.setName("order_fulfillment_saga");
        wfRequest.setVersion(1);
        wfRequest.setCorrelationId(order.getOrderId());
        wfRequest.setInput(buildWorkflowInput(order));

        ResponseEntity<String> wfResponse = restTemplate.postForEntity(
                conductorUrl + "/workflow", wfRequest, String.class);
        String workflowId = wfResponse.getBody();
        log.info("Workflow started: id={}", workflowId);

        order.setWorkflowId(workflowId);
        order = orderRepository.save(order);

        auditLogRepository.save(AuditLog.builder()
                .orderId(order.getOrderId())
                .action("WORKFLOW_STARTED")
                .details("workflowId=" + workflowId)
                .timestamp(LocalDateTime.now())
                .build());

        return toResponse(order);
    }

    public List<OrderResponse> getAllOrders() {
        return orderRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public OrderResponse getOrderById(String orderId) {
        return orderRepository.findByOrderId(orderId)
                .map(this::toResponse)
                .orElseThrow(() -> new RuntimeException("Order not found: " + orderId));
    }

    public OrderResponse updateStatus(String orderId, OrderStatus status, String reason, String trackingNumber) {
        Order order = orderRepository.findByOrderId(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found: " + orderId));
        order.setStatus(status);
        order.setFailureReason(reason);
        order.setTrackingNumber(trackingNumber);
        order.setUpdatedAt(LocalDateTime.now());
        return toResponse(orderRepository.save(order));
    }

    public List<AuditLog> getAuditLogs(String orderId) {
        return auditLogRepository.findByOrderIdOrderByTimestampAsc(orderId);
    }

    public OrderResponse completeManualApproval(String orderId, boolean approved, String reviewer, String reason) {
        Order order = orderRepository.findByOrderId(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found: " + orderId));
        if (!Boolean.TRUE.equals(order.getRequireApproval())) {
            throw new RuntimeException("Order does not require manual approval: " + orderId);
        }
        if (order.getWorkflowId() == null || order.getWorkflowId().isBlank()) {
            throw new RuntimeException("Order workflow has not started yet: " + orderId);
        }

        Map<String, Object> output = new HashMap<>();
        output.put("approved", approved);
        output.put("reviewer", reviewer == null || reviewer.isBlank() ? "demo-reviewer" : reviewer);
        output.put("reason", reason == null ? "" : reason);
        output.put("approvedAt", LocalDateTime.now().toString());

        restTemplate.postForEntity(
                conductorUrl + "/tasks/" + order.getWorkflowId()
                        + "/manual_approval_ref/COMPLETED?workerid=human-demo",
                output,
                String.class);

        auditLogRepository.save(AuditLog.builder()
                .orderId(order.getOrderId())
                .action(approved ? "MANUAL_APPROVAL_APPROVED" : "MANUAL_APPROVAL_REJECTED")
                .details("reviewer=" + output.get("reviewer") + " reason=" + output.get("reason"))
                .timestamp(LocalDateTime.now())
                .build());

        return toResponse(order);
    }

    /**
     * Live execution snapshot for the BPMN-style flow viewer: flattens the top-level
     * workflow's tasks together with any SUB_WORKFLOW's tasks (e.g. shipment_sub_workflow)
     * into a single map keyed by taskReferenceName, mirroring what Conductor's own UI shows.
     */
    public WorkflowExecutionResponse getWorkflowExecution(String orderId) {
        Order order = orderRepository.findByOrderId(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found: " + orderId));

        if (order.getWorkflowId() == null) {
            return WorkflowExecutionResponse.builder()
                    .workflowId(null)
                    .status("NOT_STARTED")
                    .tasks(Map.of())
                    .build();
        }

        Map<String, WorkflowExecutionResponse.TaskStatusInfo> tasks = new LinkedHashMap<>();
        String topLevelStatus;
        try {
            Map<String, Object> workflowJson = fetchWorkflow(order.getWorkflowId());
            topLevelStatus = (String) workflowJson.get("status");
            collectTasks(workflowJson, tasks);
        } catch (Exception e) {
            log.warn("Failed to fetch workflow execution for order {}: {}", orderId, e.getMessage());
            topLevelStatus = "UNKNOWN";
        }

        return WorkflowExecutionResponse.builder()
                .workflowId(order.getWorkflowId())
                .status(topLevelStatus)
                .tasks(tasks)
                .build();
    }

    private Map<String, Object> fetchWorkflow(String workflowId) throws Exception {
        String body = restTemplate.getForObject(
                conductorUrl + "/workflow/" + workflowId + "?includeTasks=true", String.class);
        return objectMapper.readValue(body, MAP_TYPE);
    }

    @SuppressWarnings("unchecked")
    private void collectTasks(Map<String, Object> workflowJson, Map<String, WorkflowExecutionResponse.TaskStatusInfo> out) {
        Object tasksRaw = workflowJson.get("tasks");
        if (!(tasksRaw instanceof List)) {
            return;
        }

        for (Object taskObj : (List<Object>) tasksRaw) {
            if (!(taskObj instanceof Map)) continue;
            Map<String, Object> task = (Map<String, Object>) taskObj;

            String refName = (String) task.get("referenceTaskName");
            if (refName == null) continue;

            String taskType = (String) task.get("taskType");
            out.put(refName, WorkflowExecutionResponse.TaskStatusInfo.builder()
                    .status((String) task.get("status"))
                    .taskType(taskType)
                    .startTime(toLong(task.get("startTime")))
                    .endTime(toLong(task.get("endTime")))
                    .reasonForIncompletion((String) task.get("reasonForIncompletion"))
                    .build());

            if ("SUB_WORKFLOW".equals(taskType)) {
                String subWorkflowId = resolveSubWorkflowId(task);
                if (subWorkflowId != null) {
                    try {
                        collectTasks(fetchWorkflow(subWorkflowId), out);
                    } catch (Exception e) {
                        log.warn("Failed to fetch sub-workflow {} tasks: {}", subWorkflowId, e.getMessage());
                    }
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private String resolveSubWorkflowId(Map<String, Object> task) {
        Object subWorkflowId = task.get("subWorkflowId");
        if (subWorkflowId instanceof String) {
            return (String) subWorkflowId;
        }
        Object outputData = task.get("outputData");
        if (outputData instanceof Map) {
            Object id = ((Map<String, Object>) outputData).get("subWorkflowId");
            if (id instanceof String) return (String) id;
        }
        return null;
    }

    private Long toLong(Object value) {
        return value instanceof Number ? ((Number) value).longValue() : null;
    }

    private Map<String, Object> buildWorkflowInput(Order order) {
        Map<String, Object> input = new HashMap<>();
        input.put("orderId", order.getOrderId());
        input.put("customerId", order.getCustomerId());
        input.put("amount", order.getAmount());
        input.put("items", order.getItems());
        input.put("demoPaymentFailures", defaultInt(order.getDemoPaymentFailures()));
        input.put("simulatePaymentTimeout", defaultBoolean(order.getSimulatePaymentTimeout()));
        input.put("requireApproval", defaultBoolean(order.getRequireApproval()));
        return input;
    }

    private OrderResponse toResponse(Order order) {
        return OrderResponse.builder()
                .id(order.getId())
                .orderId(order.getOrderId())
                .customerId(order.getCustomerId())
                .amount(order.getAmount())
                .items(order.getItems())
                .status(order.getStatus())
                .workflowId(order.getWorkflowId())
                .failureReason(order.getFailureReason())
                .trackingNumber(order.getTrackingNumber())
                .demoPaymentFailures(defaultInt(order.getDemoPaymentFailures()))
                .simulatePaymentTimeout(defaultBoolean(order.getSimulatePaymentTimeout()))
                .requireApproval(defaultBoolean(order.getRequireApproval()))
                .createdAt(order.getCreatedAt())
                .updatedAt(order.getUpdatedAt())
                .build();
    }

    private int defaultInt(Integer value) {
        return value == null ? 0 : value;
    }

    private boolean defaultBoolean(Boolean value) {
        return value != null && value;
    }
}
