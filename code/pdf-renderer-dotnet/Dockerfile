FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG ALL_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG all_proxy
ARG no_proxy
ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    ALL_PROXY=${ALL_PROXY} \
    NO_PROXY=${NO_PROXY} \
    http_proxy=${http_proxy} \
    https_proxy=${https_proxy} \
    all_proxy=${all_proxy} \
    no_proxy=${no_proxy} \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1
WORKDIR /src
COPY code/pdf-renderer-dotnet/BudgetCentre.PdfRenderer/BudgetCentre.PdfRenderer.csproj ./BudgetCentre.PdfRenderer/
RUN dotnet restore ./BudgetCentre.PdfRenderer/BudgetCentre.PdfRenderer.csproj --verbosity minimal
COPY code/pdf-renderer-dotnet/BudgetCentre.PdfRenderer ./BudgetCentre.PdfRenderer
RUN dotnet publish ./BudgetCentre.PdfRenderer/BudgetCentre.PdfRenderer.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/runtime:10.0-alpine AS runtime
WORKDIR /app
RUN mkdir -p /app/storage/exports /app/storage/tmp/pdf /app/storage/logs /app/font
ENV EXPORT_STORAGE_DIR=/app/storage/exports \
    EXPORT_TEMP_DIR=/app/storage/tmp/pdf \
    APP_LOG_DIR=/app/storage/logs \
    FONT_DIR=/app/font \
    PDF_RENDERER_MIN_WORKERS=1 \
    PDF_RENDERER_MAX_WORKERS=4 \
    PDF_RENDERER_BATCH_SIZE=1000 \
    PDF_RENDERER_LARGE_ROW_THRESHOLD=100000 \
    PDF_RENDERER_LARGE_JOB_CONCURRENCY=2 \
    PDF_RENDERER_POLL_MS=100 \
    PDF_RENDERER_LOCK_TIMEOUT_SECONDS=300
COPY --from=build /out ./
CMD ["dotnet", "BudgetCentre.PdfRenderer.dll"]
