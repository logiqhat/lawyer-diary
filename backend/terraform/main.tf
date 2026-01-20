terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

# ---------------- Locals ----------------
locals {
  # SSM parameter name for the Firebase service account JSON
  firebase_service_account_param_name = "/${var.project}/firebase-service-account"
  # SSM parameter name for the admin shared secret used by /admin/notify
  admin_shared_secret_param_name = "/${var.project}/admin-shared-secret"
}

# ---------------- DynamoDB Tables ----------------
resource "aws_dynamodb_table" "cases" {
  name         = "${var.project}-cases"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "userId"
  range_key = "id"

  attribute {
    name = "userId"
    type = "S"
  }
  attribute {
    name = "id"
    type = "S"
  }
}

# ---------------- Users table (profile/metadata per user) ----------------
resource "aws_dynamodb_table" "users" {
  name         = "${var.project}-users"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "userId"

  attribute {
    name = "userId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "case_dates" {
  name         = "${var.project}-case-dates"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "userId"
  range_key = "id"

  # Enable stream for notification indexer
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  attribute {
    name = "userId"
    type = "S"
  }
  attribute {
    name = "id"
    type = "S"
  }
  # Note: No secondary indexes to minimize cost. If you later need
  # to query by date on the backend, consider adding a GSI on
  # (userId, eventDate) or redesigning the sort key.
}

# ---------------- Upcoming notifications table ----------------
# Stores per-minute notification buckets per user
# PK (notifyTimeMs: N), SK (userId: S)
resource "aws_dynamodb_table" "upcoming_notifications" {
  name         = "${var.project}-upcoming-notifications"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "notifyTimeMs"
  range_key = "userId"

  attribute {
    name = "notifyTimeMs"
    type = "N"
  }
  attribute {
    name = "userId"
    type = "S"
  }

  # Suggested item shape (DocumentClient):
  # {
  #   notifyTimeMs: number, // epoch ms rounded to minute
  #   userId: string,
  #   dateCount: number,    // number of upcoming dates to notify
  #   // optional: metadata like lastComputedAt, tz, etc.
  # }
}

# ---------------- Lambda Role + Policy ----------------
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_role" {
  name               = "${var.project}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "lambda_dynamo" {
  name = "${var.project}-lambda-dynamo"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.cases.arn,
          aws_dynamodb_table.case_dates.arn,
          aws_dynamodb_table.users.arn,
          aws_dynamodb_table.upcoming_notifications.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeStream",
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:ListStreams",
          "dynamodb:ListShards"
        ]
        Resource = aws_dynamodb_table.case_dates.stream_arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "*"
      }
    ]
  })
}

# Allow Lambda to read the SecureString parameter
resource "aws_iam_role_policy" "lambda_ssm_read" {
  name = "${var.project}-lambda-ssm-read"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["ssm:GetParameter"]
        Resource = [
          aws_ssm_parameter.firebase_service_account.arn,
          aws_ssm_parameter.admin_shared_secret.arn
        ]
      }
    ]
  })
}

# KMS key for field-level encryption
resource "aws_kms_key" "app_data" {
  description             = "${var.project} data field encryption"
  deletion_window_in_days = 7
  key_usage               = "ENCRYPT_DECRYPT"
}

resource "aws_kms_alias" "app_data" {
  name          = "alias/${var.project}-data"
  target_key_id = aws_kms_key.app_data.key_id
}

# Allow Lambdas to use the KMS key
resource "aws_iam_role_policy" "lambda_kms" {
  name = "${var.project}-lambda-kms"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"],
        Resource = aws_kms_key.app_data.arn
      }
    ]
  })
}

# Ensure dist folder exists for archives
resource "null_resource" "ensure_dist" {
  provisioner "local-exec" {
    command = "mkdir -p ${path.module}/dist"
  }
}


