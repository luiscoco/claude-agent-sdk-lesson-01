# Lesson 1 classroom walkthrough

## Learning outcomes

After this lab, a student should be able to:

1. Explain what the host application supplies and what the agent loop does.
2. Choose the root package for a first Node.js query and recognize the other entry points.
3. Distinguish intermediate streamed messages from the final result.
4. Explain why version and API status give an example its context.

## Exercise 1 — Predict before running

Read the prompt in **Run the agent** and inspect the three fixture files. Write down:

- What does the host know before the run starts?
- Which files would an agent need to read?
- What would a useful final answer contain?

Run the guided demo. It is a fixed simulation, so everyone sees the same message sequence without paying for a model call.

**Expected evidence:** the student identifies the prompt, workspace, and configured capabilities as host responsibilities. The final answer should describe Tiny Tasks and its three task functions.

## Exercise 2 — Read the stream

Expand one `system`, one `assistant`, one `user`, and the `result` message.

1. Find an assistant tool request.
2. Find the corresponding tool result.
3. Identify the assistant message that appears just before the result.
4. Explain why that assistant message does not, by itself, prove that the query completed successfully.

**Expected evidence:** tool results can appear in a user-shaped SDK message. The final result reports the outcome; inspect the subtype and `is_error`. The UI displays selected fields, not every field in the full SDK message schema.

## Exercise 3 — Follow the imports

Open **Package map**, run `npm run package-map`, and read `src/examples/entry-points.ts`.

- Which entry does the first query use?
- Which entry is useful when choosing a more focused runtime surface?
- Why does `FileReadInput` use `import type`?
- Why does a browser UI not mean the root SDK should be bundled into browser JavaScript?

**Expected evidence:** the root is the first-query import; `/core` is the focused entry; `/sdk-tools` is type-only in the installed 0.3.310 manifest; this application's SDK query and key live on Node.js. The browser entry is a separate surface, not a reason to expose a server key.

## Exercise 4 — Read the smallest live example

Open `src/examples/first-query.ts`.

Locate the call to `query()`, the nested `options`, the `for await` loop, the result check, and `finally` cleanup. Explain each one without running a model.

If you have your own API key, enable live mode and try a focused variation, such as:

> Read src/tasks.ts. Explain what completeTask does when its ID is missing. Do not change files.

Compare the trace with your prediction. Real model output and message order can vary; the guided replay is not a promised transcript of every live run.

**Expected evidence:** the student distinguishes a task instruction from configuration, and can explain where tools and permissions enter the design without implementing later-lesson features.

## Exercise 5 — Version and status

Find the exact SDK dependency in `package.json` and inspect the version badge in the UI. Read the matching release notes.

Explain these distinctions:

- An installed export is not automatically a stability guarantee.
- An experimental API is not made stable by pinning the package.
- A historical example can communicate an idea while still needing migration before use.

**Expected evidence:** the student describes version context accurately and starts with the `query()` pattern covered in Lesson 1.

## Finish

Complete the four-question check and explain the host → agent → stream → result flow in your own words. The next lesson can extend this foundation with the core exports and custom tool contracts.
