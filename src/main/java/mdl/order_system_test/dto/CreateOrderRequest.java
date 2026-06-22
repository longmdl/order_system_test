package mdl.order_system_test.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import mdl.order_system_test.model.OrderItem;

import java.math.BigDecimal;
import java.util.List;

@Data
public class CreateOrderRequest {

    @NotBlank(message = "orderId is required")
    private String orderId;

    @NotBlank(message = "customerId is required")
    private String customerId;

    @NotNull(message = "amount is required")
    @DecimalMin(value = "0.01", message = "amount must be greater than 0")
    private BigDecimal amount;

    @NotEmpty(message = "at least one item is required")
    private List<OrderItem> items;

    @Min(value = 0, message = "demoPaymentFailures must be 0, 1, or 2")
    @Max(value = 2, message = "demoPaymentFailures must be 0, 1, or 2")
    private Integer demoPaymentFailures = 0;

    private Boolean simulatePaymentTimeout = false;

    private Boolean requireApproval = false;
}
