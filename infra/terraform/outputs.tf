output "api_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "web_url" {
  value = google_cloud_run_v2_service.web.uri
}

output "artifact_registry" {
  value = local.registry
}

output "github_wif_provider" {
  description = "Set as the GCP_WIF_PROVIDER variable on the GitHub Environment"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "github_deploy_service_account" {
  description = "Set as the GCP_DEPLOY_SA variable on the GitHub Environment"
  value       = google_service_account.deployer.email
}

output "name_prefix" {
  description = "Set as the NAME_PREFIX variable on the GitHub Environment"
  value       = local.prefix
}

output "media_bucket" {
  value = google_storage_bucket.media.name
}
