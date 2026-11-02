export interface Task {
  id: number;
  title: string;
  completed: boolean;
}

export function addTask(tasks: Task[], title: string): Task[] {
  const id = Math.max(0, ...tasks.map((task) => task.id)) + 1;
  return [...tasks, { id, title, completed: false }];
}

export function completeTask(tasks: Task[], id: number): Task[] {
  return tasks.map((task) => (task.id === id ? { ...task, completed: true } : task));
}

export function listOpenTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => !task.completed);
}
