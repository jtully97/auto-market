# AutoMarket on Google Cloud: Cloud Run (web, api, worker, migrate job),
# Cloud SQL for PostgreSQL, Cloud Storage for media, Secret Manager,
# Artifact Registry, and Workload Identity Federation for GitHub Actions.
#
#   terraform init -backend-config="bucket=<state-bucket>" -backend-config="prefix=automarket/staging"
#   terraform apply -var-file=environments/staging.tfvars
#
# Terraform owns the infrastructure; CI owns which image revision is live
# (image changes are ignored below so deploys don't fight Terraform).

terraform {
  required_version = ">= 1.7"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  prefix       = "automarket-${var.environment}"
  registry     = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
  placeholder  = "us-docker.pkg.dev/cloudrun/container/hello"
  sql_socket   = "/cloudsql/${google_sql_database_instance.main.connection_name}"
  app_secrets  = toset(var.app_secret_names)
}

# ─── APIs ───────────────────────────────────────────────
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "iamcredentials.googleapis.com",
    "storage.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

# ─── Registry ───────────────────────────────────────────
resource "google_artifact_registry_repository" "images" {
  repository_id = "automarket"
  format        = "DOCKER"
  location      = var.region
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions { keep_count = 30 }
  }
  depends_on = [google_project_service.apis]
}

# ─── Database ───────────────────────────────────────────
resource "google_sql_database_instance" "main" {
  name                = "${local.prefix}-pg"
  database_version    = "POSTGRES_17"
  deletion_protection = var.environment == "production"
  settings {
    tier              = var.db_tier
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.environment == "production"
    }
    insights_config { query_insights_enabled = true }
    ip_configuration { ipv4_enabled = true } # connections go through the Cloud SQL connector (IAM-authorized)
  }
  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "app" {
  name     = "automarket"
  instance = google_sql_database_instance.main.name
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_user" "app" {
  name     = "automarket"
  instance = google_sql_database_instance.main.name
  password = random_password.db.result
}

# ─── Secrets ────────────────────────────────────────────
resource "google_secret_manager_secret" "database_url" {
  secret_id = "${local.prefix}-DATABASE_URL"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://${google_sql_user.app.name}:${random_password.db.result}@localhost/${google_sql_database.app.name}?host=${local.sql_socket}"
}

# Values are added out-of-band: gcloud secrets versions add <name> --data-file=-
resource "google_secret_manager_secret" "app" {
  for_each  = local.app_secrets
  secret_id = "${local.prefix}-${each.value}"
  replication {
    auto {}
  }
}

