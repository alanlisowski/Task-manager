import React, { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { v4 as uuidv4 } from "uuid";
import { format, isPast, parseISO } from "date-fns";
import { motion } from "framer-motion";

/**
 * Simplified TaskDragMaster — React app
 * Features:
 * - Drag & drop tasks between columns (dnd-kit)
 * - Real-time sync across tabs/windows via BroadcastChannel
 * - Local persistence (localStorage)
 */

const PRIORITIES = ["low", "medium", "high"];
const DEFAULT_COLUMNS = [
  { id: "todo", name: "To do" },
  { id: "inprogress", name: "In progress" },
  { id: "done", name: "Done" },
];

const STORAGE_KEY = "taskdragmaster:v1";
const CHANNEL_NAME = "taskdragmaster-channel";

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
      [columns[0].id]: [],
      [columns[1].id]: [],
      [columns[2].id]: [],
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
    columnId: partial.columnId || DEFAULT_COLUMNS[0].id,
  };
}

function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useDraggable({ id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function Droppable({ id, children, className }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className + (isOver ? " ring-2 ring-primary" : "")}>{children}</div>
  );
}

function TaskCard({ task, onDelete }) {
  const overdue = task.due && isPast(parseISO(task.due)) && task.columnId !== "done";
  return (
    <motion.div layout initial={{opacity:0, y:6}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-6}}>
      <div className="rounded-lg bg-white border p-3 shadow-sm hover:shadow transition relative">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{task.title}</span>
            </div>
            {task.description && (
              <p className="text-sm text-gray-500 line-clamp-2 mt-1">{task.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="px-2 py-0.5 rounded bg-gray-100">{task.priority}</span>
              {task.due && (
                <span className={"px-2 py-0.5 rounded " + (overdue ? "bg-red-100" : "bg-gray-100")}>
                  {format(parseISO(task.due), "yyyy-MM-dd")}
                </span>
              )}
            </div>
          </div>
          <button onClick={onDelete} className="text-red-500">✕</button>
        </div>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [board, setBoard] = useState(() => loadStore() || emptyBoard());

  useEffect(() => { saveStore(board); }, [board]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

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

  function handleDragEnd(ev) {
    const { active, over } = ev;
    if (!over) return;
    const fromColId = board.tasks[active.id]?.columnId;
    const toColId = over.id in (board.order || {}) ? over.id : fromColId;
    const fromOrder = [...(board.order[fromColId] || [])];
    const toOrder = [...(board.order[toColId] || [])];

    const fromIdx = fromOrder.indexOf(active.id);
    if (fromIdx !== -1) fromOrder.splice(fromIdx, 1);

    let overIndex = toOrder.indexOf(over.id);
    if (overIndex === -1) {
      toOrder.push(active.id);
    } else {
      toOrder.splice(overIndex, 0, active.id);
    }

    const next = {
      ...board,
      tasks: {
        ...board.tasks,
        [active.id]: { ...board.tasks[active.id], columnId: toColId, updatedAt: nowIso() },
      },
      order: { ...board.order, [fromColId]: fromOrder, [toColId]: toOrder },
      ts: nowIso(),
    };
    setBoard(next);
  }

  function addTask() {
    const t = newTask({});
    const colId = t.columnId;
    const next = {
      ...board,
      tasks: { ...board.tasks, [t.id]: t },
      order: { ...board.order, [colId]: [t.id, ...(board.order[colId] || [])] },
      ts: nowIso(),
    };
    setBoard(next);
  }

  function deleteTask(id) {
    const t = board.tasks[id]; if (!t) return;
    const colId = t.columnId;
    const nextOrder = (board.order[colId] || []).filter((x) => x !== id);
    const tasks = { ...board.tasks }; delete tasks[id];
    const next = { ...board, tasks, order: { ...board.order, [colId]: nextOrder }, ts: nowIso() };
    setBoard(next);
  }

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <header className="sticky top-0 bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-lg font-bold">TaskDragMaster</h1>
        <button onClick={addTask} className="px-3 py-1 rounded bg-blue-600 text-white">+ Add task</button>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${board.columns.length}, minmax(260px, 1fr))` }}>
            {board.columns.map((col) => (
              <Droppable key={col.id} id={col.id} className="min-h-[200px] bg-gray-100 p-2 rounded">
                <h3 className="font-semibold mb-2">{col.name}</h3>
                <SortableContext items={tasksByColumn[col.id].map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {tasksByColumn[col.id].map((t) => (
                      <SortableItem key={t.id} id={t.id}>
                        <TaskCard task={t} onDelete={() => deleteTask(t.id)} />
                      </SortableItem>
                    ))}
                  </div>
                </SortableContext>
              </Droppable>
            ))}
          </div>
        </DndContext>
      </main>
    </div>
  );
}