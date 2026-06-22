# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM eclipse-temurin:17-jdk AS builder
WORKDIR /app

# Cache Gradle wrapper & dependency downloads before copying source
COPY gradlew .
COPY gradle/ gradle/
COPY build.gradle settings.gradle ./
RUN chmod +x gradlew && ./gradlew dependencies --no-daemon --quiet

# Compile and package (skip tests — they run in CI)
COPY src/ src/
COPY conductor-workflow.json conductor-taskdefs.json ./
RUN ./gradlew bootJar --no-daemon -x test

# ── Stage 2: Minimal runtime ────────────────────────────────────────────────
FROM eclipse-temurin:17-jre AS runtime
WORKDIR /app

# Drop to non-root for container security
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
USER appuser

COPY --from=builder /app/build/libs/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
