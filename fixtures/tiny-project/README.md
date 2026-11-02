# Tiny Tasks

A tiny TypeScript task tracker for learning how to explore a repository.

## What it does

- Adds a task with a title.
- Marks a task as completed.
- Lists the tasks that are still open.

## Project structure

- `package.json`: project name and version; this fixture has no external dependencies.
- `src/tasks.ts`: the Task type and the addTask, completeTask, and listOpenTasks functions.

This fixture is intentionally small. The Lesson 1 agent reads and explains it;
it does not need to edit files or run shell commands.

## Next learning step

Add a test for completing a task that does not exist. Decide whether the function
should return unchanged tasks or report an error before changing its behavior.
