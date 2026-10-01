# FastAPI Kanban App

A minimalist, aesthetically pleasing Kanban board and To-Do list web application built with a Python backend and a lightweight Vanilla JavaScript frontend.

![Kanban Dashboard Preview](https://via.placeholder.com/1200x600.png?text=FastAPI+Kanban+Dashboard)

## 🌟 Features

- **Drag & Drop Kanban Board**: Organize tasks across Backlog, To Do, In Progress, and Done.
- **Task Management**: Create, edit, and delete tasks instantly.
- **Slide-over Detail Panel**: Manage subtasks, track progress, and view attachments in a sleek side modal.
- **Calendar View**: A visual month-grid view to see when tasks are due.
- **Smart Filtering**: Filter the board by day of the week to focus on what matters now.
- **Undo functionality**: Accidentally deleted a task? Get it back with a 4.5-second undo toast.
- **Local Settings**: User preferences (like compact mode and showing the week selector) are saved to your browser.

## 🛠️ Tech Stack

- **Backend**: [FastAPI](https://fastapi.tiangolo.com/), Python 3, SQLAlchemy, SQLite (for lightweight local data storage).
- **Frontend**: Plain HTML, Vanilla JavaScript, and [Tailwind CSS](https://tailwindcss.com/) (via CDN for styling).

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Chatree-N/fastapi-kanban-app.git
   cd fastapi-kanban-app
   ```

2. **Create a virtual environment (Recommended)**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the server**
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   
5. **Open your browser**  
   Navigate to [http://127.0.0.1:8000](http://127.0.0.1:8000) to view the app!

### 🌱 Seed Sample Data
If you want to populate the app with some mock data (subtasks, attachments, and due dates) to see how it looks, simply run:
```bash
curl -X POST http://127.0.0.1:8000/api/seed
```
*(Make sure the server is running when you execute this)*

## 📂 Project Structure

- `main.py` - Core FastAPI application and endpoint definitions.
- `models.py` - SQLAlchemy database models (`Task`, `Subtask`, `Attachment`).
- `schemas.py` - Pydantic models for data validation and serialization.
- `database.py` - SQLite database engine and session configuration.
- `static/index.html` - The single-page frontend structure and Tailwind styling.
- `static/app.js` - Client-side logic handling UI state, API calls, and drag-and-drop.

## 📝 License

This project is open-source and available under the [MIT License](LICENSE).
