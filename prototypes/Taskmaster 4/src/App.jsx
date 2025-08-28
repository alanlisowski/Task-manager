import React, { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { format, parseISO, isPast } from "date-fns";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, CalendarDays, List, Plus, Trash2, Tag, Search, GripVertical } from "lucide-react";
import classNames from "classnames";

const STORAGE_KEY = "tdm:board:v2";
const DEFAULT_COLUMNS = [
  { id: "todo", name: "To Do" },
  { id: "inprogress", name: "In Progress" },
  { id: "done", name: "Done" },
];

function nowIso() { return new Date().toISOString(); }

function loadBoard() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveBoard(b) { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); }

function emptyBoard() {
  const cols = DEFAULT_COLUMNS.map(c => ({...c}));
  const order = {};
  cols.forEach(c => order[c.id] = []);
  return { id: "main", name: "Board", columns: cols, tasks: {}, order, ts: nowIso() };
}

/* Column component that registers as droppable */
function Column({ col, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div ref={setNodeRef} id={col.id} className={classNames("min-h-[200px] p-3 rounded-md", { "ring-2 ring-offset-2 ring-indigo-300": isOver })}>
      {children}
    </div>
  );
}

/* Sortable Task component with a dedicated drag handle */
function SortableTask({ id, task, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 40 : "auto",
  };
  const overdue = task.due && isPast(parseISO(task.due)) && task.status !== "done";

  return (
    <div ref={setNodeRef} style={style}>
      <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="card flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 w-full">
          {/* drag handle - attach listeners/attributes here */}
          <div {...attributes} {...listeners} className="p-2 rounded cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700">
            <GripVertical size={16} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm truncate">{task.title}</h4>
              <span className={classNames("text-xs px-2 py-0.5 rounded-full", {
                "bg-red-100 text-red-700": task.priority === "high",
                "bg-yellow-100 text-yellow-800": task.priority === "medium",
                "bg-green-100 text-green-700": task.priority === "low",
              })}>{task.priority}</span>
              {task.tag && <span className="ml-1 inline-flex items-center text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded"><Tag size={12} className="mr-1"/> {task.tag}</span>}
            </div>
            {task.description && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-3">{task.description}</p>}
            <div className="flex items-center gap-2 mt-2 text-xs">
              {task.due && <span className={classNames("px-2 py-0.5 rounded", { 'bg-red-100 text-red-700': overdue, 'bg-gray-100 text-gray-700': !overdue })}>{format(parseISO(task.due), "yyyy-MM-dd")}</span>}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 items-center">
          <button onPointerDown={(e)=>e.stopPropagation()} onClick={() => onEdit(task)} className="text-indigo-600 text-sm">Edit</button>
          <button onPointerDown={(e)=>e.stopPropagation()} onClick={() => onDelete(task.id)} className="text-red-500 text-sm"><Trash2 size={14}/></button>
        </div>
      </motion.div>
    </div>
  );
}

/* Modal component */
function TaskModal({ open, initial, onClose, onSave }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [desc, setDesc] = useState(initial?.description || "");
  const [priority, setPriority] = useState(initial?.priority || "medium");
  const [due, setDue] = useState(initial?.due ? initial.due.split("T")[0] : "");
  const [tag, setTag] = useState(initial?.tag || "");
  const firstRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || "");
      setDesc(initial?.description || "");
      setPriority(initial?.priority || "medium");
      setDue(initial?.due ? initial.due.split("T")[0] : "");
      setTag(initial?.tag || "");
      setTimeout(() => firstRef.current?.focus(), 60);
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
    if (!title.trim()) return alert("Title required");
    onSave({
      id: initial?.id,
      title: title.trim(),
      description: desc.trim(),
      priority,
      due: due ? new Date(due).toISOString() : "",
      tag: tag.trim(),
      status: initial?.status || "todo",
    });
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3 className="text-lg font-semibold mb-2">{initial ? "Edit task" : "New task"}</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium">Title</label>
            <input ref={firstRef} value={title} onChange={e => setTitle(e.target.value)} className="w-full mt-1 p-2 border rounded bg-white dark:bg-gray-700" />
          </div>
          <div>
            <label className="text-xs font-medium">Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full mt-1 p-2 border rounded bg-white dark:bg-gray-700" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full mt-1 p-2 border rounded bg-white dark:bg-gray-700">
                {["low","medium","high"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Due date</label>
              <input type="date" value={due} onChange={e => setDue(e.target.value)} className="w-full mt-1 p-2 border rounded bg-white dark:bg-gray-700" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Tag</label>
            <input value={tag} onChange={e => setTag(e.target.value)} className="w-full mt-1 p-2 border rounded bg-white dark:bg-gray-700" placeholder="Work, Personal..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1 rounded border">Cancel</button>
            <button type="submit" className="px-3 py-1 rounded bg-indigo-600 text-white">{initial ? "Save" : "Create"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [board, setBoard] = useState(() => loadBoard() || emptyBoard());
  const [dark, setDark] = useState(() => localStorage.getItem("tdm:dark")==="1");
  const [view, setView] = useState("board"); // board | calendar
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState("");
  const [filterTag, setFilterTag] = useState("");

  useEffect(() => { saveBoard(board); }, [board]);
  useEffect(() => { localStorage.setItem("tdm:dark", dark ? "1" : "0"); document.documentElement.classList.toggle("dark", dark); }, [dark]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const allTags = useMemo(() => {
    const t = new Set();
    Object.values(board.tasks).forEach(x => { if (x.tag) t.add(x.tag); });
    return Array.from(t);
  }, [board.tasks]);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(board.tasks).filter(t => {
      if (filterTag && t.tag !== filterTag) return false;
      if (q) {
        return (t.title||"").toLowerCase().includes(q) || (t.description||"").toLowerCase().includes(q) || (t.tag||"").toLowerCase().includes(q);
      }
      return true;
    });
  }, [board.tasks, filterTag, query]);

  /* tasks grouped by column considering filters */
  const tasksByCol = useMemo(() => {
    const map = {};
    board.columns.forEach(c => map[c.id] = []);
    board.columns.forEach(col => {
      const order = board.order[col.id] || [];
      order.forEach(id => {
        const t = board.tasks[id];
        if (t && filteredTasks.includes(t)) map[col.id].push(t);
      });
    });
    return map;
  }, [board, filteredTasks]);

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(task) { setEditing(task); setModalOpen(true); }

  function saveTask(taskPartial) {
    const isEdit = !!taskPartial.id && !!board.tasks[taskPartial.id];
    const id = taskPartial.id || uuidv4();
    const task = { ...(board.tasks[id]||{}), ...taskPartial, id, updatedAt: nowIso(), createdAt: (board.tasks[id]?.createdAt)||nowIso(), status: taskPartial.status || (board.tasks[id]?.status) || "todo" };
    const next = { ...board, tasks: { ...board.tasks, [id]: task }, ts: nowIso() };
    if (!isEdit) {
      next.order = { ...board.order, todo: [id, ...(board.order.todo||[])] };
    }
    setBoard(next);
  }

  function deleteTask(id) {
    if (!confirm("Delete task?")) return;
    const t = board.tasks[id]; if (!t) return;
    const newTasks = { ...board.tasks }; delete newTasks[id];
    const newOrder = { ...board.order };
    Object.keys(newOrder).forEach(k => newOrder[k] = newOrder[k].filter(x => x !== id));
    setBoard({ ...board, tasks: newTasks, order: newOrder, ts: nowIso() });
  }

  function handleDragEnd(e) {
    const { active, over } = e;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;
    // find source col
    const sourceCol = Object.keys(board.order).find(col => (board.order[col]||[]).includes(activeId));
    // determine destination col
    let destCol = sourceCol;
    if (board.order[overId]) destCol = overId;
    else if (board.tasks[overId]) destCol = board.tasks[overId].status;
    // remove from source
    const sourceOrder = [...(board.order[sourceCol]||[])].filter(x => x !== activeId);
    const destOrder = [...(board.order[destCol]||[])];
    // if same column and dropped over a task -> reorder
    if (sourceCol === destCol && board.tasks[overId]) {
      const oldIndex = (board.order[sourceCol]||[]).indexOf(activeId);
      const newIndex = destOrder.indexOf(overId);
      destOrder.splice(oldIndex, 1);
      destOrder.splice(newIndex, 0, activeId);
    } else {
      // if dropped on a specific task, insert before it
      if (board.tasks[overId]) {
        const idx = destOrder.indexOf(overId);
        if (idx === -1) destOrder.push(activeId);
        else destOrder.splice(idx, 0, activeId);
      } else {
        // dropped on column container -> append
        destOrder.push(activeId);
      }
    }
    const updatedTasks = { ...board.tasks, [activeId]: { ...board.tasks[activeId], status: destCol, updatedAt: nowIso() } };
    const next = { ...board, tasks: updatedTasks, order: { ...board.order, [sourceCol]: sourceOrder, [destCol]: destOrder }, ts: nowIso() };
    setBoard(next);
  }

  /* Calendar tile content */
  function tileContent({ date }) {
    const day = format(date, "yyyy-MM-dd");
    const dayTasks = Object.values(board.tasks).filter(t => t.due && t.due.startsWith(day));
    if (!dayTasks.length) return null;
    return (
      <ul className="text-xs space-y-0.5">
        {dayTasks.slice(0,3).map(t => <li key={t.id} className="truncate max-w-[8rem]">{t.title}</li>)}
        {dayTasks.length > 3 && <li className="text-gray-400">+{dayTasks.length-3} more</li>}
      </ul>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="bg-white dark:bg-gray-800 border-b sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-100 dark:bg-indigo-900 grid place-items-center font-bold text-indigo-700 dark:text-indigo-200">TD</div>
            <div>
              <h1 className="text-lg font-semibold">TaskDragMaster Pro</h1>
              <p className="text-xs text-gray-500 dark:text-gray-300">Kanban + Calendar • Tags • Dark mode</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center border rounded px-2 py-1 gap-2 bg-gray-50 dark:bg-gray-700">
              <Search size={14} className="text-gray-500"/>
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search..." className="bg-transparent outline-none text-sm" />
            </div>

            <select value={filterTag} onChange={e=>setFilterTag(e.target.value)} className="border rounded px-2 py-1 bg-white dark:bg-gray-700 text-sm">
              <option value="">All tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <button onClick={()=>setView(view==="board"?"calendar":"board")} title="Toggle view" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              {view==="board" ? <CalendarDays/> : <List/>}
            </button>

            <button onClick={()=>{ setDark(d => !d); }} title="Toggle dark" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              {dark ? <Sun/> : <Moon/>}
            </button>

            <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded">
              <Plus size={14}/> Add Task
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        {view === "board" ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${board.columns.length}, minmax(260px, 1fr))` }}>
              {board.columns.map(col => (
                <Column key={col.id} col={col}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">{col.name}</h3>
                    <span className="text-xs text-gray-600 dark:text-gray-300">{(board.order[col.id]||[]).length}</span>
                  </div>
                  <SortableContext items={(board.order[col.id]||[])} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {(tasksByCol[col.id]||[]).map(t => (
                        <SortableTask key={t.id} id={t.id} task={t} onEdit={openEdit} onDelete={deleteTask} />
                      ))}
                    </div>
                  </SortableContext>
                </Column>
              ))}
            </div>
          </DndContext>
        ) : (
          <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
            <Calendar tileContent={tileContent} />
          </div>
        )}
      </main>

      <AnimatePresence>
        {modalOpen && <TaskModal open={modalOpen} initial={editing} onClose={()=>setModalOpen(false)} onSave={saveTask} />}
      </AnimatePresence>

      <footer className="text-center text-xs text-gray-500 py-6">Built with React, dnd-kit, Tailwind • Improved UI</footer>
    </div>
  );
}
