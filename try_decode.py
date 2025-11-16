from pathlib import Path
s = Path(r"e:\decode\assembled.txt").read_text(encoding='utf-8', errors='ignore')
print('length', len(s))
# Try split into 2-digit bytes
b2 = ''.join(chr(int(s[i:i+2])) for i in range(0, len(s)-1, 2) if 0<=int(s[i:i+2])<256)
print('\n-- as 2-digit bytes head --')
print(b2[:1000])
# Try 3-digit bytes
b3 = ''.join(chr(int(s[i:i+3])) for i in range(0, len(s)-2, 3) if 0<=int(s[i:i+3])<1114112)
print('\n-- as 3-digit codepoints head --')
print(b3[:1000])
# Try splitting by known markers like '1234567890' present
if '1234567890' in s:
    idx = s.find('1234567890')
    print('\nfound marker at', idx)
    print(s[idx-50:idx+50])
# Try extracting only digits groups of length 6 and map to bytes via hex
vals = [s[i:i+6] for i in range(0, len(s), 6)]
print('\nFirst 20 6-digit groups:')
print(vals[:20])
# Write some samples
Path(r"e:\decode\try_2byte.txt").write_text(b2[:5000], encoding='utf-8')
Path(r"e:\decode\try_3byte.txt").write_text(b3[:5000], encoding='utf-8')
print('\nWrote try files')
