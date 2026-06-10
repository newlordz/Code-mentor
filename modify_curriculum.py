import re

filepath = r"c:\Users\NEWLORDZ\Desktop\code mentor\code mentor\public\index.html"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Let's find cpp:{, csharp:{, sql:{, rust:
for key in ["cpp", "csharp", "sql", "rust"]:
    matches = list(re.finditer(r'\b' + key + r'\s*:\s*\{', content))
    print(f"Key: {key}, count: {len(matches)}")
    if matches:
        start = max(0, matches[0].start() - 100)
        end = min(len(content), matches[0].end() + 100)
        print(f"Around {key}:")
        chunk = content[start:end]
        print(repr(chunk.encode('ascii', 'ignore').decode('ascii')))
        print("-" * 50)
