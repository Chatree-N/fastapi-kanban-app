from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional
import models
import schemas
from database import engine, get_db, SessionLocal
from sqlalchemy import inspect, text
import datetime
from datetime import timezone

# Create database tables
models.Base.metadata.create_all(bind=engine)

# Add deleted_at column if missing
inspector = inspect(engine)
if "tasks" in inspector.get_table_names():
    columns = [col['name'] for col in inspector.get_columns('tasks')]
    if 'deleted_at' not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN deleted_at DATETIME"))

app = FastAPI(title="Kanban To-Do List API")

@app.on_event("startup")
def cleanup_trash():
    db = SessionLocal()
    try:
        thirty_days_ago = datetime.datetime.now(timezone.utc) - datetime.timedelta(days=30)
        db.query(models.Task).filter(models.Task.deleted_at < thirty_days_ago).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()

# Allow all origins during local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root route – must be registered BEFORE the static mount
@app.get("/")
def read_index():
    return FileResponse("static/index.html")

@app.get("/api/tasks", response_model=list[schemas.TaskResponse])
def get_tasks(db: Session = Depends(get_db)):
    return db.query(models.Task).filter(models.Task.deleted_at.is_(None)).all()

@app.get("/api/trash", response_model=list[schemas.TaskResponse])
def get_trash(db: Session = Depends(get_db)):
    return db.query(models.Task).filter(models.Task.deleted_at.is_not(None)).order_by(models.Task.deleted_at.desc()).all()

@app.post("/api/tasks", response_model=schemas.TaskResponse)
def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db)):
    db_task = models.Task(**task.model_dump())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@app.put("/api/tasks/{task_id}", response_model=schemas.TaskResponse)
def update_task(task_id: int, task: schemas.TaskUpdate, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.deleted_at.is_(None)).first()
    if db_task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    
    for key, value in task.model_dump().items():
        setattr(db_task, key, value)
        
    db.commit()
    db.refresh(db_task)
    return db_task

@app.patch("/api/tasks/{task_id}", response_model=schemas.TaskResponse)
def patch_task(task_id: int, task: schemas.TaskPatch, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.deleted_at.is_(None)).first()
    if db_task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = task.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_task, key, value)
        
    db.commit()
    db.refresh(db_task)
    return db_task

@app.delete("/api/tasks/{task_id}", response_model=schemas.TaskResponse)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.deleted_at.is_(None)).first()
    if db_task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    
    db_task.deleted_at = datetime.datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_task)
    return db_task

@app.delete("/api/tasks")
def delete_tasks_by_status(status: Optional[str] = Query(None), db: Session = Depends(get_db)):
    if not status:
        raise HTTPException(status_code=400, detail="status is required")
        
    try:
        schemas.TaskStatus(status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid status value")
        
    tasks = db.query(models.Task).filter(models.Task.status == status, models.Task.deleted_at.is_(None)).all()
    for task in tasks:
        task.deleted_at = datetime.datetime.now(timezone.utc)
    db.commit()
    return {"message": f"Tasks with status {status} deleted"}

@app.post("/api/tasks/{task_id}/restore", response_model=schemas.TaskResponse)
def restore_task(task_id: int, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.deleted_at.is_not(None)).first()
    if db_task is None:
        raise HTTPException(status_code=404, detail="Task not found in trash")
    
    db_task.deleted_at = None
    db.commit()
    db.refresh(db_task)
    return db_task

@app.delete("/api/tasks/{task_id}/permanent")
def delete_task_permanent(task_id: int, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.deleted_at.is_not(None)).first()
    if db_task is None:
        raise HTTPException(status_code=404, detail="Task not found in trash")
    
    db.delete(db_task)
    db.commit()
    return {"message": "Task permanently deleted"}

@app.delete("/api/trash")
def empty_trash(db: Session = Depends(get_db)):
    db.query(models.Task).filter(models.Task.deleted_at.is_not(None)).delete(synchronize_session=False)
    db.commit()
    return {"message": "Trash emptied"}

# Subtasks endpoints
@app.post("/api/tasks/{task_id}/subtasks", response_model=schemas.SubtaskResponse)
def create_subtask(task_id: int, subtask: schemas.SubtaskCreate, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.deleted_at.is_(None)).first()
    if db_task is None:
        raise HTTPException(status_code=404, detail="Task not found or is in trash")
    
    db_subtask = models.Subtask(**subtask.model_dump(), task_id=task_id)
    db.add(db_subtask)
    db.commit()
    db.refresh(db_subtask)
    return db_subtask

@app.patch("/api/subtasks/{subtask_id}", response_model=schemas.SubtaskResponse)
def patch_subtask(subtask_id: int, subtask: schemas.SubtaskUpdate, db: Session = Depends(get_db)):
    db_subtask = db.query(models.Subtask).filter(models.Subtask.id == subtask_id).first()
    if db_subtask is None:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    update_data = subtask.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_subtask, key, value)
        
    db.commit()
    db.refresh(db_subtask)
    return db_subtask

