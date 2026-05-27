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

  const runner = {
    python:     { cmd: 'python3', ext: '.py' },
    javascript: { cmd: 'node',    ext: '.js' },
    typescript: { cmd: 'npx ts-node', ext: '.ts' },
    go:         { cmd: 'go run',  ext: '.go' },
  };

  const cfg = runner[language];
  if (!cfg) return res.status(400).json({ error: 'Language not supported natively yet' });

  // Create a temporary file inside project root so ts-node/modules are resolved correctly
  const tmpDir = path.join(__dirname, '..', '..', '.tmp');
  const filename = `code_${Date.now()}_${Math.random().toString(36).slice(2)}${cfg.ext}`;
  const filepath = path.join(tmpDir, filename);

  // Construct full execution command
  let execCmd = `${cfg.cmd} "${filepath}"`;
  if (language === 'python') {
    execCmd = `if command -v python3 >/dev/null 2>&1; then python3 "${filepath}"; else python "${filepath}"; fi`;
  }

  try {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(filepath, code);
    
    exec(execCmd, { timeout: 5000 }, (error, stdout, stderr) => {
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
