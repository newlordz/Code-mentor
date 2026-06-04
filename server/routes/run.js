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

  const isWin = process.platform === 'win32';

  const runner = {
    python:     { ext: '.py' },
    javascript: { cmd: 'node',         ext: '.js' },
    typescript: { cmd: 'npx ts-node',  ext: '.ts' },
    go:         { cmd: 'go run',       ext: '.go' },
    cpp:        { ext: '.cpp' },
    csharp:     { ext: '.cs' },
  };

  const cfg = runner[language];
  if (!cfg) return res.status(400).json({ error: 'Language not supported natively yet' });

  // Create a temporary file inside project root so ts-node/modules are resolved correctly
  const tmpDir = path.join(__dirname, '..', '..', '.tmp');
  const filename = `code_${Date.now()}_${Math.random().toString(36).slice(2)}${cfg.ext}`;
  const filepath = path.join(tmpDir, filename);
  const filepathQ = `"${filepath}"`;

  // Build execution command per language
  let execCmd;
  if (language === 'python') {
    execCmd = isWin
      ? `python ${filepathQ} 2>&1 || py ${filepathQ}`
      : `python3 ${filepathQ} 2>/dev/null || python ${filepathQ}`;
  } else if (language === 'cpp') {
    const binPath = filepath.replace('.cpp', isWin ? '.exe' : '.out');
    const binQ = `"${binPath}"`;
    const compiler = isWin ? 'g++' : 'g++';
    execCmd = `${compiler} ${filepathQ} -o ${binQ} -std=c++17 && ${binQ}`;
  } else if (language === 'csharp') {
    // Try dotnet-script first, fall back to csc (Mono)
    execCmd = isWin
      ? `dotnet-script ${filepathQ} 2>&1`
      : `dotnet-script ${filepathQ} 2>/dev/null || csc ${filepathQ} && mono ${filepathQ.replace('.cs', '.exe')}`;
  } else {
    execCmd = `${cfg.cmd} ${filepathQ}`;
  }

  try {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(filepath, code);

    exec(execCmd, { timeout: 10000 }, (error, stdout, stderr) => {
      // Clean up temp files
      fs.unlink(filepath).catch(() => {});
      if (language === 'cpp') {
        const binPath = filepath.replace('.cpp', isWin ? '.exe' : '.out');
        fs.unlink(binPath).catch(() => {});
      }

      if (error) {
        if (error.killed) {
          return res.json({ stderr: 'Execution timed out (10 seconds limit)' });
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
