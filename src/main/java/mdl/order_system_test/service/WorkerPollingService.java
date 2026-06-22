package mdl.order_system_test.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.netflix.conductor.client.worker.Worker;
import com.netflix.conductor.common.metadata.tasks.Task;
import com.netflix.conductor.common.metadata.tasks.TaskResult;
import lombok.extern.slf4j.Slf4j;
import mdl.order_system_test.worker.SimulatedTaskTimeoutException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class WorkerPollingService {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final List<Worker> workers;
    private final RestTemplate restTemplate;
    private final String conductorUrl;
    private final ObjectMapper mapper;

    public WorkerPollingService(
            List<Worker> workers,
            @Qualifier("conductorRestTemplate") RestTemplate restTemplate,
            @Value("${conductor.server.url}") String conductorUrl) {
        this.workers = workers;
        this.restTemplate = restTemplate;
        this.conductorUrl = conductorUrl;
        this.mapper = new ObjectMapper();
        log.info("WorkerPollingService initialized — polling {} workers at {}", workers.size(), conductorUrl);
    }

    @Scheduled(fixedDelay = 250)
    public void pollAndExecute() {
        for (Worker worker : workers) {
            try {
                String url = conductorUrl + "/tasks/poll/" + worker.getTaskDefName() + "?workerid=order-backend-1";
                // 204 → null, 200 → JSON string
                String body = restTemplate.getForObject(url, String.class);
                if (body == null || body.isBlank() || body.equals("null")) {
                    continue;
                }

                Map<String, Object> raw = mapper.readValue(body, MAP_TYPE);
                String taskId = (String) raw.get("taskId");
                if (taskId == null) {
                    continue;
                }

                // Build a minimal Task; workers only call getInputData(), getTaskId(), etc.
                Task task = buildTask(raw);

                log.info("[{}] claimed task={} retryCount={} pollCount={} responseTimeoutSeconds={}",
                        worker.getTaskDefName(),
                        taskId,
                        task.getRetryCount(),
                        task.getPollCount(),
                        task.getResponseTimeoutSeconds());
                TaskResult result;
                try {
                    result = worker.execute(task);
                } catch (SimulatedTaskTimeoutException e) {
                    log.warn("[{}] leaving task={} unacknowledged for response-timeout demo: {}",
                            worker.getTaskDefName(), taskId, e.getMessage());
                    continue;
                } catch (Exception e) {
                    result = failedResult(task, e);
                }

                // Serialize TaskResult as plain JSON and POST back to Conductor
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                HttpEntity<String> entity = new HttpEntity<>(mapper.writeValueAsString(result), headers);
                restTemplate.postForObject(conductorUrl + "/tasks", entity, String.class);

                log.info("[{}] updated task={} status={}", worker.getTaskDefName(), taskId, result.getStatus());

            } catch (Exception e) {
                log.debug("[{}] poll error: {}", worker.getTaskDefName(), e.getMessage());
            }
        }
    }

    @SuppressWarnings("unchecked")
    private Task buildTask(Map<String, Object> raw) {
        Task task = new Task();
        task.setTaskId((String) raw.get("taskId"));
        task.setTaskType((String) raw.get("taskType"));
        task.setTaskDefName((String) raw.getOrDefault("taskDefName", raw.get("taskType")));
        task.setReferenceTaskName((String) raw.get("referenceTaskName"));
        task.setWorkflowInstanceId((String) raw.get("workflowInstanceId"));
        task.setWorkflowType((String) raw.get("workflowType"));
        task.setCorrelationId((String) raw.get("correlationId"));
        task.setRetryCount(toInt(raw.get("retryCount")));
        task.setPollCount(toInt(raw.get("pollCount")));
        task.setResponseTimeoutSeconds(toLong(raw.get("responseTimeoutSeconds")));
        task.setWorkerId("order-backend-1");
        task.setStatus(Task.Status.IN_PROGRESS);

        Object inputDataObj = raw.get("inputData");
        if (inputDataObj instanceof Map) {
            task.setInputData((Map<String, Object>) inputDataObj);
        } else {
            task.setInputData(new HashMap<>());
        }
        return task;
    }

    private TaskResult failedResult(Task task, Exception e) {
        TaskResult result = new TaskResult(task);
        result.setStatus(TaskResult.Status.FAILED);
        result.setReasonForIncompletion(e.getMessage());
        result.log(e.getClass().getSimpleName() + ": " + e.getMessage());
        return result;
    }

    private int toInt(Object value) {
        return value instanceof Number ? ((Number) value).intValue() : 0;
    }

    private long toLong(Object value) {
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }
}
