# LawyerDiary Backend (Terraform)

Infrastructure‑as‑Code for an authenticated HTTP API that accepts case and date data, backed by DynamoDB and invoked via Lambda. API Gateway uses a JWT authorizer against your Firebase project so each request is tied to a Firebase user (UID).

## Architecture
- DynamoDB
  - `cases`: PK `userId`, SK `id`
  - `case_dates`: PK `userId`, SK `id`
  - `users`: PK `userId` (store email, displayName, etc.)
- Lambda (Node.js 20)
  - Split functions per domain with a shared Layer:
    - `functions/users` (POST /users)
    - `functions/cases` (CRUD /cases)
    - `functions/dates` (CRUD /dates, validates case ownership)
  - Shared helpers provided via Lambda Layer `layer/nodejs/shared.js` mounted at `/opt/nodejs/shared`
- API Gateway (HTTP API v2)
  - CORS enabled, JWT authorizer (Firebase)
  - Routes:
    - Users: `POST /users`
    - Cases: `POST /cases`, `GET /cases`, `GET /cases/{id}`, `PUT /cases/{id}`, `DELETE /cases/{id}`
    - Dates: `POST /dates`, `GET /dates`, `GET /dates/{id}`, `PUT /dates/{id}`, `DELETE /dates/{id}`

## Prerequisites
- Terraform v1.5+ installed
- AWS credentials configured (AWS_PROFILE or env vars)
- Firebase Project ID (used by the JWT authorizer)

## Variables (see `variables.tf`)
- `aws_region` (default `us-east-1`)
- `project` (default `lawyerdiary`)
- `stage` (default `dev`)
- `firebase_project_id` (required)
- `allowed_origins` (list of CORS origins; default `[*]`)

## Deploy
```
cd backend
terraform init
terraform plan -var "firebase_project_id=YOUR_FIREBASE_PROJECT_ID"
terraform apply -var "firebase_project_id=YOUR_FIREBASE_PROJECT_ID"
```

Outputs
- `http_api_endpoint`: Base URL for all routes (e.g., POST {endpoint}/cases)
- `cases_table_name`, `case_dates_table_name`

## Client Integration
- Acquire Firebase ID token on device: `await auth.currentUser?.getIdToken()`
- Send it in headers: `Authorization: Bearer <ID_TOKEN>`
- API Gateway validates the token; Lambda reads UID at `event.requestContext.authorizer.jwt.claims.sub`

### Dev auth toggle
- Set `enforce_auth = false` (e.g., in dev stage) to test without Firebase.
- Identity resolution in dev:
  - Use `x-test-user: some-user-id` header to impersonate.
  - Otherwise, backend uses `default_test_user_id` (variable) for `userId`.
- Never disable auth outside dev.

### Sample curl commands (dev)
Assuming `enforce_auth = false` and `http_api_endpoint` output is exported as `$API`.

```
# Create a user profile (optional displayName)
curl -sS -X POST "$API/users" \
  -H 'Content-Type: application/json' \
  -H 'x-test-user: alice' \
  -d '{"displayName":"Alice"}' | jq .

# Create a case
curl -sS -X POST "$API/cases" \
  -H 'Content-Type: application/json' \
  -H 'x-test-user: alice' \
  -d '{
        "id":"case-1",
        "clientName":"Alice Johnson",
        "oppositePartyName":"Acme Manufacturing",
        "title":"Alice Johnson vs Acme Manufacturing",
        "details":"Initial filing",
        "createdAt":"2025-01-01T00:00:00.000Z"
      }' | jq .

# List cases
curl -sS "$API/cases" -H 'x-test-user: alice' | jq .

# Create a date for the case (note: eventDate is YYYY-MM-DD)
curl -sS -X POST "$API/dates" \
  -H 'Content-Type: application/json' \
  -H 'x-test-user: alice' \
  -d '{
        "id":"date-1",
        "caseId":"case-1",
        "eventDate":"2025-09-10",
        "notes":"Hearing scheduled"
      }' | jq .

# List dates (all)
curl -sS "$API/dates" -H 'x-test-user: alice' | jq .

# List dates for a case
curl -sS "$API/dates?caseId=case-1" -H 'x-test-user: alice' | jq .

# Update case
curl -sS -X PUT "$API/cases/case-1" \
  -H 'Content-Type: application/json' \
  -H 'x-test-user: alice' \
  -d '{"details":"Updated details"}' | jq .

# Update date
curl -sS -X PUT "$API/dates/date-1" \
  -H 'Content-Type: application/json' \
  -H 'x-test-user: alice' \
  -d '{"notes":"Rescheduled to 11am"}' | jq .

# Delete date
curl -sS -X DELETE "$API/dates/date-1" -H 'x-test-user: alice' | jq .

# Delete case (synchronously deletes its dates)
curl -sS -X DELETE "$API/cases/case-1" -H 'x-test-user: alice' | jq .
```

