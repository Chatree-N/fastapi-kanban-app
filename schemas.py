from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class TaskStatus(str, Enum):
    BACKLOG = "BACKLOG"
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"
    CANCELED = "CANCELED"

class TaskPriority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

class SubtaskBase(BaseModel):
    title: str
    done: bool = False

class SubtaskCreate(SubtaskBase):
    pass

class SubtaskUpdate(BaseModel):
    title: Optional[str] = None
    done: Optional[bool] = None

class SubtaskResponse(SubtaskBase):
    id: int
    task_id: int
    model_config = ConfigDict(from_attributes=True)

class AttachmentBase(BaseModel):
    name: str

class AttachmentCreate(AttachmentBase):
    pass

class AttachmentResponse(AttachmentBase):
    id: int
    task_id: int
    model_config = ConfigDict(from_attributes=True)

class TaskBase(BaseModel):
    title: str = Field(min_length=1)
    description: Optional[str] = None
    status: Optional[TaskStatus] = TaskStatus.TODO
    priority: Optional[TaskPriority] = TaskPriority.MEDIUM
    due_date: Optional[datetime] = None
    project: Optional[str] = "Inbox"
    progress: Optional[int] = Field(default=0, ge=0, le=100)

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: str = Field(min_length=1)
    description: Optional[str] = None
    status: TaskStatus
    priority: TaskPriority
    due_date: Optional[datetime] = None
    project: Optional[str] = "Inbox"
    progress: Optional[int] = Field(default=0, ge=0, le=100)

class TaskPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None
    project: Optional[str] = None
    progress: Optional[int] = Field(default=None, ge=0, le=100)

class TaskResponse(TaskBase):
    id: int
    created_at: datetime
    deleted_at: Optional[datetime] = None
    subtasks: List[SubtaskResponse] = []
    attachments: List[AttachmentResponse] = []

    model_config = ConfigDict(from_attributes=True)