# Build step for firebase-admin Lambda layer (installs node_modules)
resource "null_resource" "build_firebase_admin_layer" {
  # Re-run when package.json changes
  triggers = {
    pkg_hash = filesha256("${path.module}/../layers/firebase_admin/nodejs/package.json")
  }

  provisioner "local-exec" {
    command = "cd ${path.module}/../layers/firebase_admin/nodejs && npm ci"
  }
}


# ---------------- Lambda Layer (shared helpers) ----------------
data "archive_file" "layer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../layer"
  output_path = "${path.module}/dist/layer.zip"
  depends_on  = [null_resource.ensure_dist]
}

# Firebase Admin SDK layer (packages the nodejs folder under backend/layers/firebase_admin)
data "archive_file" "firebase_admin_layer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../layers/firebase_admin"
  output_path = "${path.module}/dist/firebase_admin_layer.zip"
  depends_on  = [null_resource.ensure_dist, null_resource.build_firebase_admin_layer]
}

data "archive_file" "sync_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/sync"
  output_path = "${path.module}/dist/sync.zip"
  depends_on  = [null_resource.ensure_dist]
}

resource "aws_lambda_layer_version" "shared" {
  filename            = data.archive_file.layer_zip.output_path
  layer_name          = "${var.project}-shared"
  compatible_runtimes = ["nodejs16.x"]
  source_code_hash    = filebase64sha256(data.archive_file.layer_zip.output_path)
}

resource "aws_lambda_layer_version" "firebase_admin" {
  filename            = data.archive_file.firebase_admin_layer_zip.output_path
  layer_name          = "${var.project}-firebase-admin"
  compatible_runtimes = ["nodejs16.x"]
  source_code_hash    = filebase64sha256(data.archive_file.firebase_admin_layer_zip.output_path)
}

# ---------------- Split Lambda functions ----------------
data "archive_file" "users_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/users"
  output_path = "${path.module}/dist/users.zip"
  depends_on  = [null_resource.ensure_dist]
}
data "archive_file" "cases_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/cases"
  output_path = "${path.module}/dist/cases.zip"
  depends_on  = [null_resource.ensure_dist]
}
data "archive_file" "dates_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/dates"
  output_path = "${path.module}/dist/dates.zip"
  depends_on  = [null_resource.ensure_dist]
}

data "archive_file" "admin_notify_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/admin_notify"
  output_path = "${path.module}/dist/admin_notify.zip"
  depends_on  = [null_resource.ensure_dist]
}

# Package notify_indexer (DynamoDB stream processor)
data "archive_file" "notify_indexer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/notify_indexer"
  output_path = "${path.module}/dist/notify_indexer.zip"
  depends_on  = [null_resource.ensure_dist]
}

# Package notifier (scheduled every minute)
data "archive_file" "notifier_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/notifier"
  output_path = "${path.module}/dist/notifier.zip"
  depends_on  = [null_resource.ensure_dist]
}

resource "aws_lambda_function" "users" {
  function_name    = "${var.project}-users"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  runtime          = "nodejs16.x"
  filename         = data.archive_file.users_zip.output_path
  layers           = [aws_lambda_layer_version.shared.arn]
  source_code_hash = filebase64sha256(data.archive_file.users_zip.output_path)
  timeout          = 60

  environment { variables = { USERS_TABLE = aws_dynamodb_table.users.name, DEFAULT_TEST_USER_ID = var.default_test_user_id, STAGE = var.stage } }
}

resource "aws_lambda_function" "cases" {
  function_name    = "${var.project}-cases"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  runtime          = "nodejs16.x"
  filename         = data.archive_file.cases_zip.output_path
  layers           = [aws_lambda_layer_version.shared.arn]
  source_code_hash = filebase64sha256(data.archive_file.cases_zip.output_path)
  timeout          = 60

  environment {
    variables = {
      CASES_TABLE          = aws_dynamodb_table.cases.name
      CASE_DATES_TABLE     = aws_dynamodb_table.case_dates.name
      USERS_TABLE          = aws_dynamodb_table.users.name
      DEFAULT_TEST_USER_ID = var.default_test_user_id
      STAGE                = var.stage
      CASES_LIMIT          = "100"
      KMS_KEY_ID           = aws_kms_key.app_data.arn
    }
  }
}

