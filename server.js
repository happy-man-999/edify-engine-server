import express from 'express';
import cors from 'cors';
import solana from './routes/solana.js';
import stripe from './routes/stripe.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from the server!' });
});
app.use('/api/solana', solana);
app.use('/api/stripe', stripe);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});