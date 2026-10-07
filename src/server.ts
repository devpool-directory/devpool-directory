import express from 'express';
import { healthCheck } from './controllers/health';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Plugin Health Monitor Endpoint
app.get('/health', healthCheck);

app.listen(port, () => {
  console.log(`DevPool Directory listening on port ${port}`);
});
