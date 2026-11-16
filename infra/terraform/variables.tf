variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "environment" {
  type = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "github_repository" {
  type        = string
  description = "owner/repo allowed to deploy via Workload Identity Federation"
}

variable "api_url" {
  type        = string
  description = "Public API URL (custom domain or Cloud Run URL) used for OAuth callbacks, webhooks and tracking links"
}

variable "web_url" {
  type = string
}

variable "db_tier" {
  type    = string
  default = "db-custom-1-3840"
}

variable "worker_max_instances" {
  type    = number
  default = 3
}

variable "email_from_address" {
  type = string
}

variable "company_postal_address" {
  type = string
}

variable "app_secret_names" {
  type        = list(string)
  description = "Secret Manager secrets exposed to the API/worker as env vars"
  default = [
    "JWT_SECRET",
    "ENCRYPTION_KEY",
    "OPENAI_API_KEY",
    "HIGGSFIELD_API_KEY_ID",
    "HIGGSFIELD_API_KEY_SECRET",
    "HIGGSFIELD_WEBHOOK_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "SMTP_URL",
    "META_APP_ID",
    "META_APP_SECRET",
    "TIKTOK_CLIENT_KEY",
    "TIKTOK_CLIENT_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "LINKEDIN_CLIENT_ID",
    "LINKEDIN_CLIENT_SECRET",
    "X_CLIENT_ID",
    "X_CLIENT_SECRET",
  ]
}
