import math
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pathlib import Path

from .database import Base, engine, get_db
from .models import User, Task
from .schemas import UserRegister, UserLogin, UserPublic, TokenResponse, TaskCreate, TaskUpdate, TaskPublic, TaskPage
from .security import hash_password, verify_password, create_access_token, decode_access_token

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title="TaskFlow API",
    description="RESTful Task Management API with JWT authentication and per-user task ownership.",
    version="1.0.0",
    lifespan=lifespan,
)
bearer_scheme = HTTPBearer(auto_error=False)

@app.exception_handler(IntegrityError)
async def integrity_error_handler(request, exc):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=400, content={"detail": "A record with these details already exists."})

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required. Please log in.")
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired access token.")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User associated with token no longer exists.")
    return user

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "TaskFlow API"}

@app.post("/api/auth/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED, tags=["Authentication"])
def register(payload: UserRegister, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    user = User(name=payload.name.strip(), email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@app.post("/api/auth/login", response_model=TokenResponse, tags=["Authentication"])
def login(payload: UserLogin, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return {"access_token": create_access_token(user.id), "token_type": "bearer", "user": user}

@app.get("/api/auth/me", response_model=UserPublic, tags=["Authentication"])
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/api/tasks", response_model=TaskPublic, status_code=status.HTTP_201_CREATED, tags=["Tasks"])
def create_task(payload: TaskCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = Task(owner_id=current_user.id, **payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

@app.get("/api/tasks", response_model=TaskPage, tags=["Tasks"])
def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status", pattern="^(pending|in_progress|completed)$"),
    priority: str | None = Query(None, pattern="^(low|medium|high)$"),
    search: str | None = Query(None, max_length=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Task).where(Task.owner_id == current_user.id)
    count_query = select(func.count(Task.id)).where(Task.owner_id == current_user.id)
    if status_filter:
        query = query.where(Task.status == status_filter)
        count_query = count_query.where(Task.status == status_filter)
    if priority:
        query = query.where(Task.priority == priority)
        count_query = count_query.where(Task.priority == priority)
    if search:
        query = query.where(Task.title.ilike(f"%{search}%"))
        count_query = count_query.where(Task.title.ilike(f"%{search}%"))
    total = db.scalar(count_query) or 0
    tasks = db.scalars(query.order_by(Task.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": tasks, "page": page, "page_size": page_size, "total": total, "pages": math.ceil(total / page_size) if total else 0}

def owned_task_or_404(task_id: int, db: Session, user_id: int) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id, Task.owner_id == user_id))
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task

@app.get("/api/tasks/{task_id}", response_model=TaskPublic, tags=["Tasks"])
def get_task(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return owned_task_or_404(task_id, db, current_user.id)

@app.put("/api/tasks/{task_id}", response_model=TaskPublic, tags=["Tasks"])
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = owned_task_or_404(task_id, db, current_user.id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Provide at least one field to update.")
    for key, value in changes.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task

@app.delete("/api/tasks/{task_id}", status_code=status.HTTP_200_OK, tags=["Tasks"])
def delete_task(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = owned_task_or_404(task_id, db, current_user.id)
    db.delete(task)
    db.commit()
    return {"message": "Task deleted successfully."}

# Serve the included frontend from the same origin as the API.
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/", include_in_schema=False)
def homepage():
    return FileResponse(STATIC_DIR / "index.html")