resource "aws_lambda_function" "dates" {
  function_name    = "${var.project}-dates"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  runtime          = "nodejs16.x"
  filename         = data.archive_file.dates_zip.output_path
  layers           = [aws_lambda_layer_version.shared.arn]
  source_code_hash = filebase64sha256(data.archive_file.dates_zip.output_path)
  timeout          = 60

  environment {
    variables = {
      CASES_TABLE          = aws_dynamodb_table.cases.name
      CASE_DATES_TABLE     = aws_dynamodb_table.case_dates.name
      USERS_TABLE          = aws_dynamodb_table.users.name
      DEFAULT_TEST_USER_ID = var.default_test_user_id
      STAGE                = var.stage
      DATES_PER_CASE_LIMIT = "100"
      KMS_KEY_ID           = aws_kms_key.app_data.arn
    }
  }
}

resource "aws_lambda_function" "admin_notify" {
  function_name    = "${var.project}-admin-notify"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  runtime          = "nodejs16.x"
  filename         = data.archive_file.admin_notify_zip.output_path
  layers           = [aws_lambda_layer_version.shared.arn, aws_lambda_layer_version.firebase_admin.arn]
  source_code_hash = filebase64sha256(data.archive_file.admin_notify_zip.output_path)
  timeout          = 60

  environment {
    variables = {
      USERS_TABLE                    = aws_dynamodb_table.users.name
      ADMIN_SHARED_SECRET_PARAM      = aws_ssm_parameter.admin_shared_secret.name
      STAGE                          = var.stage
      FIREBASE_SERVICE_ACCOUNT_PARAM = aws_ssm_parameter.firebase_service_account.name
    }
  }
}

# Sync lambda
resource "aws_lambda_function" "sync" {
  function_name    = "${var.project}-sync"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  runtime          = "nodejs16.x"
  filename         = data.archive_file.sync_zip.output_path
  layers           = [aws_lambda_layer_version.shared.arn]
  source_code_hash = filebase64sha256(data.archive_file.sync_zip.output_path)
  timeout          = 60

  environment {
    variables = {
      CASES_TABLE          = aws_dynamodb_table.cases.name
      CASE_DATES_TABLE     = aws_dynamodb_table.case_dates.name
      USERS_TABLE          = aws_dynamodb_table.users.name
      DEFAULT_TEST_USER_ID = var.default_test_user_id
      STAGE                = var.stage
      CASES_LIMIT          = "100"
      DATES_PER_CASE_LIMIT = "100"
      KMS_KEY_ID           = aws_kms_key.app_data.arn
    }
  }
}

# Notify indexer lambda (streams)
resource "aws_lambda_function" "notify_indexer" {
  function_name    = "${var.project}-notify-indexer"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  runtime          = "nodejs16.x"
  filename         = data.archive_file.notify_indexer_zip.output_path
  layers           = [aws_lambda_layer_version.shared.arn]
  source_code_hash = filebase64sha256(data.archive_file.notify_indexer_zip.output_path)
  timeout          = 60

  environment {
    variables = {
      CASE_DATES_TABLE     = aws_dynamodb_table.case_dates.name
      USERS_TABLE          = aws_dynamodb_table.users.name
      UPCOMING_NOTIF_TABLE = aws_dynamodb_table.upcoming_notifications.name
      STAGE                = var.stage
    }
  }
}

