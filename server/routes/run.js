const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Verify JWT for abuse prevention
const authMiddleware = require('../middleware/auth');

router.post('/', authMiddleware, async (req, res) => {
  const { language, code } = req.body;
  if (!code) return res.status(400).json({ error: 'No code provided' });

  // Map our language names to CLI commands and extensions
  const runner = {
    python:     { cmd: 'python3', ext: '.py' },
    javascript: { cmd: 'node',    ext: '.js' },
    typescript: { cmd: 'npx ts-node', ext: '.ts' },
    go:         { cmd: 'go run',  ext: '.go' },
  };

  const cfg = runner[language];
  if (!cfg) return res.status(400).json({ error: 'Language not supported natively yet' });

  // Create a temporary file
  const tmpDir = os.tmpdir();
  const filename = `code_${Date.now()}_${Math.random().toString(36).slice(2)}${cfg.ext}`;
  const filepath = path.join(tmpDir, filename);

  try {
    await fs.writeFile(filepath, code);
    
    exec(`${cfg.cmd} ${filepath}`, { timeout: 5000 }, (error, stdout, stderr) => {
      // Clean up the temp file
      fs.unlink(filepath).catch(() => {});

      if (error) {
        if (error.killed) {
          return res.json({ stderr: 'Execution timed out (5 seconds limit)' });
        }
        return res.json({ stderr: stderr || error.message });
      }
      res.json({ stdout: stdout });
    });

  } catch (err) {
    res.status(500).json({ error: 'Internal server error while writing file' });
  }
});

module.exports = router;
