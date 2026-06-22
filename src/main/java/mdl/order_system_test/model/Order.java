package mdl.order_system_test.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Document(collection = "orders")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Order {

    @Id
    private String id;

    @Indexed(unique = true)
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

    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime updatedAt;
}
