import { createServer } from "./create-server.js";

const port = Number(process.env.KEIDAI_UI_PORT ?? 3000);
const host = process.env.KEIDAI_UI_HOST ?? "127.0.0.1";

const app = await createServer({ mode: "production" });
await app.listen({ port, host });
console.log(`keidai-ui: http://${host}:${port}`);
