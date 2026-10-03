# Construir desde la raíz del repositorio (necesita shared/):
#   docker build -f server/Dockerfile -t casino-server .
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY shared/ shared/
COPY server/.mvn/ server/.mvn/
COPY server/mvnw server/pom.xml server/
WORKDIR /app/server
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline
COPY server/src/ src/
RUN ./mvnw -B -q package -DskipTests

FROM eclipse-temurin:21-jre
RUN useradd --system --no-create-home casino
WORKDIR /app
COPY --from=build /app/server/target/casino-server-*.jar app.jar
USER casino
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
