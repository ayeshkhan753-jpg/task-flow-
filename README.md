# TaskFlow — RESTful Task Management API

A full-stack task management app built with **FastAPI, SQLAlchemy, SQLite, JWT, Argon2 password hashing, and a responsive HTML/CSS/JavaScript frontend**.

## Features

- Register and log in with email/password
- Passwords stored as Argon2 hashes (never plain text)
- Signed JWT bearer tokens with expiration
- Create, read, update, and delete tasks
- Tasks belong to their creator; users cannot read or modify another user's tasks
- Pagination (`page`, `page_size`), title search, status filter, priority filter
- Validation with meaningful JSON error responses
- Automatic Swagger/OpenAPI docs at `/docs`
- Responsive dashboard with task statistics

## Requirements

- Python 3.10+
- pip

## Setup (Windows PowerShell)

```powershell
# 1. Extract this project and open its folder in terminal
py -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt

# 3. Create your local environment file
Copy-Item .env.example .env
```

Open `.env` and replace `SECRET_KEY` with a random secret. Generate one with:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Paste the generated value after `SECRET_KEY=` in `.env`. Do not commit `.env` to GitHub.

Run the app:

```powershell
uvicorn app.main:app --reload
```

Open:
- Website: http://127.0.0.1:8000
- Swagger docs: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc
- Health check: http://127.0.0.1:8000/api/health

SQLite database `taskflow.db` is created automatically on first startup.

## API reference

All request and response bodies use JSON unless otherwise specified. Protected routes require:

`Authorization: Bearer <access_token>`

| Method | Endpoint | Auth | Purpose |
|---|---|---:|---|
| POST | `/api/auth/register` | No | Create user |
| POST | `/api/auth/login` | No | Login and receive JWT |
| GET | `/api/auth/me` | Yes | Current user profile |
| POST | `/api/tasks` | Yes | Create task |
| GET | `/api/tasks` | Yes | List own tasks with pagination |
| GET | `/api/tasks/{id}` | Yes | Get one own task |
| PUT | `/api/tasks/{id}` | Yes | Update own task |
| DELETE | `/api/tasks/{id}` | Yes | Delete own task |
| GET | `/api/health` | No | Health check |

### Register — `POST /api/auth/register`

```json
{
  "name": "Ayesha Javaid",
  "email": "ayesha@example.com",
  "password": "ChangeMe123!"
}
```

Returns `201 Created` and the public user object. Duplicate email returns `400`.

### Login — `POST /api/auth/login`

```json
{
  "email": "ayesha@example.com",
  "password": "ChangeMe123!"
}
```

Returns a response containing `access_token`, `token_type`, and `user`. Incorrect credentials return `401`.

### Create task — `POST /api/tasks`

```json
{
  "title": "Finish API project",
  "description": "Test all endpoints and prepare the README",
  "status": "in_progress",
  "priority": "high"
}
```

`title` is required. `description` is optional. `status` must be `pending`, `in_progress`, or `completed`. `priority` must be `low`, `medium`, or `high`.

### List tasks — `GET /api/tasks`

Example: `/api/tasks?page=1&page_size=10&status=pending&priority=high&search=API`

Response shape:

```json
{
  "items": [],
  "page": 1,
  "page_size": 10,
  "total": 0,
  "pages": 0
}
```

`page` starts at 1. `page_size` must be between 1 and 100. Filters are optional.

### Update task — `PUT /api/tasks/{id}`

Send one or more fields:

```json
{
  "status": "completed",
  "priority": "medium"
}
```

### Delete task — `DELETE /api/tasks/{id}`

Returns:

```json
{"message": "Task deleted successfully."}
```

## HTTP status codes

- `200 OK`: successful read/update/delete/login
- `201 Created`: successful registration/task creation
- `400 Bad Request`: duplicate email or invalid update request
- `401 Unauthorized`: missing, invalid, or expired token / incorrect credentials
- `404 Not Found`: task doesn't exist or doesn't belong to the current user
- `422 Unprocessable Entity`: request validation failed (FastAPI default)
- `500 Internal Server Error`: unexpected server error

Validation errors from FastAPI return JSON with a `detail` field.

## Data model

### User
- `id` integer primary key
- `name` string
- `email` unique string
- `password_hash` string (Argon2 hash)
- `created_at` timestamp

### Task
- `id` integer primary key
- `owner_id` foreign key to `users.id`
- `title` required string (max 200 characters)
- `description` optional text
- `status` enum: pending / in_progress / completed
- `priority` enum: low / medium / high
- `created_at`, `updated_at` timestamps

## Postman

Import `postman_collection.json` into Postman. Register or log in first. The login request automatically saves the token in the collection variable `token`; protected requests use it as a Bearer token.

## GitHub submission checklist

1. Create a **public** repository on GitHub (for example `taskflow-task-management-api`).
2. Upload the project files, including `README.md` and `postman_collection.json`.
3. Do **not** upload `.env`, `.venv`, or `taskflow.db`.
4. In the GitHub repository description, mention FastAPI, JWT authentication, Argon2, SQLAlchemy, and task CRUD.
5. Test registration, login, all CRUD endpoints, invalid input, expired/missing token, and cross-user access before submitting.

## Security notes

- The default secret is for local development only. Set a random `SECRET_KEY` in `.env` before running.
- Keep `.env` private; never publish production secrets.
- JWT payloads are signed, not encrypted. Do not store passwords or sensitive personal data in a token.
- For production deployment, use HTTPS, a production database such as PostgreSQL, migrations, and a carefully managed secret store.