# Notifier lambda (scheduled via EventBridge every minute)
resource "aws_lambda_function" "notifier" {
  function_name    = "${var.project}-notifier"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  runtime          = "nodejs16.x"
  filename         = data.archive_file.notifier_zip.output_path
  layers           = [aws_lambda_layer_version.shared.arn, aws_lambda_layer_version.firebase_admin.arn]
  source_code_hash = filebase64sha256(data.archive_file.notifier_zip.output_path)
  timeout          = 60

  environment {
    variables = {
      UPCOMING_NOTIF_TABLE           = aws_dynamodb_table.upcoming_notifications.name
      USERS_TABLE                    = aws_dynamodb_table.users.name
      FIREBASE_SERVICE_ACCOUNT_PARAM = aws_ssm_parameter.firebase_service_account.name
      STAGE                          = var.stage
    }
  }
}

resource "aws_cloudwatch_log_group" "lambda_notifier" {
  name              = "/aws/lambda/${aws_lambda_function.notifier.function_name}"
  retention_in_days = 14
}

# EventBridge rule to trigger every minute
resource "aws_cloudwatch_event_rule" "notifier_minutely" {
  name                = "${var.project}-notifier-minutely"
  schedule_expression = "cron(* * * * ? *)"
}

resource "aws_cloudwatch_event_target" "notifier_target" {
  rule      = aws_cloudwatch_event_rule.notifier_minutely.name
  target_id = "notifier"
  arn       = aws_lambda_function.notifier.arn
}

resource "aws_lambda_permission" "allow_events_invoke_notifier" {
  statement_id  = "AllowEventBridgeInvokeNotifier"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.notifier.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.notifier_minutely.arn
}

resource "aws_lambda_permission" "allow_stream_invoke_notify_indexer" {
  statement_id  = "AllowDynamoDBStreamInvokeNotifyIndexer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.notify_indexer.function_name
  principal     = "dynamodb.amazonaws.com"
  source_arn    = aws_dynamodb_table.case_dates.stream_arn
}

resource "aws_lambda_event_source_mapping" "case_dates_stream_to_notify_indexer" {
  event_source_arn                   = aws_dynamodb_table.case_dates.stream_arn
  function_name                      = aws_lambda_function.notify_indexer.arn
  starting_position                  = "LATEST"
  batch_size                         = 50
  maximum_batching_window_in_seconds = 2
  enabled                            = true
}

# CloudWatch access logs for API Gateway HTTP API
resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${var.project}-access"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "lambda_users" {
  name              = "/aws/lambda/${aws_lambda_function.users.function_name}"
  retention_in_days = 14
}
resource "aws_cloudwatch_log_group" "lambda_cases" {
  name              = "/aws/lambda/${aws_lambda_function.cases.function_name}"
  retention_in_days = 14
}
resource "aws_cloudwatch_log_group" "lambda_dates" {
  name              = "/aws/lambda/${aws_lambda_function.dates.function_name}"
  retention_in_days = 14
}
resource "aws_cloudwatch_log_group" "lambda_notify_indexer" {
  name              = "/aws/lambda/${aws_lambda_function.notify_indexer.function_name}"
  retention_in_days = 14
}

# ---------------- HTTP API (API Gateway v2) ----------------
resource "aws_apigatewayv2_api" "http_api" {
  name          = "${var.project}-http"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = false
    allow_headers     = ["Content-Type", "Authorization"]
    allow_methods     = ["OPTIONS", "POST", "GET", "PUT", "DELETE"]
    allow_origins     = var.allowed_origins
  }
}

resource "aws_apigatewayv2_authorizer" "firebase" {
  api_id           = aws_apigatewayv2_api.http_api.id
  name             = "firebase-jwt"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [var.firebase_project_id]
    issuer   = "https://securetoken.google.com/${var.firebase_project_id}"
  }
}

