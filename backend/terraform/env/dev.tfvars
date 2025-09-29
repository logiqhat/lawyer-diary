# Dev environment variables
aws_region           = "us-east-1"
project              = "lawyerdiary"
stage                = "dev"

# Match the Firebase project your dev app uses
firebase_project_id  = "lawyer-diary-f6546"

# In dev it’s fine to allow any origin (tighten if you host a dev site)
allowed_origins      = ["*"]

# Keep auth on in dev (set to false if you need to test without tokens)
enforce_auth         = true

# Used only when auth is disabled
default_test_user_id = "test-user-123"

# SSM parameters carry secrets; leave blank here
admin_shared_secret  = ""

