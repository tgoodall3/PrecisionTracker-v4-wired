import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import OpenAI from 'openai';

const router = express.Router();
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const openai = hasOpenAI ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Helper to safely parse model JSON
function safeJson(s, fallback){ try { return JSON.parse(s); } catch { return fallback; } }

router.post('/estimate-suggest', requireAuth(), async (req, res) => {
  const { notes = '' } = req.body;
  if (hasOpenAI) {
    try {
      const prompt = 'You are a contracting estimator. From these field notes, return helpful estimate line items as a JSON array with fields: description (string), qty (number), unitPrice (number). Notes: ' + notes;
      const rsp = await openai.responses.create({
        model: 'gpt-4.1-mini',
        input: prompt
      });
      const text = rsp.output_text || '';
      const items = safeJson(text, []);
      if (Array.isArray(items) && items.length) return res.json({ items });
    } catch (e) {
      console.error('OpenAI error:', e.message);
    }
  }
  // fallback mock
  const lower = notes.toLowerCase();
  const items = [];
  if(lower.includes('paint')) items.push({ description: 'Interior painting (per room)', qty: 1, unitPrice: 350 });
  if(lower.includes('drywall')) items.push({ description: 'Drywall patch/repair', qty: 1, unitPrice: 200 });
  if(lower.includes('floor')) items.push({ description: 'Floor prep & non-slip coating', qty: 1, unitPrice: 800 });
  if(items.length===0) items.push({ description: 'General labor', qty: 8, unitPrice: 45 });
  res.json({ items });
});

router.post('/scope-summary', requireAuth(), async (req, res) => {
  const { notes = '' } = req.body;
  if (hasOpenAI) {
    try {
      const prompt = 'Summarize these contractor field notes into 3-5 client-friendly sentences. Notes: ' + notes;
      const rsp = await openai.responses.create({ model: 'gpt-4.1-mini', input: prompt });
      const text = rsp.output_text || '';
      if (text) return res.json({ summary: text.trim() });
    } catch (e) { console.error('OpenAI error:', e.message); }
  }
  const summary = 'Scope of work: ' + (notes.slice(0, 400)) + (notes.length>400?'...':'');
  res.json({ summary });
});

router.post('/materials-checklist', requireAuth(), async (req, res) => {
  const { items = [] } = req.body;
  if (hasOpenAI) {
    try {
      const prompt = 'Given these estimate line items, produce a succinct materials checklist as a JSON array of strings. Items: ' + JSON.stringify(items);
      const rsp = await openai.responses.create({ model: 'gpt-4.1-mini', input: prompt });
      const text = rsp.output_text || '[]';
      const materials = safeJson(text, []);
      return res.json({ materials });
    } catch (e) { console.error('OpenAI error:', e.message); }
  }
  const materials = items.map(it => 'Materials for: ' + it.description).slice(0, 20);
  res.json({ materials });
});

export default router;