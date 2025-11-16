import re
from pathlib import Path
p = Path(r"e:\decode\decode")
s = p.read_text(encoding='utf-8', errors='ignore')
# Pattern: ['value',.float];['index']; or ['value','something'];['index'];
pattern = re.compile(r"\['([^']*)'\s*,[^\]]*\];\s*\['(\d+)'\];")
matches = pattern.findall(s)
print(f"Found {len(matches)} pairs")
mapping = {}
for val, idx in matches:
    mapping[int(idx)] = val
if not mapping:
    print('No mapping found by primary pattern; trying alternate pattern')
    pattern2 = re.compile(r"\['([^']*)'\];\s*\['(\d+)'\];")
    matches2 = pattern2.findall(s)
    print(f"Found {len(matches2)} pairs with alternate pattern")
    for val, idx in matches2:
        mapping[int(idx)] = val
# Assemble in order
if mapping:
    max_idx = max(mapping.keys())
    seq = []
    missing = []
    for i in range(max_idx+1):
        if i in mapping:
            seq.append(mapping[i])
        else:
            missing.append(i)
            seq.append('')
    assembled = ''.join(seq)
    outp = Path(r"e:\decode\assembled.txt")
    outp.write_text(assembled, encoding='utf-8')
    print(f"Assembled length: {len(assembled)}; missing indices: {len(missing)}")
    print('\n--- Start head of assembled ---')
    print(assembled[:2000])
    print('\n--- End head of assembled ---')
else:
    print('No assembled mapping produced')
