{{/*
Expand the name of the chart.
*/}}
{{- define "keidai.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "keidai.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "keidai.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: keidai
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{- define "keidai.publicUrl" -}}
{{- $url := .Values.publicUrl | default "" | trimSuffix "/" -}}
{{- if eq $url "" -}}
{{- fail "publicUrl is required (browser origin for the BFF, e.g. https://keidai.example.com). Pass --set publicUrl=... — a placeholder would break Google OAuth, cookies, and Torii callbacks." -}}
{{- end -}}
{{- $url -}}
{{- end }}

{{- define "keidai.cookieSecure" -}}
{{- if hasPrefix "https://" (include "keidai.publicUrl" .) -}}true{{- else -}}false{{- end -}}
{{- end }}

{{- define "keidai.image" -}}
{{- $repo := index . 0 -}}
{{- $root := index . 1 -}}
{{- $registry := $root.Values.image.registry | default "" | trimSuffix "/" -}}
{{- $tag := $root.Values.image.tag | default $root.Chart.AppVersion -}}
{{- if $registry -}}
{{ printf "%s/%s:%s" $registry $repo $tag }}
{{- else -}}
{{ printf "%s:%s" $repo $tag }}
{{- end -}}
{{- end }}

{{- define "keidai.imagePullSecrets" -}}
{{- with .Values.imagePullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}

{{- define "keidai.postgresWaitCommand" -}}
until pg_isready -h {{ .Values.postgres.host | default "postgres" }} -U postgres; do sleep 1; done
{{- end }}

{{/*
Wait until Postgres accepts connections and this app's schema_migrations table
exists (migrate Job has finished). Pair with envFrom keidai-secrets.
*/}}
{{- define "keidai.appDbWaitCommand" -}}
{{- $root := index . 0 -}}
{{- $urlEnv := index . 1 -}}
{{ include "keidai.postgresWaitCommand" $root }}; until psql {{ printf `"$%s"` $urlEnv }} -c "SELECT 1 FROM schema_migrations LIMIT 1" >/dev/null 2>&1; do sleep 1; done
{{- end }}

{{/*
Checksum of ConfigMaps that feed envFrom / mounts so pods restart on change.
*/}}
{{- define "keidai.configChecksum" -}}
{{- $cfg := include (print $.Template.BasePath "/configmaps.yaml") . | sha256sum -}}
{{- $ops := include (print $.Template.BasePath "/operators-configmap.yaml") . | sha256sum -}}
{{- $torii := include (print $.Template.BasePath "/torii-configmap.yaml") . | sha256sum -}}
{{- printf "%s-%s-%s" $cfg $ops $torii | sha256sum -}}
{{- end }}

{{- define "keidai.secretChecksum" -}}
{{- include (print $.Template.BasePath "/secrets.yaml") . | sha256sum -}}
{{- end }}