# ─── Media bucket ───────────────────────────────────────
resource "google_storage_bucket" "media" {
  name                        = "${var.project_id}-${local.prefix}-media"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced" # media is served via signed URLs
  cors {
    origin          = [var.web_url]
    method          = ["PUT", "GET"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }
}

# ─── Runtime identity ───────────────────────────────────
resource "google_service_account" "runtime" {
  account_id   = "${local.prefix}-run"
  display_name = "AutoMarket ${var.environment} runtime"
}

resource "google_project_iam_member" "runtime" {
  for_each = toset(["roles/cloudsql.client", "roles/logging.logWriter", "roles/monitoring.metricWriter"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket_iam_member" "runtime_media" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

# Needed to sign GCS URLs without a key file (signBlob).
resource "google_service_account_iam_member" "runtime_sign" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each  = merge({ DATABASE_URL = google_secret_manager_secret.database_url.id }, { for k, s in google_secret_manager_secret.app : k => s.id })
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# ─── Cloud Run: shared API/worker configuration ─────────
locals {
  api_env = {
    NODE_ENV               = "production"
    API_URL                = var.api_url
    WEB_URL                = var.web_url
    STORAGE_DRIVER         = "gcs"
    GCS_BUCKET             = google_storage_bucket.media.name
    EMAIL_FROM_ADDRESS     = var.email_from_address
    COMPANY_POSTAL_ADDRESS = var.company_postal_address
    TRUST_PROXY_HOPS       = "2"
  }
  secret_env = merge({ DATABASE_URL = google_secret_manager_secret.database_url.secret_id }, { for k, s in google_secret_manager_secret.app : k => s.secret_id })
}

resource "google_cloud_run_v2_service" "api" {
  name                = "${local.prefix}-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL" # webhooks, OAuth callbacks and email tracking need public access
  deletion_protection = false
  template {
    service_account = google_service_account.runtime.email
    scaling {
      min_instance_count = var.environment == "production" ? 1 : 0
      max_instance_count = 20
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance { instances = [google_sql_database_instance.main.connection_name] }
    }
    containers {
      image = local.placeholder
      ports { container_port = 8080 }
      resources { limits = { cpu = "1", memory = "1Gi" } }
      dynamic "env" {
        for_each = merge(local.api_env, { SERVICE_NAME = "automarket-api" })
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      startup_probe { http_get { path = "/healthz" } }
    }
  }
  lifecycle { ignore_changes = [template[0].containers[0].image, client, client_version, template[0].labels] }
}

# Worker: always-on CPU so scheduled posts and campaigns fire on time.
resource "google_cloud_run_v2_service" "worker" {
  name                = "${local.prefix}-worker"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false
  template {
    service_account = google_service_account.runtime.email
    scaling {
      min_instance_count = 1
      max_instance_count = var.worker_max_instances
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance { instances = [google_sql_database_instance.main.connection_name] }
    }
    containers {
      image   = local.placeholder
      command = ["node"]
      args    = ["dist/worker.js"]
      ports { container_port = 8080 }
      resources {
        limits   = { cpu = "1", memory = "1Gi" }
        cpu_idle = false
      }
      dynamic "env" {
        for_each = merge(local.api_env, { SERVICE_NAME = "automarket-worker", WORKER_CONCURRENCY = "4" })
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }
  lifecycle { ignore_changes = [template[0].containers[0].image, client, client_version, template[0].labels] }
}

resource "google_cloud_run_v2_job" "migrate" {
  name                = "${local.prefix}-migrate"
  location            = var.region
  deletion_protection = false
  template {
    template {
      service_account = google_service_account.runtime.email
      max_retries     = 0
      volumes {
        name = "cloudsql"
        cloud_sql_instance { instances = [google_sql_database_instance.main.connection_name] }
      }
      containers {
        image = local.placeholder
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = "latest"
            }
          }
        }
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }
  lifecycle { ignore_changes = [template[0].template[0].containers[0].image, client, client_version] }
}

resource "google_cloud_run_v2_service" "web" {
  name                = "${local.prefix}-web"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  template {
    service_account = google_service_account.runtime.email
    scaling {
      min_instance_count = var.environment == "production" ? 1 : 0
      max_instance_count = 20
    }
    containers {
      image = local.placeholder
      ports { container_port = 8080 }
      resources { limits = { cpu = "1", memory = "512Mi" } }
      env {
        name  = "API_INTERNAL_URL"
        value = google_cloud_run_v2_service.api.uri
      }
    }
  }
  lifecycle { ignore_changes = [template[0].containers[0].image, client, client_version, template[0].labels] }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  for_each = { api = google_cloud_run_v2_service.api.name, web = google_cloud_run_v2_service.web.name }
  name     = each.value
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ─── GitHub Actions deploy identity (Workload Identity Federation) ──
resource "google_service_account" "deployer" {
  account_id   = "${local.prefix}-deploy"
  display_name = "AutoMarket ${var.environment} GitHub deployer"
}

resource "google_project_iam_member" "deployer" {
  for_each = toset(["roles/run.admin", "roles/artifactregistry.writer"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_act_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${local.prefix}-gh"
  display_name              = "GitHub Actions (${var.environment})"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }
  attribute_condition = "assertion.repository == \"${var.github_repository}\""
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
