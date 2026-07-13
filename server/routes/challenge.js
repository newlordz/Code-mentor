const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const authMiddleware = require('../middleware/auth');

const TEST_CASES_FILENAME = 'testdata.json';

function generateTestHarness(language, userCode, functionName, testDataPath) {
  const tdp = JSON.stringify(testDataPath);

  const harnesses = {
    python: `
import json, sys, traceback, os

# User code
${userCode}

# Test harness
with open(${tdp}, 'r') as f:
    test_cases = json.load(f)

results = []
for tc in test_cases:
    inp = tc.get("input", [])
    exp = tc.get("expected")
    try:
        actual = ${functionName}(*inp)
        passed = json.dumps(actual, default=str) == json.dumps(exp, default=str)
        results.append({"input": inp, "expected": exp, "actual": actual, "passed": passed, "error": None})
    except Exception as e:
        results.append({"input": inp, "expected": exp, "actual": None, "passed": False, "error": traceback.format_exc()})
print("CHALLENGE_RESULTS:" + json.dumps(results, default=str))
`,

    javascript: `
// User code
${userCode}

// Test harness
const fs = require('fs');
const testCases = JSON.parse(fs.readFileSync(${tdp}, 'utf-8'));
const results = testCases.map(tc => {
    try {
        const inp = tc.input || [];
        const expected = tc.expected;
        const actual = ${functionName}(...inp);
        const passed = JSON.stringify(actual) === JSON.stringify(expected);
        return { input: inp, expected, actual, passed, error: null };
    } catch (e) {
        return { input: tc.input, expected: tc.expected, actual: null, passed: false, error: e.message };
    }
});
console.log("CHALLENGE_RESULTS:" + JSON.stringify(results));
`,

    typescript: `
// User code
${userCode}

// Test harness
import * as fs from 'fs';
const testCases: any[] = JSON.parse(fs.readFileSync(${tdp}, 'utf-8'));
const results = testCases.map((tc: any) => {
    try {
        const inp = tc.input || [];
        const expected = tc.expected;
        const actual = ${functionName}(...inp);
        const passed = JSON.stringify(actual) === JSON.stringify(expected);
        return { input: inp, expected, actual, passed, error: null };
    } catch (e: any) {
        return { input: tc.input, expected: tc.expected, actual: null, passed: false, error: e.message };
    }
});
console.log("CHALLENGE_RESULTS:" + JSON.stringify(results));
`,

    go: `package main

import (
    "encoding/json"
    "fmt"
    "os"
)

// User code
${userCode}

func main() {
    data, _ := os.ReadFile(${tdp})
    var testCases []map[string]interface{}
    json.Unmarshal(data, &testCases)

    type Result struct {
        Input    interface{} "json:\\"input\\""
        Expected interface{} "json:\\"expected\\""
        Actual   interface{} "json:\\"actual\\""
        Passed   bool        "json:\\"passed\\""
        Error    interface{} "json:\\"error\\""
    }

    var results []Result
    for _, tc := range testCases {
        var r Result
        r.Input = tc["input"]
        r.Expected = tc["expected"]
        r.Actual = nil
        r.Passed = false
        r.Error = "Go auto-grading not yet supported for this challenge"
        results = append(results, r)
    }
    out, _ := json.Marshal(results)
    fmt.Println("CHALLENGE_RESULTS:" + string(out))
    os.Exit(0)
}
`,

    cpp: `#include <iostream>
#include <string>
#include <fstream>

// User code
${userCode}

int main() {
    std::cout << "CHALLENGE_RESULTS:" << R"([{"passed":false,"error":"C++ auto-grading: manual verification only"}])" << std::endl;
    return 0;
}
`,

    csharp: `
using System;
using System.Text.Json;
using System.Collections.Generic;

// User code
${userCode}

class ChallengeRunner {
    static void Main() {
        var result = new List<object> {
            new { passed = false, error = "C# auto-grading: manual verification only" }
        };
        Console.WriteLine("CHALLENGE_RESULTS:" + JsonSerializer.Serialize(result));
    }
}
`,
  };

  return harnesses[language] || harnesses.javascript;
}

router.post('/test', authMiddleware, async (req, res) => {
  const { language, code, functionName, testCases } = req.body;
  if (!code || !functionName || !testCases) {
    return res.status(400).json({ error: 'code, functionName, and testCases are required' });
  }

  const runner = {
    python:     { ext: '.py' },
    javascript: { cmd: 'node',         ext: '.js' },
    typescript: { cmd: 'npx ts-node',  ext: '.ts' },
    go:         { cmd: 'go run',       ext: '.go' },
    cpp:        { ext: '.cpp' },
    csharp:     { ext: '.cs' },
  };

  const cfg = runner[language];
  if (!cfg) return res.status(400).json({ error: 'Language not supported for challenges' });

  const isWin = process.platform === 'win32';
  const tmpDir = path.join(__dirname, '..', '..', '.tmp');
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const testDataFile = path.join(tmpDir, `${TEST_CASES_FILENAME}.${uid}`);
  const codeFile = path.join(tmpDir, `challenge_${uid}${cfg.ext}`);
  const codeFileQ = `"${codeFile}"`;
  const testDataFileQ = `"${testDataFile}"`;

  // Write test cases to a separate JSON file (avoid quoting issues)
  // Write code + harness with the path to the test data file
  const harness = generateTestHarness(language, code, functionName, testDataFileQ);

  let execCmd;
  if (language === 'python') {
    execCmd = isWin
      ? `python ${codeFileQ} 2>&1 || py ${codeFileQ}`
      : `python3 ${codeFileQ} 2>/dev/null || python ${codeFileQ}`;
  } else if (language === 'cpp') {
    const binPath = codeFile.replace('.cpp', isWin ? '.exe' : '.out');
    const binQ = `"${binPath}"`;
    execCmd = `${isWin ? 'g++' : 'g++'} ${codeFileQ} -o ${binQ} -std=c++17 && ${binQ}`;
  } else if (language === 'csharp') {
    execCmd = isWin
      ? `dotnet-script ${codeFileQ} 2>&1`
      : `dotnet-script ${codeFileQ} 2>/dev/null || csc ${codeFileQ} && mono ${codeFileQ.replace('.cs', '.exe')}`;
  } else {
    execCmd = `${cfg.cmd} ${codeFileQ}`;
  }

  try {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(testDataFile, JSON.stringify(testCases));
    await fs.writeFile(codeFile, harness);

    exec(execCmd, { timeout: 15000 }, (error, stdout, stderr) => {
      // Clean up both files
      fs.unlink(codeFile).catch(() => {});
      fs.unlink(testDataFile).catch(() => {});
      if (language === 'cpp') {
        const binPath = codeFile.replace('.cpp', isWin ? '.exe' : '.out');
        fs.unlink(binPath).catch(() => {});
      }

      if (error && !stdout.includes('CHALLENGE_RESULTS:')) {
        if (error.killed) {
          return res.json({ error: 'Execution timed out (15 seconds limit)', results: [] });
        }
        return res.json({ error: stderr || error.message, results: [] });
      }

      const match = stdout.match(/CHALLENGE_RESULTS:(.*)/s);
      if (match) {
        try {
          const results = JSON.parse(match[1].trim());
          return res.json({ results, error: null });
        } catch (e) {
          return res.json({ error: 'Failed to parse test results: ' + e.message, results: [] });
        }
      }

      res.json({ error: 'No test results returned', results: [], stdout });
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message, results: [] });
  }
});

module.exports = router;
