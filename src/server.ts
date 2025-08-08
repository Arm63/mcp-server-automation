import 'dotenv/config'; // loads .env automatically
import express from 'express';
import testcaseRoutes from './routes/test-cases';

const app = express();

app.use(express.json({ limit: '200kb' }));

// Basic health
app.get('/', (req, res) => {
  res.send('🎉 MCP Server is LIVE!');
});

// Mount API routes under /api
app.use('/api', testcaseRoutes);

// Basic 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MCP Server running on http://localhost:${PORT}`);
});
