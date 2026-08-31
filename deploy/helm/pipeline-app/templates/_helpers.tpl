{{- define "pipeline-app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "pipeline-app.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "pipeline-app.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Every object carries these. Only the selector labels below may never change. */}}
{{- define "pipeline-app.labels" -}}
helm.sh/chart: {{ include "pipeline-app.chart" . }}
{{ include "pipeline-app.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: ci-cd-pipeline
{{- end -}}

{{/*
Selector labels are immutable on a Deployment. Adding the chart version here
would make every chart bump an unpatchable field and force a manual delete.
*/}}
{{- define "pipeline-app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "pipeline-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "pipeline-app.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "pipeline-app.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
A digest wins over a tag when CI supplies one: a tag is a pointer someone can
move between the scan and the deploy, a digest is the exact image that was
tested. Falls back to the tag, then to appVersion, so the chart stays
installable by hand.
*/}}
{{- define "pipeline-app.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion -}}
{{- printf "%s:%s" .Values.image.repository $tag -}}
{{- end -}}
{{- end -}}
