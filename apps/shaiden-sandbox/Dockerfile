# syntax=docker/dockerfile:1

FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends iptables \
  && rm -rf /var/lib/apt/lists/* \
  && for uid in $(seq 20000 20099); do \
       adduser --disabled-password --gecos "" --uid "$uid" --no-create-home "sb$uid"; \
     done \
  && mkdir -p /workspaces \
  && chmod 755 /workspaces

WORKDIR /app
COPY apps/shaiden-sandbox/server.py /app/server.py
COPY apps/shaiden-sandbox/entrypoint.sh /app/entrypoint.sh
RUN chmod 755 /app/server.py /app/entrypoint.sh

ENV SANDBOX_WORKSPACE_ROOT=/workspaces \
  SANDBOX_HOST=0.0.0.0 \
  SANDBOX_PORT=8080 \
  PYTHONDONTWRITEBYTECODE=1

EXPOSE 8080
VOLUME ["/workspaces"]
ENTRYPOINT ["/app/entrypoint.sh"]