@app.delete("/api/subtasks/{subtask_id}")
def delete_subtask(subtask_id: int, db: Session = Depends(get_db)):
    db_subtask = db.query(models.Subtask).filter(models.Subtask.id == subtask_id).first()
    if db_subtask is None:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    db.delete(db_subtask)
    db.commit()
    return {"message": "Subtask deleted successfully"}

# Attachments endpoints
@app.post("/api/tasks/{task_id}/attachments", response_model=schemas.AttachmentResponse)
def create_attachment(task_id: int, attachment: schemas.AttachmentCreate, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.deleted_at.is_(None)).first()
    if db_task is None:
        raise HTTPException(status_code=404, detail="Task not found or is in trash")
    
    db_attachment = models.Attachment(**attachment.model_dump(), task_id=task_id)
    db.add(db_attachment)
    db.commit()
    db.refresh(db_attachment)
    return db_attachment

@app.delete("/api/attachments/{attachment_id}")
def delete_attachment(attachment_id: int, db: Session = Depends(get_db)):
    db_attachment = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if db_attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    db.delete(db_attachment)
    db.commit()
    return {"message": "Attachment deleted successfully"}

@app.post("/api/seed")
def seed_data(db: Session = Depends(get_db)):
    if db.query(models.Task).filter(models.Task.deleted_at.is_(None)).count() > 0:
        return {"message": "Database already contains tasks. Seed skipped."}
    
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    day2 = now + datetime.timedelta(days=2)
    day_minus_1 = now - datetime.timedelta(days=1)
    
    t1 = models.Task(title="Design Dashboard", status="DONE", priority="HIGH", project="UI/UX", progress=100, due_date=day_minus_1)
    t2 = models.Task(title="Implement API", status="IN_PROGRESS", priority="HIGH", project="Backend", progress=40, due_date=now)
    t3 = models.Task(title="Write tests", status="TODO", priority="MEDIUM", project="QA", due_date=day2)
    t4 = models.Task(title="Fix CSS bugs", status="BACKLOG", priority="LOW", project="Frontend")
    t5 = models.Task(title="Legacy refactor", status="CANCELED", priority="LOW", project="Tech Debt", due_date=now)
    
    db.add_all([t1, t2, t3, t4, t5])
    db.commit()

    # Subtasks
    s1 = models.Subtask(title="Audit current screens", done=True, task_id=t1.id)
    s2 = models.Subtask(title="Sketch new flow", done=False, task_id=t1.id)
    s3 = models.Subtask(title="Hi-fi mockups", done=False, task_id=t1.id)
    db.add_all([s1, s2, s3])
    
    # Attachments
    a1 = models.Attachment(name="Brief.pdf", task_id=t1.id)
    a2 = models.Attachment(name="Research notes", task_id=t1.id)
    db.add_all([a1, a2])
    
    db.commit()
    return {"message": "Sample data seeded"}

# Mount static files LAST so it does not shadow API routes
app.mount("/static", StaticFiles(directory="static"), name="static")
