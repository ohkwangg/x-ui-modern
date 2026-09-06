FROM golang:1.27.1 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/x-ui .

FROM debian:bookworm-slim
ARG TARGETARCH
ARG XRAY_VERSION=v26.3.27
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/local/x-ui
RUN set -eux; \
    case "$TARGETARCH" in amd64) asset=Xray-linux-64.zip;; arm64) asset=Xray-linux-arm64-v8a.zip;; s390x) asset=Xray-linux-s390x.zip;; *) exit 1;; esac; \
    curl -fL --retry 3 "https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/${asset}" -o /tmp/xray.zip; \
    mkdir bin; unzip -q /tmp/xray.zip -d bin; mv bin/xray "bin/xray-linux-${TARGETARCH}"; \
    chmod +x "bin/xray-linux-${TARGETARCH}"; rm /tmp/xray.zip
COPY --from=builder /out/x-ui ./x-ui
VOLUME ["/etc/x-ui"]
ENTRYPOINT ["./x-ui"]
