from pathlib import Path
p = Path(r"e:\decode\decrypted_output.html")
s = p.read_text(encoding='utf-8', errors='ignore')
s2 = s.replace('https://babypredictor.in/user/Game/api.php','http://localhost:3000/user/Game/api.php')
Path(r"e:\decode\decrypted_output_local.html").write_text(s2, encoding='utf-8')
print('Wrote e:\\decode\\decrypted_output_local.html (size', len(s2), ')')