resource "aws_apigatewayv2_integration" "lambda_users" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.users.invoke_arn
  payload_format_version = "2.0"
}
resource "aws_apigatewayv2_integration" "lambda_cases" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.cases.invoke_arn
  payload_format_version = "2.0"
}
resource "aws_apigatewayv2_integration" "lambda_dates" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.dates.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "lambda_sync" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.sync.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "lambda_admin_notify" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.admin_notify.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_cases" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "POST /cases"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_cases.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "get_cases" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "GET /cases"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_cases.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "get_case_by_id" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "GET /cases/{id}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_cases.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "put_case_by_id" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "PUT /cases/{id}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_cases.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "delete_case_by_id" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "DELETE /cases/{id}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_cases.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "post_dates" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "POST /dates"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_dates.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "get_dates" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "GET /dates"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_dates.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "get_date_by_id" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "GET /dates/{id}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_dates.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "put_date_by_id" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "PUT /dates/{id}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_dates.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "delete_date_by_id" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "DELETE /dates/{id}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_dates.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "post_users" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "POST /users"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_users.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "post_sync_pull" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "POST /sync/pull"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_sync.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "post_sync_push" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "POST /sync/push"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_sync.id}"
  authorization_type = var.enforce_auth ? "JWT" : "NONE"
  authorizer_id      = var.enforce_auth ? aws_apigatewayv2_authorizer.firebase.id : null
}

resource "aws_apigatewayv2_route" "post_admin_notify" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "POST /admin/notify"
  target             = "integrations/${aws_apigatewayv2_integration.lambda_admin_notify.id}"
  authorization_type = "NONE" # Secured via shared secret header
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true

  # Global stage-level throttling (overall, not per-user).
  default_route_settings {
    throttling_rate_limit  = var.api_throttling_rate_limit_rps
    throttling_burst_limit = var.api_throttling_burst_limit
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId = "$context.requestId"
      userId    = "$context.authorizer.claims.sub"
      routeKey  = "$context.routeKey"
      status    = "$context.status"
      latency   = "$context.integration.latency"
      stage     = "$context.stage"
    })
  }
}

# Alarm when throttling is actively happening (HTTP 429 responses observed).
# This is derived from API Gateway access logs, since there is no dedicated "throttled requests" metric for HTTP APIs.
resource "aws_cloudwatch_log_metric_filter" "api_throttled_429" {
  name           = "${var.project}-${var.stage}-api-throttled-429"
  log_group_name = aws_cloudwatch_log_group.api_access.name

  # Matches the JSON access log format configured in aws_apigatewayv2_stage.default.access_log_settings
  pattern = "{ $.status = 429 }"

  metric_transformation {
    name      = "Throttled429"
    namespace = "${var.project}/${var.stage}/ApiGateway"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_throttling_active" {
  alarm_name        = "${var.project}-${var.stage}-api-throttling-active"
  alarm_description = "API Gateway is returning HTTP 429 (stage throttling is in effect)."

  namespace           = "${var.project}/${var.stage}/ApiGateway"
  metric_name         = aws_cloudwatch_log_metric_filter.api_throttled_429.metric_transformation[0].name
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
}

resource "aws_lambda_permission" "apigw_invoke_users" {
  statement_id  = "AllowAPIGatewayInvokeUsers"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.users.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
resource "aws_lambda_permission" "apigw_invoke_cases" {
  statement_id  = "AllowAPIGatewayInvokeCases"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cases.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
resource "aws_lambda_permission" "apigw_invoke_dates" {
  statement_id  = "AllowAPIGatewayInvokeDates"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.dates.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_invoke_sync" {
  statement_id  = "AllowAPIGatewayInvokeSync"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sync.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_invoke_admin_notify" {
  statement_id  = "AllowAPIGatewayInvokeAdminNotify"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.admin_notify.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
# ---------------- SSM Parameter: Firebase Admin service account ----------------
resource "aws_ssm_parameter" "firebase_service_account" {
  name        = local.firebase_service_account_param_name
  description = "Firebase Admin SDK service account (JSON)"
  type        = "SecureString"
  value       = "value to be uploaded via aws cli or console"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "admin_shared_secret" {
  name        = local.admin_shared_secret_param_name
  description = "Admin notify shared secret"
  type        = "SecureString"
  value       = "value to be uploaded via aws cli or console"

  lifecycle {
    ignore_changes = [value]
  }
}
