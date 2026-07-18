## Summary

<!-- What changed and why -->

## Test plan

- [ ] If this PR changes task-loop DECIDE / termination logic (`apps/shaiden/src/run/task-loop.ts`, `step-assessment.ts`, `model-step.ts`, `prompts.ts`, `run-completion.ts`, `harness.ts`, `apps/shaiden/eval/`, or `packages/shared/src/run.ts`), confirm the **Shaiden termination eval** workflow (NAT-112) is green — or run `pnpm --filter @keidai/shaiden eval` locally (`OPEN_ROUTER_API_KEY` required).
