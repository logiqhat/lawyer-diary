# Staging environment variables
aws_region           = "us-east-1"
project              = "lawyerdiary"
stage                = "staging"

# Staging Firebase project ID
firebase_project_id  = "your-staging-firebase-project-id"

# Set your staging web/app origins explicitly
allowed_origins      = [
  "https://staging.yourapp.com"
]

enforce_auth         = true
default_test_user_id = "test-user-staging"
admin_shared_secret  = ""

