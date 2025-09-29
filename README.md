# LawyerDiary

LawyerDiary is a mobile app (Expo + React Native) for tracking legal cases and their important dates (hearings, deadlines). It uses Redux Toolkit for state, SQLite for on‑device storage, and Firebase Authentication (Email/Password and Google) to gate access. An optional AWS backend (API Gateway + Lambda + DynamoDB) is provided to receive and store case/date data per user.

## What’s Inside
- App: Expo/React Native, React Navigation, Redux Toolkit, expo‑sqlite
- Auth: Firebase (Email/Password, Google via Expo Auth Session)
- Backend (optional): AWS API Gateway (HTTP API v2) + Lambda (Node.js) + DynamoDB

## App Architecture (High Level)
- UI: React Navigation tabs (Upcoming, Calendar, All Cases, Account) and stacks for details/forms
- State: Redux slices `cases` and `caseDates`; async thunks read/write SQLite via services
- Persistence: SQLite tables `cases` and `case_dates` (created at first launch)
- Auth Gate: `onAuthStateChanged` toggles between Login and the main app
- Optional Cloud: App can send authenticated requests (Firebase ID token in `Authorization: Bearer …`) to the AWS HTTP API

## Backend (Terraform) Overview
- DynamoDB
  - `cases` table: PK `userId`, SK `id`
  - `case_dates` table: PK `userId`, SK `id`, GSI on (`userId`, `eventDate`) for upcoming queries
- API Gateway (HTTP API v2)
  - CORS enabled, JWT Authorizer using Firebase project (issuer: `https://securetoken.google.com/<PROJECT_ID>`, audience: `<PROJECT_ID>`)
  - Routes: `POST /cases`, `POST /dates` → Lambda proxy
- Lambda (Node.js 20)
  - Reads Firebase UID from authorizer claims; stub handler included at `backend/lambda/index.js`

## Running the App
1) Install deps: `npm install`
2) Fill Firebase config in `firebase.js`
3) Start: `npm run start` (Expo Go)

## Deploying the Backend with Terraform
Prerequisites
- Terraform v1.5+ and AWS credentials configured (env vars or profile)
- Your Firebase project ID (used by API JWT authorizer)

Variables (see `backend/variables.tf`)
- `aws_region` (default `us-east-1`)
- `project` (default `lawyerdiary`)
- `stage` (default `dev`)
- `firebase_project_id` (required)
- `allowed_origins` (CORS list, default `[*]`)

Steps
```
cd backend
terraform init
terraform plan -var "firebase_project_id=YOUR_FIREBASE_PROJECT_ID"
terraform apply -var "firebase_project_id=YOUR_FIREBASE_PROJECT_ID"
```

Outputs
- `http_api_endpoint`: Base URL for the HTTP API
- DynamoDB table names for cases and case dates

Client → API Notes
- Attach Firebase ID token to each request: `Authorization: Bearer <ID_TOKEN>`
- API Gateway JWT authorizer validates the token; Lambda reads UID from `event.requestContext.authorizer.jwt.claims.sub`

## Next Steps
- Fill Google OAuth client IDs in `screens/LoginScreen.js`
- Add more routes (GET/PUT/DELETE) and real DynamoDB writes in Lambda
- Scope local SQLite rows by `auth.currentUser.uid` for multi‑user devices
