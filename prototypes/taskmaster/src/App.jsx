import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { v4 as uuidv4 } from "uuid";
import { format, isPast, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

/*
  TaskDragMaster — Modal Edition
  - Modal popup for adding/editing tasks
  - Drag & drop between columns
  - Local persistence (localStorage)
  - Tailwind styling
*/

const STORAGE_KEY = "taskdragmaster:v1";
const DEFAULT_COLUMNS = [
  { id: "todo", name: "To do" },
  { id: "inprogress", name: "In progress" },
  { id: "done", name: "Done" },
];
const PRIORITIES = ["low", "medium", "high"];

function nowIso() {
  return new Date().toISOString();
}

function loadStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function saveStore(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function emptyBoard() {
  const columns = DEFAULT_COLUMNS.map((c) => ({ ...c }));
  return {
    id: "default",
    name: "My Board",
    columns,
    tasks: {},
    order: {
      todo: [],
      inprogress: [],
      done: [],
    },
    ts: nowIso(),
  };
}

function newTask(partial = {}) {
  const id = uuidv4();
  return {
    id,
    title: partial.title || "New task",
    description: partial.description || "",
    priority: partial.priority || "medium",
    due: partial.due || "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    columnId: partial.columnId || "todo",
  };
}

/* Draggable item using low-level useDraggable */
function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useDraggable({ id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : "auto",
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

/* Column droppable area */
function Droppable({ id, children, className }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? "ring-2 ring-offset-2 ring-indigo-300" : ""}`}>
      {children}
    </div>
  );
}

/* Task card */
function TaskCard({ task, onEdit, onDelete }) {
  const overdue = task.due && isPast(parseISO(task.due)) && task.columnId !== "done";
  return (
    <motion.div layout initial={{opacity:0, y:6}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-6}}>
      <div className="card flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm truncate">{task.title}</h4>
            <span className="text-xs px-2 py-0.5 rounded text-gray-600 bg-gray-100">{task.priority}</span>
          </div>
          {task.description && <p className="text-xs text-gray-500 line-clamp-2 mt-1">{task.description}</p>}
          <div className="flex items-center gap-2 mt-2 text-xs">
            {task.due && (
              <span className={`px-2 py-0.5 rounded ${overdue ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                {format(parseISO(task.due), "yyyy-MM-dd")}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 items-center">
          <button onClick={() => onEdit(task)} className="text-indigo-600 text-sm">Edit</button>
          <button onClick={() => onDelete(task.id)} className="text-red-500 text-sm">Delete</button>
        </div>
      </div>
    </motion.div>
  );
}

/* Modal for add/edit task */
function TaskModal({ open, initial, onClose, onSave }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [priority, setPriority] = useState(initial?.priority || "medium");
  const [due, setDue] = useState(initial?.due ? initial.due.split("T")[0] : "");
  const firstRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || "");
      setDescription(initial?.description || "");
      setPriority(initial?.priority || "medium");
      setDue(initial?.due ? initial.due.split("T")[0] : "");
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open, initial]);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return alert("Title is required");
    const task = {
      id: initial?.id || undefined,
      title: title.trim(),
      description: description.trim(),
      priority,
      due: due ? new Date(due).toISOString() : "",
      columnId: initial?.columnId || "todo",
    };
    onSave(task);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3 className="text-lg font-semibold mb-2">{initial ? "Edit task" : "New task"}</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium">Title</label>
            <input ref={firstRef} value={title} onChange={(e) => setTitle(e.target.value)} className="w-full mt-1 p-2 border rounded" placeholder="Task title" required />
          </div>
          <div>
            <label className="text-xs font-medium">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full mt-1 p-2 border rounded" rows={3} placeholder="Details (optional)"></textarea>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full mt-1 p-2 border rounded">
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Due date</label>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-full mt-1 p-2 border rounded" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1 rounded border">Cancel</button>
            <button type="submit" className="px-3 py-1 rounded bg-indigo-600 text-white">{initial ? "Save" : "Create"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [board, setBoard] = useState(() => loadStore() || emptyBoard());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { saveStore(board); }, [board]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  /* Derived tasks by column for rendering */
  const tasksByColumn = useMemo(() => {
    const map = {};
    for (const col of board.columns) map[col.id] = [];
    for (const col of board.columns) {
      const order = board.order[col.id] || [];
      for (const id of order) {
        const t = board.tasks[id];
        if (t) map[col.id].push(t);
      }
    }
    return map;
  }, [board]);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(task) {
    setEditing(task);
    setModalOpen(true);
  }

  function saveTask(taskPartial) {
    // If editing existing task -> update
    const isEdit = !!taskPartial.id && !!board.tasks[taskPartial.id];
    const id = taskPartial.id || uuidv4();
    const task = {
      ...(board.tasks[id] || {}),
      ...taskPartial,
      id,
      updatedAt: nowIso(),
      createdAt: (board.tasks[id]?.createdAt) || nowIso(),
    };

    const next = { ...board, tasks: { ...board.tasks, [id]: task }, ts: nowIso() };
    if (!isEdit) {
      // add to todo at top
      next.order = { ...board.order, todo: [id, ...(board.order.todo || [])] };
    }
    setBoard(next);
  }

  function deleteTask(id) {
    const t = board.tasks[id];
    if (!t) return;
    if (!confirm("Delete this task?")) return;
    const colId = t.columnId;
    const nextOrder = (board.order[colId] || []).filter(x => x !== id);
    const tasks = { ...board.tasks }; delete tasks[id];
    setBoard({ ...board, tasks, order: { ...board.order, [colId]: nextOrder }, ts: nowIso() });
  }

  function handleDragEnd(ev) {
    const { active, over } = ev;
    if (!over) return;
    // from column
    const fromColId = board.tasks[active.id]?.columnId;
    let toColId = fromColId;
    // If dropped on a column container (over.id equals column id)
    if (board.order[over.id]) {
      toColId = over.id;
    } else if (board.tasks[over.id]) {
      toColId = board.tasks[over.id].columnId;
    } else {
      toColId = fromColId;
    }

    const fromOrder = [...(board.order[fromColId] || [])].filter(x => x !== active.id);
    const toOrder = [...(board.order[toColId] || [])];

    // If dropping on a specific task, insert before it
    if (board.tasks[over.id] && board.tasks[over.id].id !== active.id) {
      const idx = toOrder.indexOf(over.id);
      if (idx === -1) toOrder.push(active.id);
      else toOrder.splice(idx, 0, active.id);
    } else {
      // append to end
      toOrder.push(active.id);
    }

    const nextTasks = {
      ...board.tasks,
      [active.id]: { ...board.tasks[active.id], columnId: toColId, updatedAt: nowIso() },
    };
    const next = { ...board, tasks: nextTasks, order: { ...board.order, [fromColId]: fromOrder, [toColId]: toOrder }, ts: nowIso() };
    setBoard(next);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-100 grid place-items-center font-bold text-indigo-700">TD</div>
            <div>
              <h1 className="text-lg font-semibold">TaskDragMaster</h1>
              <p className="text-xs text-gray-500">Drag • Drop • Done — modal task input</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={openNew} className="px-3 py-1 rounded bg-indigo-600 text-white">+ Add task</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${board.columns.length}, minmax(260px, 1fr))` }}>
            {board.columns.map(col => (
              <Droppable key={col.id} id={col.id} className="min-h-[200px] p-3 rounded-md bg-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">{col.name}</h3>
                  <span className="text-xs text-gray-600">{(board.order[col.id] || []).length}</span>
                </div>
                <div className="space-y-3">
                  {(tasksByColumn[col.id] || []).map(t => (
                    <SortableItem key={t.id} id={t.id}>
                      <TaskCard task={t} onEdit={openEdit} onDelete={deleteTask} />
                    </SortableItem>
                  ))}
                </div>
              </Droppable>
            ))}
          </div>
        </DndContext>
      </main>

      <AnimatePresence>
        {modalOpen && (
          <TaskModal
            open={modalOpen}
            initial={editing}
            onClose={() => setModalOpen(false)}
            onSave={(t) => saveTask(t)}
          />
        )}
      </AnimatePresence>

      <footer className="text-center text-xs text-gray-500 py-6">Built with React, dnd-kit, Tailwind</footer>
    </div>
  );
}
