import { loadEnv } from '../infrastructure/config/env.js';
import { createApp } from './app.js';

const env = loadEnv();
const app = createApp(env);

app.listen(env.PORT, () => {
  console.log(`Financia API em http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
