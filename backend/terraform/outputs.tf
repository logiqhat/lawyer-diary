output "http_api_endpoint" {
  value       = aws_apigatewayv2_api.http_api.api_endpoint
  description = "Base URL for the HTTP API"
}

output "cases_table_name" {
  value       = aws_dynamodb_table.cases.name
  description = "DynamoDB table name for cases"
}

output "case_dates_table_name" {
  value       = aws_dynamodb_table.case_dates.name
  description = "DynamoDB table name for case dates"
}

output "users_table_name" {
  value       = aws_dynamodb_table.users.name
  description = "DynamoDB table name for users"
}

output "upcoming_notifications_table_name" {
  value       = aws_dynamodb_table.upcoming_notifications.name
  description = "DynamoDB table name for upcoming date notifications"
}
