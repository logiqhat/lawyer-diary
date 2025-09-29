# Terraform variables for LawyerDiary (dev defaults)

aws_region          = "us-east-1"
project             = "lawyerdiary"
stage               = "dev"

# Firebase project used by API Gateway JWT authorizer
firebase_project_id = "lawyer-diary-f6546"

# CORS (use concrete origins in prod)
allowed_origins     = ["*"]

# Require JWT on routes (set false to test without auth)
enforce_auth        = true

# Used in dev when auth is disabled to attribute data
default_test_user_id = "test-user-123"

# Admin notify shared secret is stored in SSM, not here. Leave empty or set via TF var securely.
admin_shared_secret = ""

