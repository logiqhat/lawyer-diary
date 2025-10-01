variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project name prefix"
  type        = string
  default     = "lawyerdiary"
}

variable "stage" {
  description = "Deployment stage (e.g., dev, prod)"
  type        = string
  default     = "dev"
}

variable "firebase_project_id" {
  description = "Firebase project ID for JWT authorizer (issuer/audience)"
  type        = string
  default     = "lawyer-diary-f6546"
}

variable "allowed_origins" {
  description = "CORS allowed origins"
  type        = list(string)
  default     = ["*"]
}

variable "enforce_auth" {
  description = "Whether API routes require JWT auth (set false for dev testing)"
  type        = bool
  default     = true
}

variable "default_test_user_id" {
  description = "Fallback userId used in dev when no x-test-user header is provided"
  type        = string
  default     = "test-user-123"
}

variable "admin_shared_secret" {
  description = "Shared secret required by /admin/notify endpoint (set via TF var or env)"
  type        = string
  default     = ""
}

// The SSM parameter name for the Firebase service account JSON is derived in main.tf locals.

variable "aws_profile" {
  description = "AWS CLI profile name to use for provider authentication (optional; if null, uses default resolution)"
  type        = string
  default     = null
}
