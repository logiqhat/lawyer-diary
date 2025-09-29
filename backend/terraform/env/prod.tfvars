# Production environment variables
aws_region           = "us-east-1"
project              = "lawyerdiary"
stage                = "prod"

# Production Firebase project ID (must match the app build)
firebase_project_id  = "your-prod-firebase-project-id"

# Only your production origins
allowed_origins      = [
  "https://yourapp.com"
]

enforce_auth         = true
default_test_user_id = "prod-user-unused"
admin_shared_secret  = ""

