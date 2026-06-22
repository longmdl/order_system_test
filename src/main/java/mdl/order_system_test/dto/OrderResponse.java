package mdl.order_system_test.dto;

import lombok.Builder;
import lombok.Data;
import mdl.order_system_test.model.OrderItem;
import mdl.order_system_test.model.OrderStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
public class OrderResponse {
    private String id;
    private String orderId;
    private String customerId;
    private BigDecimal amount;
    private List<OrderItem> items;
    private OrderStatus status;
    private String workflowId;
    private String failureReason;
    private String trackingNumber;
    private Integer demoPaymentFailures;
    private Boolean simulatePaymentTimeout;
    private Boolean requireApproval;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
