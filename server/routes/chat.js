const express = require('express');
const router = express.Router();
const { default: ollama } = require('ollama');

// POST /api/chat
router.post('/', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Call local Ollama model
    const response = await ollama.chat({
      model: 'dolphin-llama3',
      messages: [{ role: 'user', content: message }],
    });

    res.json({ reply: response.message.content });
  } catch (error) {
    console.error('Error communicating with Ollama:', error.message);
    res.status(500).json({ error: 'Failed to generate AI response. Is Ollama running?' });
  }
});

module.exports = router;
